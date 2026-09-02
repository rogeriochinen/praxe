import { z } from "zod";

const evidenceSchema = z.object({
  quote: z.string().min(8).max(600),
  speaker: z.string().max(80),
});

const stepSchema = z.object({
  key: z.string().min(1).max(80),
  title: z.string().min(3).max(120),
  body: z.string().min(8).max(700),
  ownerRole: z.string().min(2).max(100),
  evidence: z.array(evidenceSchema).max(3),
});

export const implementationAnalysisSchema = z.object({
  companyName: z.string().min(2).max(100),
  companyContext: z.string().min(20).max(1200),
  executiveSummary: z.string().min(30).max(1800),
  founderDependencySignals: z.object({
    founderApprovals: z.number().int().min(0).max(20),
    founderOnlyKnowledge: z.number().int().min(0).max(20),
    undocumentedExceptions: z.number().int().min(0).max(20),
    manualHandoffs: z.number().int().min(0).max(20),
    missingBackupOwners: z.number().int().min(0).max(20),
  }),
  findings: z.array(z.object({
    title: z.string().min(3).max(140),
    detail: z.string().min(8).max(700),
    severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
    evidence: z.array(evidenceSchema).min(1).max(3),
  })).min(1).max(10),
  processes: z.array(z.object({
    title: z.string().min(3).max(120),
    area: z.string().min(2).max(80),
    objective: z.string().min(8).max(600),
    trigger: z.string().min(3).max(300),
    ownerRole: z.string().min(2).max(100),
    inputs: z.array(z.string()).max(10),
    steps: z.array(stepSchema).min(1).max(16),
    decisions: z.array(z.string()).max(10),
    exceptions: z.array(z.string()).max(10),
    outputs: z.array(z.string()).max(10),
    risks: z.array(z.string()).max(10),
    dependencies: z.array(z.string()).max(10),
    automationReadiness: z.number().int().min(0).max(100),
    evidence: z.array(evidenceSchema).min(1).max(4),
  })).min(1).max(12),
  priorities: z.array(z.object({
    title: z.string().min(3).max(140),
    whyNow: z.string().min(8).max(600),
    horizon: z.enum(["7_DAYS", "30_DAYS", "90_DAYS"]),
    expectedOutcome: z.string().min(8).max(500),
  })).min(1).max(8),
  roadmap: z.array(z.object({
    period: z.enum(["AGORA", "PROXIMOS_30_DIAS", "PROXIMOS_90_DIAS"]),
    actions: z.array(z.string()).min(1).max(8),
  })).min(1).max(3),
  automationOpportunities: z.array(z.object({
    title: z.string().min(3).max(140),
    impact: z.string().min(8).max(500),
    caution: z.string().min(8).max(500),
  })).max(8),
  openQuestions: z.array(z.string()).max(12),
});

export type ImplementationAnalysis = z.infer<typeof implementationAnalysisSchema>;

const evidenceJson = {
  type: "object", additionalProperties: false, required: ["quote", "speaker"],
  properties: { quote: { type: "string" }, speaker: { type: "string" } },
} as const;

export const implementationJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["companyName", "companyContext", "executiveSummary", "founderDependencySignals", "findings", "processes", "priorities", "roadmap", "automationOpportunities", "openQuestions"],
  properties: {
    companyName: { type: "string" },
    companyContext: { type: "string" },
    executiveSummary: { type: "string" },
    founderDependencySignals: {
      type: "object", additionalProperties: false,
      required: ["founderApprovals", "founderOnlyKnowledge", "undocumentedExceptions", "manualHandoffs", "missingBackupOwners"],
      properties: {
        founderApprovals: { type: "integer", minimum: 0, maximum: 20 },
        founderOnlyKnowledge: { type: "integer", minimum: 0, maximum: 20 },
        undocumentedExceptions: { type: "integer", minimum: 0, maximum: 20 },
        manualHandoffs: { type: "integer", minimum: 0, maximum: 20 },
        missingBackupOwners: { type: "integer", minimum: 0, maximum: 20 },
      },
    },
    findings: {
      type: "array", minItems: 1, maxItems: 10,
      items: { type: "object", additionalProperties: false, required: ["title", "detail", "severity", "evidence"], properties: {
        title: { type: "string" }, detail: { type: "string" }, severity: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
        evidence: { type: "array", items: evidenceJson },
      } },
    },
    processes: {
      type: "array", minItems: 1, maxItems: 12,
      items: { type: "object", additionalProperties: false, required: ["title", "area", "objective", "trigger", "ownerRole", "inputs", "steps", "decisions", "exceptions", "outputs", "risks", "dependencies", "automationReadiness", "evidence"], properties: {
        title: { type: "string" }, area: { type: "string" }, objective: { type: "string" }, trigger: { type: "string" }, ownerRole: { type: "string" },
        inputs: { type: "array", items: { type: "string" } },
        steps: { type: "array", minItems: 1, maxItems: 16, items: { type: "object", additionalProperties: false, required: ["key", "title", "body", "ownerRole", "evidence"], properties: {
          key: { type: "string" }, title: { type: "string" }, body: { type: "string" }, ownerRole: { type: "string" }, evidence: { type: "array", items: evidenceJson },
        } } },
        decisions: { type: "array", items: { type: "string" } }, exceptions: { type: "array", items: { type: "string" } },
        outputs: { type: "array", items: { type: "string" } }, risks: { type: "array", items: { type: "string" } },
        dependencies: { type: "array", items: { type: "string" } }, automationReadiness: { type: "integer", minimum: 0, maximum: 100 },
        evidence: { type: "array", items: evidenceJson },
      } },
    },
    priorities: { type: "array", minItems: 1, maxItems: 8, items: { type: "object", additionalProperties: false, required: ["title", "whyNow", "horizon", "expectedOutcome"], properties: {
      title: { type: "string" }, whyNow: { type: "string" }, horizon: { type: "string", enum: ["7_DAYS", "30_DAYS", "90_DAYS"] }, expectedOutcome: { type: "string" },
    } } },
    roadmap: { type: "array", minItems: 1, maxItems: 3, items: { type: "object", additionalProperties: false, required: ["period", "actions"], properties: {
      period: { type: "string", enum: ["AGORA", "PROXIMOS_30_DIAS", "PROXIMOS_90_DIAS"] }, actions: { type: "array", minItems: 1, items: { type: "string" } },
    } } },
    automationOpportunities: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, required: ["title", "impact", "caution"], properties: {
      title: { type: "string" }, impact: { type: "string" }, caution: { type: "string" },
    } } },
    openQuestions: { type: "array", items: { type: "string" } },
  },
} as const;

export type FounderDependencyBreakdown = {
  score: number;
  version: "founder-dependency-v1";
  components: { key: string; label: string; value: number; weight: number }[];
};

export function calculateFounderDependency(signals: ImplementationAnalysis["founderDependencySignals"]): FounderDependencyBreakdown {
  const definitions = [
    ["founderApprovals", "Aprovações centralizadas", 0.3],
    ["founderOnlyKnowledge", "Conhecimento só com o dono", 0.3],
    ["undocumentedExceptions", "Exceções sem regra", 0.18],
    ["manualHandoffs", "Passagens manuais", 0.12],
    ["missingBackupOwners", "Ausência de substitutos", 0.1],
  ] as const;
  const components = definitions.map(([key, label, weight]) => ({
    key, label, weight, value: Math.min(100, Math.round((signals[key] / 8) * 100)),
  }));
  return {
    score: Math.min(100, Math.round(components.reduce((total, item) => total + item.value * item.weight, 0))),
    version: "founder-dependency-v1",
    components,
  };
}
