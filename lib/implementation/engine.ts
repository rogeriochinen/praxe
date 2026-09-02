import { env } from "cloudflare:workers";
import {
  calculateFounderDependency,
  implementationAnalysisSchema,
  implementationJsonSchema,
  type ImplementationAnalysis,
} from "./contracts";
import { implementationSystemPrompt } from "@/lib/ai/prompts";
import { calculateAutomationReadiness } from "@/lib/metrics/automation-readiness";
import { strengthenFounderAbsenceFindings } from "@/lib/implementation/founder-absence";
import { cleanTranscriptMarkup, normalizeOperationalProcess, operationalStepTitle, parseTranscriptSpeechLine } from "@/lib/implementation/operational-text";

export type ImplementationResult = {
  analysis: ImplementationAnalysis;
  dependency: ReturnType<typeof calculateFounderDependency>;
  provenance: "OPENAI" | "LOCAL";
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  fallbackReason?: string;
};

type ExistingProcessReference = { id: string; title: string; area: string; objective: string; trigger: string; outputs: string[] };

type Line = { speaker: string; text: string };

function compact(value: string, length = 500) {
  return value.replace(/\s+/g, " ").trim().slice(0, length);
}

function parsedLines(transcript: string): Line[] {
  const raw = transcript.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const lines = raw.map(parseTranscriptSpeechLine).filter((line) => line.text.length > 12);
  if (lines.length > 2) return lines;
  return transcript.split(/(?<=[.!?])\s+/).map((text) => ({ speaker: "Entrevista", text: compact(text, 900) })).filter((line) => line.text.length > 20);
}

const themes = [
  { title: "Atendimento e experiência do cliente", area: "Atendimento", pattern: /cliente|atendimento|reclama|suporte|chamado|responder/i },
  { title: "Vendas e entrada de clientes", area: "Comercial", pattern: /venda|proposta|comercial|lead|contrato|onboarding/i },
  { title: "Financeiro e pagamentos", area: "Financeiro", pattern: /caixa|pagamento|fornecedor|nota fiscal|financeir|cobrança|receber/i },
  { title: "Compras e abastecimento", area: "Operações", pattern: /compra|estoque|reposição|cotação|insumo/i },
  { title: "Gestão de demandas e projetos", area: "Operações", pattern: /demanda|projeto|pedido|ordem de serviço|prazo|entrega|produção/i },
  { title: "Produção e aprovação de entregáveis", area: "Produção", pattern: /briefing|design|arte|peça|campanha|revisão|aprova|publica|criativ/i },
  { title: "Execução da operação", area: "Operações", pattern: /processo|operação|execut|etapa|workflow|procedimento|faz assim/i },
  { title: "Pessoas e transferência de conhecimento", area: "Pessoas", pattern: /funcionário|equipe|treina|novo|contrata|pessoa|dono/i },
] as const;

