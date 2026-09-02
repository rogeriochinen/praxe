import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { aiRuns, auditEvents, insights, processVersions, processes } from "@/db/schema";
import { analyzeInsight } from "@/lib/ai/provider";
import { promptCatalog } from "@/lib/ai/prompts";
import { requireWorkspaceContext } from "@/lib/workspace";

async function sha256(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const runId = crypto.randomUUID();
  let insightId: string | null = null;
  let organizationId: string | null = null;
  try {
    const context = await requireWorkspaceContext();
    const { id } = await params;
    insightId = id;
    organizationId = context.organizationId;
    const db = getDb();
    const [insight] = await db.select().from(insights).where(and(eq(insights.id, id), eq(insights.organizationId, context.organizationId))).limit(1);
    if (!insight) return Response.json({ error: "Insight não encontrado." }, { status: 404 });
    if (!["NEW", "REVIEW_REQUIRED", "FAILED"].includes(insight.status)) return Response.json({ id, status: insight.status, analysis: insight.analysisJson ? JSON.parse(insight.analysisJson) : null });
    const [claimed] = await db.update(insights).set({ status: "ANALYZING", updatedAt: new Date().toISOString() }).where(and(eq(insights.id, id), eq(insights.organizationId, context.organizationId), inArray(insights.status, ["NEW", "REVIEW_REQUIRED", "FAILED"]))).returning({ id: insights.id });
    if (!claimed) return Response.json({ error: "Este insight já está sendo analisado ou decidido." }, { status: 409 });

    const rows = await db.select().from(processes).where(eq(processes.organizationId, context.organizationId));
    const versions = await db.select().from(processVersions).where(eq(processVersions.organizationId, context.organizationId));
    const versionMap = new Map(versions.map((v) => [v.id, v]));
    const candidates = rows.map((p) => {
      const version = versionMap.get(p.currentVersionId ?? "");
      const content = version ? JSON.parse(version.contentJson) as { dependencies?: string[]; steps?: Array<{ key: string; title: string; body: string }> } : {};
      return { id: p.id, title: p.title, area: p.area, summary: version?.summary ?? "", dependencies: content.dependencies ?? [], steps: content.steps ?? [] };
    });
    const inputHash = await sha256(JSON.stringify({ transcript: insight.transcript, candidates }));
    await db.insert(aiRuns).values({ id: runId, organizationId: context.organizationId, insightId: id, promptId: "P-05", promptVersion: promptCatalog["P-05"].version, schemaVersion: "1.0.0", model: "pending", provenance: "LOCAL", inputHash, status: "RUNNING" });
    const result = await analyzeInsight(insight.transcript, candidates);
    const confidence = result.artifact.confidence === "HIGH" ? 90 : result.artifact.confidence === "MEDIUM" ? 76 : 48;
    await db.batch([
      db.update(aiRuns).set({ model: result.model, provenance: result.provenance, status: "COMPLETED", outputJson: JSON.stringify(result.artifact), latencyMs: result.latencyMs, inputTokens: result.inputTokens, outputTokens: result.outputTokens, completedAt: new Date().toISOString() }).where(and(eq(aiRuns.id, runId), eq(aiRuns.organizationId, context.organizationId))),
      db.update(insights).set({ title: result.artifact.title, status: "AWAITING_DECISION", primaryProcessId: result.artifact.primaryProcessId, confidence, recommendation: result.artifact.recommendation, analysisJson: JSON.stringify(result.artifact), updatedAt: new Date().toISOString() }).where(and(eq(insights.id, id), eq(insights.organizationId, context.organizationId))),
      db.insert(auditEvents).values({ id: crypto.randomUUID(), organizationId: context.organizationId, actorType: "AI", action: "INSIGHT_ANALYZED", entityType: "insight", entityId: id, metadataJson: JSON.stringify({ runId, provenance: result.provenance, promptVersion: promptCatalog["P-05"].version }) }),
    ]);
    return Response.json({ id, status: "AWAITING_DECISION", analysis: result.artifact, provenance: result.provenance });
  } catch (error) {
    try { await getDb().update(aiRuns).set({ status: "FAILED", errorCode: error instanceof Error ? error.message.slice(0, 80) : "UNKNOWN", completedAt: new Date().toISOString() }).where(eq(aiRuns.id, runId)); } catch { /* run may not exist */ }
    if (insightId && organizationId) {
      try { await getDb().update(insights).set({ status: "FAILED", updatedAt: new Date().toISOString() }).where(and(eq(insights.id, insightId), eq(insights.organizationId, organizationId), eq(insights.status, "ANALYZING"))); } catch { /* source insight remains preserved */ }
    }
    if (error instanceof Response) return error;
    return Response.json({ error: "A análise precisa de revisão. Nenhum processo foi alterado." }, { status: 500 });
  }
}
