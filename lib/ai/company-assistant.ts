import { env } from "cloudflare:workers";
import { z } from "zod";
import { promptCatalog } from "@/lib/ai/prompts";

export type PublishedProcessReference = {
  processId: string;
  processTitle: string;
  area: string;
  versionId: string;
  versionNumber: number;
  summary: string;
  objective: string;
  trigger: string;
  steps: Array<{ key: string; title: string; body: string; ownerRole: string }>;
  decisions: string[];
  exceptions: string[];
  outputs: string[];
};

export type CompanyAssistantCitation = {
  processId: string;
  processTitle: string;
  versionId: string;
  versionNumber: number;
  stepKey: string | null;
  stepTitle: string | null;
  excerpt: string;
};

export type CompanyAssistantAnswer = {
  status: "ANSWERED" | "GAP" | "NEEDS_CLARIFICATION";
  answer: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  citations: CompanyAssistantCitation[];
  suggestedQuestions: string[];
  gapReason: string | null;
};

const companyAssistantAnswerSchema = z.object({
  status: z.enum(["ANSWERED", "GAP", "NEEDS_CLARIFICATION"]),
  answer: z.string().min(1).max(5000),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  citations: z.array(z.object({
    processId: z.string().min(1),
    processTitle: z.string().min(1),
    versionId: z.string().min(1),
    versionNumber: z.number().int().positive(),
    stepKey: z.string().nullable(),
    stepTitle: z.string().nullable(),
    excerpt: z.string().min(1).max(600),
  })).max(6),
  suggestedQuestions: z.array(z.string().min(1).max(300)).max(3),
  gapReason: z.string().max(1000).nullable(),
});

export type CompanyAssistantResult = {
  answer: CompanyAssistantAnswer;
  provenance: "OPENAI" | "LOCAL";
  model: string;
  promptVersion: string;
  latencyMs: number;
};

type ConversationTurn = { role: "USER" | "ASSISTANT"; content: string };
type RankedProcess = { process: PublishedProcessReference; score: number };

const STOP_WORDS = new Set([
  "a", "ao", "aos", "as", "como", "com", "da", "das", "de", "do", "dos", "e", "em", "eu", "o", "os", "ou", "para", "por", "qual", "que", "se", "um", "uma",
]);

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: string) {
  return [...new Set(normalized(value).split(" ").filter((token) => token.length >= 3 && !STOP_WORDS.has(token)))];
}

function termScore(source: string, terms: string[], weight: number) {
  const text = normalized(source);
  return terms.reduce((total, term) => total + (text.includes(term) ? weight : 0), 0);
}

function rankProcesses(question: string, processes: PublishedProcessReference[]): RankedProcess[] {
  const terms = tokens(question);
  return processes.map((process) => {
    const score = termScore(process.processTitle, terms, 8)
      + termScore(process.area, terms, 4)
      + termScore(`${process.summary} ${process.objective} ${process.trigger}`, terms, 3)
      + termScore(process.steps.map((step) => `${step.title} ${step.body}`).join(" "), terms, 2)
      + termScore([...process.decisions, ...process.exceptions, ...process.outputs].join(" "), terms, 2);
    return { process, score };
  }).sort((left, right) => right.score - left.score);
}

export function retrievePublishedProcesses(question: string, processes: PublishedProcessReference[]) {
  const ranked = rankProcesses(question, processes);
  const positive = ranked.filter((item) => item.score > 0).slice(0, 6);
  return positive.length ? positive : ranked.slice(0, Math.min(8, ranked.length));
}

function exactExcerpt(candidate: PublishedProcessReference, citation: CompanyAssistantCitation) {
  const sources = citation.stepKey
    ? candidate.steps.filter((step) => step.key === citation.stepKey).flatMap((step) => [step.title, step.body])
    : [candidate.summary, candidate.objective, candidate.trigger, ...candidate.decisions, ...candidate.exceptions, ...candidate.outputs];
  const excerpt = normalized(citation.excerpt);
  return excerpt.length >= 8 && sources.some((source) => normalized(source).includes(excerpt));
}

function sanitizeAnswer(answer: CompanyAssistantAnswer, allowed: PublishedProcessReference[]): CompanyAssistantAnswer {
  const citations = answer.citations.flatMap((citation) => {
    const process = allowed.find((item) => item.processId === citation.processId && item.versionId === citation.versionId && item.versionNumber === citation.versionNumber);
    if (!process || !exactExcerpt(process, citation)) return [];
    const step = citation.stepKey ? process.steps.find((item) => item.key === citation.stepKey) : null;
    if (citation.stepKey && !step) return [];
    return [{
      ...citation,
      processTitle: process.processTitle,
      stepTitle: step?.title ?? null,
      excerpt: citation.excerpt.trim().slice(0, 600),
    }];
  }).slice(0, 6);
  if (answer.status === "ANSWERED" && citations.length === 0) {
    return {
      status: "GAP",
      answer: "Não encontrei evidência suficiente nos processos oficiais para responder com segurança.",
      confidence: "LOW",
      citations: [],
      suggestedQuestions: answer.suggestedQuestions.slice(0, 3),
      gapReason: "A resposta gerada não apresentou uma citação válida da versão vigente.",
    };
  }
  return {
    ...answer,
    answer: answer.answer.trim().slice(0, 5000),
    citations,
    suggestedQuestions: answer.suggestedQuestions.map((item) => item.trim()).filter(Boolean).slice(0, 3),
    gapReason: answer.gapReason?.trim().slice(0, 1000) || null,
  };
}

