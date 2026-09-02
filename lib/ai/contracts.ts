import { z } from "zod";

export const impactAnalysisSchema = z.object({
  title: z.string().min(3).max(120),
  summary: z.string().min(3).max(600),
  primaryProcessId: z.string().nullable(),
  relatedProcessIds: z.array(z.string()).max(6).default([]),
  routeStatus: z.enum(["MATCHED", "AMBIGUOUS", "UNMAPPED"]),
  affectedSteps: z.array(z.string()).max(8),
  affectedDependencies: z.array(z.string()).max(8).default([]),
  newDependencies: z.array(z.string()).max(8).default([]),
  possibleExceptions: z.array(z.string()).max(8).default([]),
  currentVsProposed: z.object({ current: z.string(), proposed: z.string() }),
  swot: z.object({
    strengths: z.array(z.string()).max(6), weaknesses: z.array(z.string()).max(6),
    opportunities: z.array(z.string()).max(6), threats: z.array(z.string()).max(6),
  }),
  expectedImprovements: z.array(z.string()).max(8),
  impactDimensions: z.object({
    time: z.array(z.string()).max(5), cost: z.array(z.string()).max(5),
    quality: z.array(z.string()).max(5), risk: z.array(z.string()).max(5),
    training: z.array(z.string()).max(5),
  }).default({ time: [], cost: [], quality: [], risk: [], training: [] }),
  possibleWorsening: z.array(z.string()).max(8),
  risksAndTradeoffs: z.array(z.string()).max(8),
  evidence: z.array(z.object({ quote: z.string().max(500), relevance: z.string().max(300) })).max(8).default([]),
  assumptions: z.array(z.string()).max(8),
  openQuestions: z.array(z.string()).max(8),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  recommendation: z.enum(["APPROVE", "PILOT", "REJECT", "NEED_MORE_INFO"]),
  rationale: z.string().max(800),
});

export type ImpactAnalysis = z.infer<typeof impactAnalysisSchema>;

export const suggestionAnalysisSchema = impactAnalysisSchema.extend({
  testPlan: z.object({
    worthTesting: z.boolean(),
    feasibility: z.enum(["LOW", "MEDIUM", "HIGH"]),
    primaryMetric: z.string().min(3).max(240),
    metricUnit: z.string().min(1).max(60),
    desiredDirection: z.enum(["INCREASE", "DECREASE"]),
    baselineGuidance: z.string().max(400),
    targetGuidance: z.string().max(400),
    guardrailMetric: z.string().max(500),
    suggestedDurationDays: z.number().int().min(1).max(180),
    scope: z.string().max(500),
  }),
});

export type SuggestionAnalysis = z.infer<typeof suggestionAnalysisSchema>;

export const impactJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["title","summary","primaryProcessId","relatedProcessIds","routeStatus","affectedSteps","affectedDependencies","newDependencies","possibleExceptions","currentVsProposed","swot","expectedImprovements","impactDimensions","possibleWorsening","risksAndTradeoffs","evidence","assumptions","openQuestions","confidence","recommendation","rationale"],
  properties: {
    title: { type: "string" }, summary: { type: "string" }, primaryProcessId: { type: ["string","null"] },
    relatedProcessIds: { type: "array", items: { type: "string" } },
    routeStatus: { type: "string", enum: ["MATCHED","AMBIGUOUS","UNMAPPED"] }, affectedSteps: { type: "array", items: { type: "string" } },
    affectedDependencies: { type: "array", items: { type: "string" } }, newDependencies: { type: "array", items: { type: "string" } }, possibleExceptions: { type: "array", items: { type: "string" } },
    currentVsProposed: { type: "object", additionalProperties: false, required: ["current","proposed"], properties: { current: { type: "string" }, proposed: { type: "string" } } },
    swot: { type: "object", additionalProperties: false, required: ["strengths","weaknesses","opportunities","threats"], properties: { strengths: { type: "array", items: { type: "string" } }, weaknesses: { type: "array", items: { type: "string" } }, opportunities: { type: "array", items: { type: "string" } }, threats: { type: "array", items: { type: "string" } } } },
    expectedImprovements: { type: "array", items: { type: "string" } },
    impactDimensions: { type: "object", additionalProperties: false, required: ["time","cost","quality","risk","training"], properties: { time: { type: "array", items: { type: "string" } }, cost: { type: "array", items: { type: "string" } }, quality: { type: "array", items: { type: "string" } }, risk: { type: "array", items: { type: "string" } }, training: { type: "array", items: { type: "string" } } } },
    possibleWorsening: { type: "array", items: { type: "string" } }, risksAndTradeoffs: { type: "array", items: { type: "string" } },
    evidence: { type: "array", items: { type: "object", additionalProperties: false, required: ["quote","relevance"], properties: { quote: { type: "string" }, relevance: { type: "string" } } } },
    assumptions: { type: "array", items: { type: "string" } }, openQuestions: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["LOW","MEDIUM","HIGH"] }, recommendation: { type: "string", enum: ["APPROVE","PILOT","REJECT","NEED_MORE_INFO"] }, rationale: { type: "string" },
  },
} as const;

export const suggestionAnalysisJsonSchema = {
  ...impactJsonSchema,
  required: [...impactJsonSchema.required, "testPlan"],
  properties: {
    ...impactJsonSchema.properties,
    testPlan: {
      type: "object", additionalProperties: false,
      required: ["worthTesting", "feasibility", "primaryMetric", "metricUnit", "desiredDirection", "baselineGuidance", "targetGuidance", "guardrailMetric", "suggestedDurationDays", "scope"],
      properties: {
        worthTesting: { type: "boolean" }, feasibility: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
        primaryMetric: { type: "string" }, metricUnit: { type: "string" }, desiredDirection: { type: "string", enum: ["INCREASE", "DECREASE"] },
        baselineGuidance: { type: "string" }, targetGuidance: { type: "string" }, guardrailMetric: { type: "string" },
        suggestedDurationDays: { type: "integer", minimum: 1, maximum: 180 }, scope: { type: "string" },
      },
    },
  },
} as const;
