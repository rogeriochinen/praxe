import { env } from "cloudflare:workers";
import { impactAnalysisSchema, impactJsonSchema, suggestionAnalysisJsonSchema, suggestionAnalysisSchema, type ImpactAnalysis, type SuggestionAnalysis } from "./contracts";
import { promptCatalog } from "./prompts";

type CandidateProcess = { id: string; title: string; area: string; summary: string; dependencies: string[]; steps: { key: string; title: string; body: string }[] };
type AnalysisResult = { artifact: ImpactAnalysis; provenance: "OPENAI" | "LOCAL"; model: string; latencyMs: number; inputTokens?: number; outputTokens?: number };
type SuggestionAnalysisResult = Omit<AnalysisResult, "artifact"> & { artifact: SuggestionAnalysis };

function localImpactAnalysis(text: string, candidates: CandidateProcess[]): ImpactAnalysis {
  const lower = text.toLowerCase();
  const match = candidates.find((p) => [p.title, p.area, p.summary, ...p.steps.map((s) => `${s.title} ${s.body}`)].join(" ").toLowerCase().split(/\s+/).some((word) => word.length > 5 && lower.includes(word))) ?? null;
  const title = text.trim().split(/[.!?\n]/)[0].slice(0, 110) || "Novo insight operacional";
  return {
    title, summary: text.trim().slice(0, 500), primaryProcessId: match?.id ?? null, relatedProcessIds: [],
    routeStatus: match ? "MATCHED" : "UNMAPPED", affectedSteps: match?.steps.slice(0, 2).map((s) => s.key) ?? [],
    affectedDependencies: match?.dependencies.slice(0, 5) ?? [], newDependencies: [], possibleExceptions: [],
    currentVsProposed: { current: match ? `O processo ${match.title} segue a versão vigente.` : "O processo ainda não foi identificado.", proposed: text.trim() },
    swot: { strengths: ["Insight nasceu da operação real"], weaknesses: ["Impacto ainda não foi medido"], opportunities: ["Reduzir retrabalho e dependência do dono"], threats: ["Mudança sem piloto pode criar novas exceções"] },
    expectedImprovements: ["Maior clareza para a equipe", "Menos intervenção recorrente do dono"],
    impactDimensions: { time: ["Potencial redução de tempo, a validar no piloto"], cost: ["Impacto financeiro ainda não medido"], quality: ["Maior consistência, a validar"], risk: ["Mudança controlada reduz risco de adoção"], training: ["Pode exigir atualização da orientação da equipe"] },
    possibleWorsening: ["Nova dependência ou exceção não mapeada"], risksAndTradeoffs: ["Validar com quem executa antes de publicar"],
    evidence: [{ quote: text.trim().slice(0, 500), relevance: "Trecho original que motivou o insight." }],
    assumptions: ["A fala representa a operação atual"], openQuestions: match ? ["Qual indicador confirmará que a mudança funcionou?"] : ["Em qual área essa situação acontece?", "Quando o processo começa e termina?"],
    confidence: match ? "MEDIUM" : "LOW", recommendation: match ? "PILOT" : "NEED_MORE_INFO",
    rationale: match ? "Existe relação plausível com um processo mapeado, mas a mudança deve ser testada antes de alterar a versão oficial." : "Não há correspondência segura. O insight pode indicar uma lacuna ou um novo processo.",
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

function normalized(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");
}

function sanitizeImpactAnalysis(artifact: ImpactAnalysis, source: string, candidates: CandidateProcess[]): ImpactAnalysis {
  const processMap = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const primary = artifact.primaryProcessId ? processMap.get(artifact.primaryProcessId) ?? null : null;
  const sourceNormalized = normalized(source);
  const verifiedEvidence = artifact.evidence.filter((item) => sourceNormalized.includes(normalized(item.quote)));
  const evidence = verifiedEvidence.length ? verifiedEvidence : [{ quote: source.trim().slice(0, 500), relevance: "Trecho literal da fonte usado como ponto de partida; demais conclusões são inferências para validação humana." }];
  const allowedDependencies = new Set((primary?.dependencies ?? []).map(normalized));
  const relatedProcessIds = [...new Set(artifact.relatedProcessIds)].filter((id) => id !== primary?.id && processMap.has(id));
  const affectedSteps = primary ? [...new Set(artifact.affectedSteps)].filter((key) => primary.steps.some((step) => step.key === key)) : [];
  const affectedDependencies = artifact.affectedDependencies.filter((dependency) => allowedDependencies.has(normalized(dependency)));
  const confidence = verifiedEvidence.length === artifact.evidence.length && (primary || artifact.routeStatus !== "MATCHED") ? artifact.confidence : "LOW";
  const routeStatus = primary ? artifact.routeStatus : "UNMAPPED";
  return {
    ...artifact,
    primaryProcessId: primary?.id ?? null,
    relatedProcessIds,
    affectedSteps,
    affectedDependencies,
    evidence,
    confidence,
    routeStatus,
    recommendation: !primary && artifact.recommendation === "APPROVE" ? "NEED_MORE_INFO" : artifact.recommendation,
  };
}

export async function analyzeInsight(text: string, candidates: CandidateProcess[]): Promise<AnalysisResult> {
  const started = Date.now();
  const runtime = env as unknown as { OPENAI_API_KEY?: string; PROCESS_AI_MODEL?: string; AI_PROVIDER?: string };
  const model = runtime.PROCESS_AI_MODEL || "gpt-5.6";
  if (!runtime.OPENAI_API_KEY || runtime.AI_PROVIDER === "local") return { artifact: localImpactAnalysis(text, candidates), provenance: "LOCAL", model: "evidence-engine-v1", latencyMs: Date.now() - started };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { Authorization: `Bearer ${runtime.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, store: false, temperature: 0.2,
      input: [
        { role: "system", content: promptCatalog["P-05"].system },
        { role: "user", content: JSON.stringify({ SOURCE_DATA: { insight: text, allowedProcesses: candidates } }) },
      ],
      text: { format: { type: "json_schema", name: "impact_analysis", strict: true, schema: impactJsonSchema } },
    }),
  });
  if (!response.ok) throw new Error(`OPENAI_${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  const outputText = extractOutputText(payload);
  if (!outputText) throw new Error("OPENAI_INCOMPLETE");
  const artifact = sanitizeImpactAnalysis(impactAnalysisSchema.parse(JSON.parse(outputText)), text, candidates);
  const usage = payload.usage as Record<string, number> | undefined;
  return { artifact, provenance: "OPENAI", model, latencyMs: Date.now() - started, inputTokens: usage?.input_tokens, outputTokens: usage?.output_tokens };
}

export async function analyzeSuggestion(text: string, candidates: CandidateProcess[], processId: string, stepKey: string): Promise<SuggestionAnalysisResult> {
  const started = Date.now();
  const runtime = env as unknown as { OPENAI_API_KEY?: string; PROCESS_AI_MODEL?: string; AI_PROVIDER?: string };
  const model = runtime.PROCESS_AI_MODEL || "gpt-5.6";
  const process = candidates.find((candidate) => candidate.id === processId);
  const localBase = sanitizeImpactAnalysis(localImpactAnalysis(text, candidates), text, candidates);
  const localArtifact: SuggestionAnalysis = {
    ...localBase, primaryProcessId: processId, routeStatus: "MATCHED", affectedSteps: [stepKey], recommendation: "PILOT",
    testPlan: { worthTesting: true, feasibility: "MEDIUM", primaryMetric: "Tempo médio de execução da etapa", metricUnit: "minutos", desiredDirection: "DECREASE", baselineGuidance: "Meça o tempo da etapa antes de iniciar o piloto.", targetGuidance: "Defina a meta depois de conhecer o baseline, sem reduzir qualidade.", guardrailMetric: "Taxa de erros ou retrabalho não deve aumentar", suggestedDurationDays: 30, scope: `Teste controlado na etapa selecionada de ${process?.title ?? "processo mapeado"}.` },
  };
  if (!runtime.OPENAI_API_KEY || runtime.AI_PROVIDER === "local") return { artifact: localArtifact, provenance: "LOCAL", model: "evidence-engine-v1", latencyMs: Date.now() - started };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { Authorization: `Bearer ${runtime.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, store: false, temperature: 0.2,
      input: [
        { role: "system", content: promptCatalog["P-05S"].system },
        { role: "user", content: JSON.stringify({ SOURCE_DATA: { suggestion: text, processId, stepKey, allowedProcesses: candidates } }) },
      ],
      text: { format: { type: "json_schema", name: "suggestion_analysis", strict: true, schema: suggestionAnalysisJsonSchema } },
    }),
  });
  if (!response.ok) throw new Error(`OPENAI_${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  const outputText = extractOutputText(payload);
  if (!outputText) throw new Error("OPENAI_INCOMPLETE");
  const parsed = suggestionAnalysisSchema.parse(JSON.parse(outputText));
  const sanitized = sanitizeImpactAnalysis(parsed, text, candidates);
  const mismatch = parsed.primaryProcessId !== processId || !parsed.affectedSteps.includes(stepKey);
  const artifact: SuggestionAnalysis = { ...parsed, ...sanitized, primaryProcessId: processId, routeStatus: "MATCHED", affectedSteps: [stepKey], confidence: mismatch ? "LOW" : sanitized.confidence, recommendation: parsed.recommendation === "APPROVE" ? "PILOT" : parsed.recommendation };
  const usage = payload.usage as Record<string, number> | undefined;
  return { artifact, provenance: "OPENAI", model, latencyMs: Date.now() - started, inputTokens: usage?.input_tokens, outputTokens: usage?.output_tokens };
}

export async function transcribeAudio(file: File) {
  const runtime = env as unknown as { OPENAI_API_KEY?: string; TRANSCRIPTION_MODEL?: string };
  if (!runtime.OPENAI_API_KEY) return null;
  const form = new FormData(); form.set("file", file); form.set("model", runtime.TRANSCRIPTION_MODEL || "gpt-transcribe"); form.set("response_format", "json");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${runtime.OPENAI_API_KEY}` }, body: form });
  if (!response.ok) throw new Error(`TRANSCRIPTION_${response.status}`);
  const payload = await response.json() as { text?: string };
  return payload.text?.trim() || null;
}
