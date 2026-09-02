import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, insights, processes, processVersions, suggestions } from "@/db/schema";
import { impactAnalysisSchema } from "@/lib/ai/contracts";
import { requireWorkspaceContext } from "@/lib/workspace";

type InsightDecisionPayload = {
  action?: "PILOT" | "REJECT" | "NEED_MORE_INFO";
  processId?: string;
  stepKey?: string;
  proposedText?: string;
  reason?: string;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let claimed = false;
  let claimedInsightId = "";
  let claimedOrganizationId = "";
  try {
    const context = await requireWorkspaceContext();
    if (!(["OWNER", "PROCESS_OWNER"] as string[]).includes(context.role)) return Response.json({ error: "Você não pode decidir este item." }, { status: 403 });
    const { id } = await params;
    const payload = await request.json() as InsightDecisionPayload;
    if (!payload.action || !["PILOT", "REJECT", "NEED_MORE_INFO"].includes(payload.action)) return Response.json({ error: "Ação inválida." }, { status: 400 });
    const db = getDb();
    const [item] = await db.select().from(insights).where(and(eq(insights.id, id), eq(insights.organizationId, context.organizationId))).limit(1);
    if (!item) return Response.json({ error: "Insight não encontrado." }, { status: 404 });
    if (item.status !== "AWAITING_DECISION") return Response.json({ error: "Este insight já foi encaminhado ou decidido." }, { status: 409 });
    const now = new Date().toISOString();
    const reason = payload.reason?.trim() || "";

    let pilot: { processId: string; versionId: string; stepKey: string; stepBody: string; proposedText: string; rationale: string; recommendation: string } | null = null;
    if (payload.action === "PILOT") {
      const analysis = impactAnalysisSchema.parse(JSON.parse(item.analysisJson || "{}"));
      const processId = payload.processId || analysis.primaryProcessId;
      if (!processId) return Response.json({ error: "Confirme o processo afetado antes de encaminhar o insight." }, { status: 400 });
      const [process] = await db.select().from(processes).where(and(eq(processes.id, processId), eq(processes.organizationId, context.organizationId))).limit(1);
      if (!process?.currentVersionId) return Response.json({ error: "O processo selecionado não possui versão vigente." }, { status: 409 });
      if (context.role === "PROCESS_OWNER" && process.ownerUserId !== context.userId) return Response.json({ error: "Este processo pertence a outro responsável." }, { status: 403 });
      const [version] = await db.select().from(processVersions).where(and(eq(processVersions.id, process.currentVersionId), eq(processVersions.organizationId, context.organizationId))).limit(1);
      if (!version) return Response.json({ error: "Versão vigente indisponível." }, { status: 409 });
      const content = JSON.parse(version.contentJson) as { steps?: Array<{ key: string; title: string; body: string }> };
      const stepKey = payload.stepKey || analysis.affectedSteps[0];
      const step = content.steps?.find((candidate) => candidate.key === stepKey);
      if (!step) return Response.json({ error: "Confirme a etapa afetada antes de encaminhar o insight." }, { status: 400 });
      const proposedText = payload.proposedText?.trim() || "";
      if (proposedText.length < 10 || proposedText.length > 8000) return Response.json({ error: "Revise o texto experimental da etapa antes de iniciar o teste." }, { status: 400 });
      pilot = { processId: process.id, versionId: version.id, stepKey: step.key, stepBody: step.body, proposedText: proposedText.slice(0, 8000), rationale: analysis.rationale, recommendation: analysis.recommendation };
    } else {
      if (context.role !== "OWNER") return Response.json({ error: "Somente o dono pode rejeitar ou solicitar contexto para um insight ainda não vinculado." }, { status: 403 });
      if (reason.length < (payload.action === "NEED_MORE_INFO" ? 5 : 4)) return Response.json({ error: payload.action === "NEED_MORE_INFO" ? "Acrescente o contexto que falta para a IA refazer a análise." : "Explique por que o insight não deve seguir para teste." }, { status: 400 });
    }

    const [claim] = await db.update(insights).set({ status: "ANALYZING", updatedAt: now }).where(and(eq(insights.id, id), eq(insights.organizationId, context.organizationId), eq(insights.status, "AWAITING_DECISION"))).returning({ id: insights.id });
    if (!claim) return Response.json({ error: "Outra decisão já está sendo registrada para este insight." }, { status: 409 });
    claimed = true;
    claimedInsightId = id;
    claimedOrganizationId = context.organizationId;

    if (payload.action === "NEED_MORE_INFO") {
      await db.batch([
        db.update(insights).set({ transcript: `${item.transcript}\n\nCONTEXTO ADICIONAL DO DONO:\n${reason.slice(0, 4000)}`, status: "REVIEW_REQUIRED", decisionReason: reason.slice(0, 4000), updatedAt: now }).where(and(eq(insights.id, id), eq(insights.organizationId, context.organizationId), eq(insights.status, "ANALYZING"))),
        db.insert(auditEvents).values({ id: crypto.randomUUID(), organizationId: context.organizationId, actorUserId: context.userId, actorType: "USER", action: "INSIGHT_NEED_MORE_INFO", entityType: "insight", entityId: id, metadataJson: JSON.stringify({ previousStatus: item.status, contextAdded: true }) }),
      ]);
      claimed = false;
      return Response.json({ id, status: "REVIEW_REQUIRED", processChanged: false });
    }

    if (payload.action === "REJECT") {
      await db.batch([
        db.update(insights).set({ status: "REJECTED", decisionReason: reason.slice(0, 4000), updatedAt: now }).where(and(eq(insights.id, id), eq(insights.organizationId, context.organizationId), eq(insights.status, "ANALYZING"))),
        db.insert(auditEvents).values({ id: crypto.randomUUID(), organizationId: context.organizationId, actorUserId: context.userId, actorType: "USER", action: "INSIGHT_REJECTED", entityType: "insight", entityId: id, metadataJson: JSON.stringify({ previousStatus: item.status, reason }) }),
      ]);
      claimed = false;
      return Response.json({ id, status: "REJECTED", processChanged: false });
    }

    if (!pilot) throw new Error("PILOT_NOT_PREPARED");
    const suggestionId = crypto.randomUUID();
    await db.batch([
      db.insert(suggestions).values({ id: suggestionId, organizationId: context.organizationId, processId: pilot.processId, baseVersionId: pilot.versionId, stepKey: pilot.stepKey, authorUserId: item.authorUserId, currentText: pilot.stepBody, proposedText: pilot.proposedText, rationale: pilot.rationale, sourceInsightId: item.id, status: "PENDING" }),
      db.update(insights).set({ status: "FORWARDED", primaryProcessId: pilot.processId, linkedSuggestionId: suggestionId, decisionReason: reason.slice(0, 4000) || null, updatedAt: now }).where(and(eq(insights.id, id), eq(insights.organizationId, context.organizationId), eq(insights.status, "ANALYZING"))),
      db.insert(auditEvents).values({ id: crypto.randomUUID(), organizationId: context.organizationId, actorUserId: context.userId, actorType: "USER", action: "INSIGHT_APPROVED_FOR_PILOT", entityType: "insight", entityId: id, metadataJson: JSON.stringify({ suggestionId, processId: pilot.processId, stepKey: pilot.stepKey, aiRecommendation: pilot.recommendation }) }),
    ]);
    claimed = false;
    return Response.json({ id, status: "FORWARDED", suggestionId, processId: pilot.processId, stepKey: pilot.stepKey, processChanged: false });
  } catch (error) {
    if (claimed && claimedInsightId && claimedOrganizationId) {
      try { await getDb().update(insights).set({ status: "AWAITING_DECISION", updatedAt: new Date().toISOString() }).where(and(eq(insights.id, claimedInsightId), eq(insights.organizationId, claimedOrganizationId), eq(insights.status, "ANALYZING"))); } catch { /* source remains preserved */ }
    }
    if (error instanceof Response) return error;
    return Response.json({ error: "A decisão não foi registrada. Nenhum processo foi alterado." }, { status: 500 });
  }
}
