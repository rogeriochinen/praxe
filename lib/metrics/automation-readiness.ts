export type AutomationReadinessInput = {
  objective?: string | null;
  trigger?: string | null;
  ownerRole?: string | null;
  inputs?: string[] | null;
  steps?: Array<{
    title?: string | null;
    body?: string | null;
    ownerRole?: string | null;
    evidence?: Array<{ quote?: string | null; speaker?: string | null }> | null;
  }> | null;
  decisions?: string[] | null;
  exceptions?: string[] | null;
  outputs?: string[] | null;
  risks?: string[] | null;
  dependencies?: string[] | null;
  evidence?: Array<{ quote?: string | null; speaker?: string | null }> | null;
};

export type AutomationReadinessComponent = {
  key: "standardization" | "rules" | "data" | "exceptions" | "traceability";
  label: string;
  score: number;
  weight: number;
  description: string;
};

export type AutomationReadinessResult = {
  score: number;
  level: "LOW" | "MODERATE" | "HIGH";
  label: "Baixa" | "Moderada" | "Alta";
  version: "automation-readiness-v2";
  components: AutomationReadinessComponent[];
};

const PLACEHOLDER = /a confirmar|não informado|nao informado|não definido|nao definido|desconhecido|indefinido/i;
const DIGITAL_SIGNAL = /\b(api|app|aplicativo|automação|automacao|banco de dados|crm|erp|e-?mail|formulário|formulario|integração|integracao|planilha|plataforma|sistema|software|whatsapp)\b/i;

function list<T>(value: T[] | null | undefined) {
  return Array.isArray(value) ? value : [];
}

function concrete(value: string | null | undefined, minimum = 3) {
  const normalized = value?.trim() || "";
  return normalized.length >= minimum && !PLACEHOLDER.test(normalized);
}

function cappedCount(count: number, target: number) {
  return Math.min(1, count / target);
}

function percentage(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function calculateAutomationReadiness(process: AutomationReadinessInput): AutomationReadinessResult {
  const inputs = list(process.inputs);
  const steps = list(process.steps);
  const decisions = list(process.decisions);
  const exceptions = list(process.exceptions);
  const outputs = list(process.outputs);
  const risks = list(process.risks);
  const dependencies = list(process.dependencies);
  const evidence = list(process.evidence);
  const allText = [
    process.objective, process.trigger, process.ownerRole,
    ...inputs, ...outputs, ...dependencies,
    ...steps.flatMap((step) => [step.title, step.body, step.ownerRole]),
  ].filter(Boolean).join(" ");
  const stepEvidenceRatio = steps.length
    ? steps.filter((step) => list(step.evidence).some((item) => concrete(item.quote, 8))).length / steps.length
    : 0;
  const stepOwnerRatio = steps.length
    ? steps.filter((step) => concrete(step.ownerRole)).length / steps.length
    : 0;
  const placeholderPenalty = PLACEHOLDER.test(allText) ? 20 : 0;

  const components: AutomationReadinessComponent[] = [
    {
      key: "standardization",
      label: "Padronização",
      weight: 0.25,
      score: percentage(
        (concrete(process.objective, 8) ? 18 : 0)
        + (concrete(process.trigger, 5) ? 18 : 0)
        + (concrete(process.ownerRole) ? 16 : 0)
        + cappedCount(inputs.length, 2) * 12
        + cappedCount(outputs.length, 1) * 12
        + cappedCount(steps.length, 4) * 24,
      ),
      description: "Objetivo, gatilho, responsável, entradas, saídas e sequência de etapas estão definidos.",
    },
    {
      key: "rules",
      label: "Regras objetivas",
      weight: 0.2,
      score: percentage(
        cappedCount(decisions.length, 2) * 35
        + cappedCount(exceptions.length, 2) * 25
        + cappedCount(risks.length, 2) * 20
        + stepOwnerRatio * 20,
      ),
      description: "Decisões, responsáveis e condições de execução podem ser convertidos em regras verificáveis.",
    },
    {
      key: "data",
      label: "Dados e integrações",
      weight: 0.2,
      score: percentage(
        cappedCount(inputs.length, 2) * 25
        + cappedCount(outputs.length, 1) * 20
        + cappedCount(dependencies.length, 2) * 20
        + (DIGITAL_SIGNAL.test(allText) ? 35 : 0),
      ),
      description: "Entradas, saídas e sistemas envolvidos oferecem pontos de integração ou captura digital.",
    },
    {
      key: "exceptions",
      label: "Exceções controladas",
      weight: 0.15,
      score: percentage(
        cappedCount(decisions.length, 2) * 30
        + cappedCount(exceptions.length, 2) * 30
        + cappedCount(risks.length, 2) * 25
        + Math.max(0, 15 - placeholderPenalty),
      ),
      description: "Exceções e riscos estão explícitos, reduzindo a chance de uma automação falhar fora do fluxo ideal.",
    },
    {
      key: "traceability",
      label: "Rastreabilidade",
      weight: 0.2,
      score: percentage(
        cappedCount(evidence.filter((item) => concrete(item.quote, 8)).length, 2) * 30
        + stepEvidenceRatio * 45
        + stepOwnerRatio * 15
        + (evidence.some((item) => concrete(item.speaker)) ? 10 : 0),
      ),
      description: "O desenho está sustentado por evidências da entrevista e permite localizar responsáveis e origem das regras.",
    },
  ];

  const score = percentage(components.reduce((total, component) => total + component.score * component.weight, 0));
  return {
    score,
    level: score >= 70 ? "HIGH" : score >= 40 ? "MODERATE" : "LOW",
    label: score >= 70 ? "Alta" : score >= 40 ? "Moderada" : "Baixa",
    version: "automation-readiness-v2",
    components,
  };
}
