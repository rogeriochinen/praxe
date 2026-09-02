import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, experimentReadings, suggestionExperiments, suggestions } from "@/db/schema";
import { requireWorkspaceContext } from "@/lib/workspace";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    if (!( ["OWNER", "PROCESS_OWNER", "OPERATOR"] as string[]).includes(context.role)) return Response.json({ error: "Você não pode registrar esta medição." }, { status: 403 });
    const { id } = await params;
    const payload = await request.json() as { value?: number; measuredAt?: string; source?: string; notes?: string };
    const value = Number(payload.value);
    if (!Number.isFinite(value) || !payload.measuredAt || !Number.isFinite(Date.parse(payload.measuredAt)) || !payload.source?.trim()) return Response.json({ error: "Valor, data e fonte são obrigatórios." }, { status: 400 });
    const db = getDb();
    const [suggestion] = await db.select().from(suggestions).where(and(eq(suggestions.id, id), eq(suggestions.organizationId, context.organizationId))).limit(1);
    if (!suggestion) return Response.json({ error: "Decisão não encontrada." }, { status: 404 });
    const [experiment] = await db.select().from(suggestionExperiments).where(and(eq(suggestionExperiments.suggestionId, id), eq(suggestionExperiments.organizationId, context.organizationId))).limit(1);
    if (!experiment) return Response.json({ error: "Teste não configurado." }, { status: 404 });
    const activeTest = suggestion.status === "IN_TEST" && experiment.status === "ACTIVE";
    const activeMonitoring = suggestion.status === "APPROVED" && experiment.status === "COMPLETED" && Boolean(experiment.monitoringUntil) && Date.now() <= Date.parse(experiment.monitoringUntil!);
    if (!activeTest && !activeMonitoring) return Response.json({ error: "Medições só são aceitas em testes ativos ou durante o acompanhamento pós-aprovação." }, { status: 409 });
    const phase = suggestion.status === "APPROVED" ? "POST_APPROVAL" : "TEST";
    if (phase === "POST_APPROVAL" && experiment.monitoringUntil && Date.parse(payload.measuredAt) > Date.parse(experiment.monitoringUntil)) return Response.json({ error: "O período de acompanhamento de 90 dias já terminou." }, { status: 409 });
    const readingId = crypto.randomUUID();
    await db.batch([
      db.insert(experimentReadings).values({ id: readingId, organizationId: context.organizationId, experimentId: experiment.id, phase, measuredAt: new Date(payload.measuredAt).toISOString(), value, source: payload.source.trim().slice(0, 300), notes: payload.notes?.trim().slice(0, 2000) || null, createdByUserId: context.userId }),
      db.insert(auditEvents).values({ id: crypto.randomUUID(), organizationId: context.organizationId, actorUserId: context.userId, actorType: "USER", action: "EXPERIMENT_METRIC_RECORDED", entityType: "suggestion_experiment", entityId: experiment.id, metadataJson: JSON.stringify({ suggestionId: id, phase, value, measuredAt: payload.measuredAt }) }),
    ]);
    return Response.json({ id: readingId, suggestionId: id, phase, value }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Não foi possível registrar a medição." }, { status: 500 });
  }
}