export function analyzeImplementationLocally(transcript: string, suppliedCompanyName: string): ImplementationAnalysis {
  const lines = parsedLines(transcript);
  const evidence = (line: Line) => ({ quote: compact(line.text, 480), speaker: line.speaker });
  const riskLines = lines.filter((line) => /problema|erro|falha|atras|depende|dono|esque|manual|não tem|parar|risco|exceção/i.test(line.text));
  const decisionLines = lines.filter((line) => /aprova|decid|autoriza|valida|dono|responsável/i.test(line.text));
  const manualLines = lines.filter((line) => /manual|planilha|copiar|baixar|conferir|digitar|whatsapp|áudio/i.test(line.text));
  const processThemes = themes.map((theme) => ({ ...theme, lines: lines.filter((line) => theme.pattern.test(line.text)) })).filter((theme) => theme.lines.length);
  const selectedThemes = (processThemes.length ? processThemes : [{ ...themes[6], lines }]).slice(0, 8);

  const processes = selectedThemes.map((theme, processIndex) => {
    const source = theme.lines.slice(0, 6);
    const actionLines = source.filter((line) => /\b(faz|envia|confere|verifica|consulta|registra|aprova|paga|abre|fecha|valida|solicita|recebe|transforma|atualiza|agenda|prepara|analisa|acompanha|entrega)\w*/i.test(line.text));
    const chosen = actionLines.slice(0, 5);
    const gapEvidence = source[0] ? [evidence(source[0])] : [];
    return {
      title: theme.title,
      area: theme.area,
      objective: `Tornar explícita e repetível a rotina de ${theme.title.toLowerCase()}, preservando os critérios relatados na entrevista.`,
      trigger: compact(source[0]?.text || "Quando a rotina operacional precisa ser iniciada.", 220),
      ownerRole: decisionLines.find((line) => theme.pattern.test(line.text)) ? "Dono do processo (a confirmar)" : "Responsável da área (a confirmar)",
      inputs: manualLines.filter((line) => theme.pattern.test(line.text)).slice(0, 3).map((line) => compact(line.text, 160)),
      steps: (chosen.length ? chosen.map((line, stepIndex) => ({
        key: `p${processIndex + 1}-s${stepIndex + 1}`,
        title: operationalStepTitle(line.text, theme.title),
        body: cleanTranscriptMarkup(line.text),
        ownerRole: /dono|aprova|autoriza/i.test(line.text) ? "Dono / aprovador" : "Executor da área",
        evidence: [evidence(line)],
      })) : [{
        key: `p${processIndex + 1}-s1`,
        title: `Validar fluxo de ${theme.title.toLowerCase()}`,
        body: "A entrevista registrou contexto e riscos para esta rotina, mas não descreveu uma sequência executável completa. Detalhe as ações com o responsável antes de publicar.",
        ownerRole: "Responsável da área (a confirmar)",
        evidence: gapEvidence,
      }]),
      decisions: source.filter((line) => /aprova|decid|se |caso|quando/i.test(line.text)).slice(0, 4).map((line) => compact(line.text, 240)),
      exceptions: source.filter((line) => /erro|falha|problema|diferente|exceção|não /i.test(line.text)).slice(0, 4).map((line) => compact(line.text, 240)),
      outputs: [`Rotina de ${theme.title.toLowerCase()} concluída e verificável`],
      risks: riskLines.filter((line) => theme.pattern.test(line.text)).slice(0, 4).map((line) => compact(line.text, 240)),
      dependencies: manualLines.filter((line) => theme.pattern.test(line.text)).slice(0, 4).map((line) => compact(line.text, 200)),
      automationReadiness: Math.min(90, 35 + manualLines.filter((line) => theme.pattern.test(line.text)).length * 10 + chosen.length * 4),
      evidence: source.slice(0, 3).map(evidence),
    };
  });

  const topRisks = (riskLines.length ? riskLines : lines).slice(0, 5);
  const signals = {
    founderApprovals: Math.min(20, decisionLines.filter((line) => /dono|empresári|fundador/i.test(line.text)).length),
    founderOnlyKnowledge: Math.min(20, lines.filter((line) => /cabeça|lembrei|esqueci|eu sei|só eu|depende de mim/i.test(line.text)).length),
    undocumentedExceptions: Math.min(20, riskLines.filter((line) => /não tem|diferente|exceção|não está|antigo|escrito/i.test(line.text)).length),
    manualHandoffs: Math.min(20, manualLines.length),
    missingBackupOwners: Math.min(20, lines.filter((line) => /dono|empresári|fundador/i.test(line.text)).length),
  };

  const analysis = implementationAnalysisSchema.parse({
    companyName: compact(suppliedCompanyName || "Minha empresa", 100),
    companyContext: `A entrevista registrou ${lines.length} blocos de contexto e revelou ${processes.length} frentes operacionais candidatas. A estrutura abaixo foi montada somente com trechos presentes na conversa e precisa de validação humana.`,
    executiveSummary: `A operação possui conhecimento valioso distribuído em falas, decisões e exceções, mas parte relevante ainda depende de interpretação humana e do dono. O primeiro ganho é transformar esse conhecimento em ${processes.length} processos verificáveis, atribuir responsáveis e validar as exceções antes de automatizar.`,
    founderDependencySignals: signals,
    findings: topRisks.map((line, index) => ({
      title: index === 0 ? "Dependência de contexto operacional" : `Achado operacional ${index + 1}`,
      detail: compact(line.text, 620),
      severity: /dono|parar|falha|risco|erro/i.test(line.text) ? "HIGH" : "MEDIUM",
      evidence: [evidence(line)],
    })),
    processes,
    priorities: processes.slice(0, 3).map((process, index) => ({
      title: `Validar e delegar: ${process.title}`,
      whyNow: process.risks[0] || "Há conhecimento operacional capturado, mas ainda sem validação formal do responsável.",
      horizon: index === 0 ? "7_DAYS" : index === 1 ? "30_DAYS" : "90_DAYS",
      expectedOutcome: `Versão 1 de “${process.title}” validada, com dono, exceções e evidências.`,
    })),
    roadmap: [
      { period: "AGORA", actions: ["Revisar os processos candidatos com quem executa", "Confirmar donos e critérios de aprovação"] },
      { period: "PROXIMOS_30_DIAS", actions: ["Publicar versões 1 validadas", "Executar pilotos nos processos mais dependentes do dono"] },
      { period: "PROXIMOS_90_DIAS", actions: ["Medir aderência e tempo poupado", "Automatizar somente etapas estáveis e auditáveis"] },
    ],
    automationOpportunities: manualLines.slice(0, 5).map((line) => ({
      title: `Reduzir trabalho manual: ${compact(line.text, 80)}`,
      impact: "Pode reduzir repetição, espera e perda de contexto entre pessoas.",
      caution: "Automatizar somente depois de validar regra, exceções e evidência de conclusão.",
    })),
    openQuestions: [
      "Quem responde por cada processo quando o dono não está disponível?",
      "Qual evidência comprova que cada processo terminou corretamente?",
      "Quais exceções podem ser decididas sem escalar ao dono?",
    ],
  });
  return {
    ...analysis,
    processes: analysis.processes.map((process) => ({
      ...normalizeOperationalProcess(process),
      automationReadiness: calculateAutomationReadiness(process).score,
    })),
  };
}

