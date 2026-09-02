import type { ImplementationAnalysis } from "@/lib/implementation/contracts";

export const FOUNDER_ABSENCE_VERSION = "founder-absence-v2";

type Finding = ImplementationAnalysis["findings"][number];
type Process = ImplementationAnalysis["processes"][number];

const GENERIC_TITLE = /^(achado operacional|dependência de contexto operacional|problema operacional|risco operacional)(\s+\d+)?$/i;
const CONSEQUENCE = /par(a|ar)|interromp|atras|sem resposta|sem responsável|sem substitut|não acontece|fica pendente|perde|bloque/i;
const FOUNDER = /dono|dona|fundador|fundadora|empresári|aprovador|aprovação central/i;

function compact(value: string, max = 700) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function quality(finding: Finding, processTitles: string[]) {
  let score = 0;
  if (!GENERIC_TITLE.test(finding.title.trim())) score += 2;
  if (CONSEQUENCE.test(`${finding.title} ${finding.detail}`)) score += 2;
  if (processTitles.some((title) => finding.title.toLocaleLowerCase("pt-BR").includes(title.toLocaleLowerCase("pt-BR")))) score += 2;
  if (finding.detail.length >= 90) score += 1;
  if (finding.evidence.length) score += 2;
  if (finding.evidence[0] && compact(finding.detail) === compact(finding.evidence[0].quote)) score -= 2;
  if (GENERIC_TITLE.test(finding.title.trim())) score -= 3;
  return score;
}

function firstEvidence(process: Process) {
  return process.steps.flatMap((step) => step.evidence)[0] || process.evidence[0] || null;
}

function strongestSignal(process: Process) {
  return process.risks[0]
    || process.dependencies[0]
    || process.decisions[0]
    || process.exceptions[0]
    || process.steps[0]?.body
    || process.objective;
}

function deriveFinding(process: Process): Finding | null {
  const evidence = firstEvidence(process);
  if (!evidence) return null;
  const processText = [
    process.ownerRole,
    ...process.decisions,
    ...process.exceptions,
    ...process.risks,
    ...process.dependencies,
    ...process.steps.flatMap((step) => [step.ownerRole, step.body]),
  ].join(" ");
  const ownerDependent = FOUNDER.test(processText);
  const signal = compact(strongestSignal(process), 360);

  if (ownerDependent && process.decisions.length) return {
    title: `Aprovações de ${process.title} podem ficar sem resposta`,
    detail: `A versão mapeada concentra decisão ou validação no dono/aprovador. Na ausência dele, a etapa pode ficar pendente até que exista um substituto e uma regra de alçada. Ponto operacional registrado: ${signal}`,
    severity: "HIGH",
    evidence: [evidence],
  };
  if (ownerDependent && process.exceptions.length) return {
    title: `Exceções de ${process.title} podem parar a execução`,
    detail: `O processo depende do dono/aprovador para interpretar situações fora do fluxo normal. Sem uma regra de contingência, a equipe pode interromper ou escalar a execução. Ponto operacional registrado: ${signal}`,
    severity: "HIGH",
    evidence: [evidence],
  };
  if (ownerDependent) return {
    title: `${process.title} depende de uma referência substituta`,
    detail: `A entrevista vincula conhecimento, execução ou validação deste processo ao dono/aprovador. A continuidade por 30 dias precisa de responsável substituto, critério de conclusão e limite de decisão explícitos. Ponto operacional registrado: ${signal}`,
    severity: "HIGH",
    evidence: [evidence],
  };
  if (process.risks.length || process.dependencies.length) return {
    title: `Continuidade de ${process.title} ainda não está comprovada`,
    detail: `O mapa registra um risco ou dependência operacional, mas não comprova quem assume esse ponto durante a ausência do dono. A contingência deve ser validada antes da publicação. Ponto operacional registrado: ${signal}`,
    severity: "MEDIUM",
    evidence: [evidence],
  };
  return null;
}

export function strengthenFounderAbsenceFindings<T extends ImplementationAnalysis>(analysis: T): T & { founderAbsenceVersion: typeof FOUNDER_ABSENCE_VERSION } {
  const processTitles = analysis.processes.map((process) => process.title);
  const strongExisting = analysis.findings.filter((finding) => quality(finding, processTitles) >= 6);
  const targetLength = analysis.findings.length;
  if (strongExisting.length >= Math.min(3, targetLength)) {
    return { ...analysis, founderAbsenceVersion: FOUNDER_ABSENCE_VERSION };
  }

  const derived = analysis.processes
    .map(deriveFinding)
    .filter((finding): finding is Finding => Boolean(finding));
  const candidates = [...derived, ...analysis.findings]
    .sort((left, right) => quality(right, processTitles) - quality(left, processTitles));
  const selected: Finding[] = [];
  for (const finding of candidates) {
    const duplicate = selected.some((item) => item.title === finding.title || item.evidence[0]?.quote === finding.evidence[0]?.quote);
    if (!duplicate) selected.push(finding);
    if (selected.length === targetLength) break;
  }
  for (const finding of analysis.findings) {
    if (selected.length === targetLength) break;
    if (!selected.includes(finding)) selected.push(finding);
  }
  return { ...analysis, findings: selected, founderAbsenceVersion: FOUNDER_ABSENCE_VERSION };
}
