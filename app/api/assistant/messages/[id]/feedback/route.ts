import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { assistantConversations, assistantMessages } from "@/db/schema";
import { requireWorkspaceContext, writeAudit } from "@/lib/workspace";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    const { id } = await params;
    const payload = await request.json() as { feedback?: "HELPFUL" | "NOT_HELPFUL"; note?: string };
    if (!payload.feedback || !["HELPFUL", "NOT_HELPFUL"].includes(payload.feedback)) return Response.json({ error: "Feedback inválido." }, { status: 400 });
    const db = getDb();
    const [message] = await db.select({ message: assistantMessages, conversation: assistantConversations })
      .from(assistantMessages)
      .innerJoin(assistantConversations, eq(assistantMessages.conversationId, assistantConversations.id))
      .where(and(
        eq(assistantMessages.id, id),
        eq(assistantMessages.organizationId, context.organizationId),
        eq(assistantMessages.role, "ASSISTANT"),
        eq(assistantConversations.organizationId, context.organizationId),
        eq(assistantConversations.createdByUserId, context.userId),
      )).limit(1);
    if (!message) return Response.json({ error: "Resposta não encontrada." }, { status: 404 });
    await db.update(assistantMessages).set({ feedback: payload.feedback, feedbackNote: payload.note?.trim().slice(0, 1000) || null }).where(and(
      eq(assistantMessages.id, id), eq(assistantMessages.organizationId, context.organizationId),
    ));
    await writeAudit(context, "COMPANY_ASSISTANT_FEEDBACK_RECORDED", "assistant_message", id, { feedback: payload.feedback });
    return Response.json({ id, feedback: payload.feedback });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Não foi possível registrar o feedback." }, { status: 500 });
  }
}