function extractOutputText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output as Array<Record<string, unknown>>) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content as Array<Record<string, unknown>>) if (typeof part.text === "string") return part.text;
  }
  return null;
}

function fallbackCode(error: unknown) {
  if (!(error instanceof Error)) return "UNKNOWN_ANALYSIS_FAILURE";
  return error.message.replace(/[^A-Z0-9_:-]/gi, "_").slice(0, 120) || "UNKNOWN_ANALYSIS_FAILURE";
}

export async function analyzeImplementation(transcript: string, companyName: string, existingProcesses: ExistingProcessReference[] = []): Promise<ImplementationResult> {
  const started = Date.now();
  const runtime = env as unknown as { OPENAI_API_KEY?: string; PROCESS_AI_MODEL?: string; AI_PROVIDER?: string };
  if (!runtime.OPENAI_API_KEY || runtime.AI_PROVIDER === "local") {
    const analysis = strengthenFounderAbsenceFindings(analyzeImplementationLocally(transcript, companyName));
    return { analysis, dependency: calculateFounderDependency(analysis.founderDependencySignals), provenance: "LOCAL", model: "evidence-engine-v1", latencyMs: Date.now() - started };
  }
  const model = runtime.PROCESS_AI_MODEL || "gpt-5.6";
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${runtime.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        store: false,
        input: [
          { role: "system", content: implementationSystemPrompt },
          { role: "user", content: JSON.stringify({ SOURCE_DATA: { companyName, transcript, captureMode: existingProcesses.length ? "EXPANSION" : "INITIAL", existingProcesses }, TASK_RULES: existingProcesses.length ? ["Compare os candidatos com existingProcesses.", "Considere novo apenas um fluxo com gatilho ou resultado operacional distinto.", "Não copie etapas, fatos ou evidências do catálogo existente para preencher lacunas da nova captura.", "Se a fala complementar detalhar um processo existente, mantenha a evidência na análise, mas não renomeie o mesmo fluxo como novo."] : [] }) },
        ],
        text: { format: { type: "json_schema", name: "implementation_analysis", strict: true, schema: implementationJsonSchema } },
      }),
    });
    if (!response.ok) throw new Error(`OPENAI_ANALYSIS_${response.status}`);
    const payload = await response.json() as Record<string, unknown>;
    const outputText = extractOutputText(payload);
    if (!outputText) throw new Error("OPENAI_ANALYSIS_INCOMPLETE");
    const parsedAnalysis = implementationAnalysisSchema.parse(JSON.parse(outputText));
    const analysis = strengthenFounderAbsenceFindings({
      ...parsedAnalysis,
      processes: parsedAnalysis.processes.map((process) => ({
        ...normalizeOperationalProcess(process),
        automationReadiness: calculateAutomationReadiness(process).score,
      })),
    });
    const usage = payload.usage as Record<string, number> | undefined;
    return {
      analysis,
      dependency: calculateFounderDependency(analysis.founderDependencySignals),
      provenance: "OPENAI",
      model,
      latencyMs: Date.now() - started,
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens,
    };
  } catch (error) {
    const analysis = strengthenFounderAbsenceFindings(analyzeImplementationLocally(transcript, companyName));
    return {
      analysis,
      dependency: calculateFounderDependency(analysis.founderDependencySignals),
      provenance: "LOCAL",
      model: "evidence-engine-v1:fallback",
      latencyMs: Date.now() - started,
      fallbackReason: fallbackCode(error),
    };
  }
}