function localAnswer(question: string, ranked: RankedProcess[]): CompanyAssistantAnswer {
  const positive = ranked.filter((item) => item.score > 0);
  if (!positive.length) return {
    status: "GAP",
    answer: "Esta orientação ainda não está documentada nos processos oficiais do negócio.",
    confidence: "LOW",
    citations: [],
    suggestedQuestions: [],
    gapReason: "Nenhum processo publicado apresentou correspondência suficiente com a pergunta.",
  };
  const top = positive[0];
  const closeMatches = positive.filter((item) => item.score >= top.score * 0.8).slice(0, 3);
  if (closeMatches.length > 1) return {
    status: "NEEDS_CLARIFICATION",
    answer: `Sua pergunta pode estar relacionada a ${closeMatches.map((item) => `“${item.process.processTitle}”`).join(", ")}. Sobre qual deles você quer saber?`,
    confidence: "LOW",
    citations: [],
    suggestedQuestions: closeMatches.map((item) => `Como funciona ${item.process.processTitle}?`),
    gapReason: null,
  };
  const terms = tokens(question);
  const step = [...top.process.steps].sort((left, right) => termScore(`${right.title} ${right.body}`, terms, 1) - termScore(`${left.title} ${left.body}`, terms, 1))[0];
  const excerpt = step?.body || top.process.objective || top.process.summary;
  return {
    status: "ANSWERED",
    answer: step
      ? `Na versão oficial de “${top.process.processTitle}”, a orientação relacionada é: ${step.body}`
      : `O processo oficial “${top.process.processTitle}” orienta: ${excerpt}`,
    confidence: top.score >= 12 ? "MEDIUM" : "LOW",
    citations: [{
      processId: top.process.processId, processTitle: top.process.processTitle,
      versionId: top.process.versionId, versionNumber: top.process.versionNumber,
      stepKey: step?.key ?? null, stepTitle: step?.title ?? null, excerpt,
    }],
    suggestedQuestions: [`Quais são as etapas de ${top.process.processTitle}?`],
    gapReason: null,
  };
}

const answerJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["status", "answer", "confidence", "citations", "suggestedQuestions", "gapReason"],
  properties: {
    status: { type: "string", enum: ["ANSWERED", "GAP", "NEEDS_CLARIFICATION"] },
    answer: { type: "string" },
    confidence: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
    citations: { type: "array", maxItems: 6, items: {
      type: "object", additionalProperties: false,
      required: ["processId", "processTitle", "versionId", "versionNumber", "stepKey", "stepTitle", "excerpt"],
      properties: {
        processId: { type: "string" }, processTitle: { type: "string" }, versionId: { type: "string" }, versionNumber: { type: "integer" },
        stepKey: { type: ["string", "null"] }, stepTitle: { type: ["string", "null"] }, excerpt: { type: "string" },
      },
    } },
    suggestedQuestions: { type: "array", maxItems: 3, items: { type: "string" } },
    gapReason: { type: ["string", "null"] },
  },
} as const;

function extractOutputText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output as Array<Record<string, unknown>>) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content as Array<Record<string, unknown>>) if (typeof part.text === "string") return part.text;
  }
  return null;
}

export async function answerCompanyQuestion(question: string, history: ConversationTurn[], processes: PublishedProcessReference[]): Promise<CompanyAssistantResult> {
  const started = Date.now();
  const ranked = retrievePublishedProcesses(question, processes);
  const allowed = ranked.map((item) => item.process);
  const runtime = env as unknown as { OPENAI_API_KEY?: string; QA_AI_MODEL?: string; PROCESS_AI_MODEL?: string; AI_PROVIDER?: string };
  const local = () => ({
    answer: localAnswer(question, ranked), provenance: "LOCAL" as const, model: "evidence-engine-v1", promptVersion: promptCatalog["P-07"].version, latencyMs: Date.now() - started,
  });
  if (!runtime.OPENAI_API_KEY || runtime.AI_PROVIDER === "local") return local();
  const model = runtime.QA_AI_MODEL || runtime.PROCESS_AI_MODEL || "gpt-5.6";
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${runtime.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        store: false,
        input: [
          { role: "system", content: promptCatalog["P-07"].system },
          { role: "user", content: JSON.stringify({ SOURCE_DATA: { question, recentConversation: history.slice(-8), publishedProcessVersions: allowed } }) },
        ],
        text: { format: { type: "json_schema", name: "company_assistant_answer", strict: true, schema: answerJsonSchema } },
      }),
    });
    if (!response.ok) throw new Error(`OPENAI_QA_${response.status}`);
    const payload = await response.json() as Record<string, unknown>;
    const output = extractOutputText(payload);
    if (!output) throw new Error("OPENAI_QA_INCOMPLETE");
    const parsed = companyAssistantAnswerSchema.parse(JSON.parse(output));
    return { answer: sanitizeAnswer(parsed, allowed), provenance: "OPENAI", model, promptVersion: promptCatalog["P-07"].version, latencyMs: Date.now() - started };
  } catch {
    return local();
  }
}
