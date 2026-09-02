import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { assistantConversations, assistantMessages, insights } from "@/db/schema";
import { requireWorkspaceContext, writeAudit } from "@/lib/workspace";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    const { id } = await params;
    const db = getDb();
    const [target] = await db.select({ message: assistantMessages, conversation: assistantConversations })
      .from(assistantMessages)
      .innerJoin(assistantConversations, eq(assistantMessages.conversationId, assistantConversations.id))
      .where(and(
        eq(assistantMessages.id, id),
        eq(assistantMessages.organizationId, context.organizationId),
        eq(assistantMessages.role, "ASSISTANT"),
        eq(assistantConversations.organizationId, context.organizationId),
        eq(assistantConversations.createdByUserId, context.userId),
      )).limit(1);
    if (!target) return Response.json({ error: "Resposta não encontrada." }, { status: 404 });
    const representsGap = Boolean(target.message.answerStatus && ["GAP", "NEEDS_CLARIFICATION"].includes(target.message.answerStatus)) || target.message.feedback === "NOT_HELPFUL";
    if (!representsGap) return Response.json({ error: "Marque a resposta como incorreta antes de registrá-la como lacuna." }, { status: 409 });
    if (target.message.linkedInsightId) return Response.json({ insightId: target.message.linkedInsightId, alreadyCreated: true });
    const conversationMessages = await db.select().from(assistantMessages).where(and(
      eq(assistantMessages.organizationId, context.organizationId),
      eq(assistantMessages.conversationId, target.conversation.id),
    )).orderBy(asc(assistantMessages.createdAt));
    const targetIndex = conversationMessages.findIndex((item) => item.id === id);
    const question = conversationMessages.slice(0, targetIndex).reverse().find((item) => item.role === "USER")?.content || target.conversation.title;
    const insightId = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.batch([
      db.insert(insights).values({
        id: insightId, organizationId: context.organizationId, authorUserId: context.userId,
        title: `Lacuna operacional: ${question.slice(0, 100)}`,
        transcript: `Pergunta feita ao assistente operacional:\n${question}\n\nResposta da base vigente:\n${target.message.content}`,
        status: "NEW", createdAt: now, updatedAt: now,
      }),
      db.update(assistantMessages).set({ linkedInsightId: insightId }).where(and(
        eq(assistantMessages.id, id), eq(assistantMessages.organizationId, context.organizationId),
      )),
    ]);
    await writeAudit(context, "COMPANY_ASSISTANT_GAP_REGISTERED", "insight", insightId, { assistantMessageId: id, conversationId: target.conversation.id });
    return Response.json({ insightId, alreadyCreated: false }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Não foi possível registrar a lacuna como insight." }, { status: 500 });
  }
}
