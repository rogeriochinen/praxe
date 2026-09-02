import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { assistantConversations, assistantMessages, processVersions, processes } from "@/db/schema";
import { answerCompanyQuestion, type PublishedProcessReference } from "@/lib/ai/company-assistant";
import { requireWorkspaceContext, writeAudit } from "@/lib/workspace";
import { normalizeOperationalProcess } from "@/lib/implementation/operational-text";

type ProcessContent = {
  objective?: string;
  trigger?: string;
  steps?: Array<{ key?: string; title?: string; body?: string; ownerRole?: string }>;
  decisions?: string[];
  exceptions?: string[];
  outputs?: string[];
};

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function messagePayload(message: typeof assistantMessages.$inferSelect) {
  return {
    ...message,
    citations: parseJson(message.citationsJson, []),
    suggestedQuestions: parseJson(message.suggestedQuestionsJson, []),
  };
}

async function publishedCatalog(organizationId: string): Promise<PublishedProcessReference[]> {
  const rows = await getDb().select({ process: processes, version: processVersions })
    .from(processes)
    .innerJoin(processVersions, eq(processes.currentVersionId, processVersions.id))
    .where(and(
      eq(processes.organizationId, organizationId),
      eq(processes.status, "PUBLISHED"),
      eq(processVersions.organizationId, organizationId),
      eq(processVersions.status, "CURRENT"),
    ));
  return rows.map(({ process, version }) => {
    const content = normalizeOperationalProcess(parseJson<ProcessContent>(version.contentJson, {}));
    return {
      processId: process.id,
      processTitle: process.title,
      area: process.area,
      versionId: version.id,
      versionNumber: version.versionNumber,
      summary: version.summary,
      objective: content.objective || version.summary,
      trigger: content.trigger || "",
      steps: (content.steps || []).map((step) => ({
        key: step.key || "", title: step.title || "Etapa", body: step.body || "", ownerRole: step.ownerRole || process.ownerName,
      })).filter((step) => step.key && step.body),
      decisions: content.decisions || [],
      exceptions: content.exceptions || [],
      outputs: content.outputs || [],
    };
  });
}

export async function GET(request: Request) {
  try {
    const context = await requireWorkspaceContext();
    const db = getDb();
    const conversations = await db.select().from(assistantConversations).where(and(
      eq(assistantConversations.organizationId, context.organizationId),
      eq(assistantConversations.createdByUserId, context.userId),
      eq(assistantConversations.status, "ACTIVE"),
    )).orderBy(desc(assistantConversations.updatedAt)).limit(20);
    const requestedId = new URL(request.url).searchParams.get("conversationId");
    const selected = requestedId ? conversations.find((item) => item.id === requestedId) : conversations[0];
    const messages = selected ? await db.select().from(assistantMessages).where(and(
      eq(assistantMessages.organizationId, context.organizationId),
      eq(assistantMessages.conversationId, selected.id),
    )).orderBy(asc(assistantMessages.createdAt)).limit(100) : [];
    const publishedProcessCount = await publishedCatalog(context.organizationId).then((items) => items.length);
    return Response.json({ conversations, activeConversationId: selected?.id ?? null, messages: messages.map(messagePayload), publishedProcessCount });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Não foi possível carregar o assistente operacional." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireWorkspaceContext();
    const payload = await request.json() as { question?: string; conversationId?: string | null };
    const question = payload.question?.replace(/\s+/g, " ").trim() || "";
    if (question.length < 3 || question.length > 2000) return Response.json({ error: "A pergunta deve ter entre 3 e 2.000 caracteres." }, { status: 400 });
    const db = getDb();
    let conversation = payload.conversationId ? (await db.select().from(assistantConversations).where(and(
      eq(assistantConversations.id, payload.conversationId),
      eq(assistantConversations.organizationId, context.organizationId),
      eq(assistantConversations.createdByUserId, context.userId),
      eq(assistantConversations.status, "ACTIVE"),
    )).limit(1))[0] : null;
    if (payload.conversationId && !conversation) return Response.json({ error: "Conversa não encontrada neste negócio." }, { status: 404 });

    const catalog = await publishedCatalog(context.organizationId);
    if (!catalog.length) return Response.json({ error: "Publique ao menos um processo antes de consultar o assistente." }, { status: 409 });
    const history = conversation ? await db.select({ role: assistantMessages.role, content: assistantMessages.content }).from(assistantMessages).where(and(
      eq(assistantMessages.organizationId, context.organizationId),
      eq(assistantMessages.conversationId, conversation.id),
    )).orderBy(desc(assistantMessages.createdAt)).limit(8) : [];
    const result = await answerCompanyQuestion(question, history.reverse(), catalog);
    const now = new Date().toISOString();
    const assistantCreatedAt = new Date(Date.parse(now) + 1).toISOString();
    const conversationId = conversation?.id || crypto.randomUUID();
    if (!conversation) conversation = {
      id: conversationId, organizationId: context.organizationId, createdByUserId: context.userId,
      title: question.slice(0, 80), status: "ACTIVE", createdAt: now, updatedAt: now,
    };
    const userMessage = {
      id: crypto.randomUUID(), organizationId: context.organizationId, conversationId,
      authorUserId: context.userId, role: "USER" as const, content: question,
      createdAt: now,
    };
    const assistantMessage = {
      id: crypto.randomUUID(), organizationId: context.organizationId, conversationId,
      authorUserId: null, role: "ASSISTANT" as const, content: result.answer.answer,
      answerStatus: result.answer.status, confidence: result.answer.confidence,
      citationsJson: JSON.stringify(result.answer.citations),
      suggestedQuestionsJson: JSON.stringify(result.answer.suggestedQuestions),
      model: result.model, provenance: result.provenance, promptVersion: result.promptVersion,
      createdAt: assistantCreatedAt,
    };
    await db.batch([
      ...(!payload.conversationId ? [db.insert(assistantConversations).values(conversation)] : []),
      db.insert(assistantMessages).values(userMessage),
      db.insert(assistantMessages).values(assistantMessage),
      db.update(assistantConversations).set({ updatedAt: now }).where(and(
        eq(assistantConversations.id, conversationId),
        eq(assistantConversations.organizationId, context.organizationId),
        eq(assistantConversations.createdByUserId, context.userId),
      )),
    ]);
    await writeAudit(context, "COMPANY_ASSISTANT_ANSWERED", "assistant_message", assistantMessage.id, {
      conversationId, answerStatus: result.answer.status, citationCount: result.answer.citations.length,
      provenance: result.provenance, model: result.model, promptVersion: result.promptVersion,
    }, result.provenance === "OPENAI" ? "AI" : "SYSTEM");
    return Response.json({ conversation, userMessage: messagePayload({ ...userMessage, answerStatus: null, confidence: null, citationsJson: "[]", suggestedQuestionsJson: "[]", model: null, provenance: null, promptVersion: null, feedback: null, feedbackNote: null, linkedInsightId: null }), assistantMessage: messagePayload({ ...assistantMessage, feedback: null, feedbackNote: null, linkedInsightId: null }) }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "O assistente não conseguiu concluir a resposta. Tente novamente." }, { status: 500 });
  }
}
