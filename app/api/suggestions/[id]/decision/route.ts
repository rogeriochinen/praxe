import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, insights, processes, processVersions, suggestionExperiments, suggestions } from "@/db/schema";
import { requireWorkspaceContext } from "@/lib/workspace";
import { calculateAutomationReadiness, type AutomationReadinessInput } from "@/lib/metrics/automation-readiness";

type TestConfig = {
  responsibleName?: string;
  metricName?: string;
  metricUnit?: string;
  desiredDirection?: "INCREASE" | "DECREASE";
  baselineValue?: number;
  targetValue?: number;
  guardrailMetric?: string;
  startsAt?: string;
  endsAt?: string;
};

type DecisionPayload = {
  action?: "PILOT" | "CLARIFY" | "REJECT" | "APPROVE" | "EXTEND";
  approvedText?: string;
  decisionReason?: string;
  resultValue?: number;
  resultNotes?: string;
  endsAt?: string;
  testConfig?: TestConfig;
};

function validDate(value?: string) {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

function plusDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    if (!( ["OWNER", "PROCESS_OWNER"] as string[]).includes(context.role)) return Response.json({ error: "Aprovação restrita ao responsável." }, { status: 403 });
    const { id } = await params;
    const payload = await request.json() as DecisionPayload;
    if (!payload.action) return Response.json({ error: "Ação inválida." }, { status: 400 });
    const db = getDb();
    const [suggestion] = await db.select().from(suggestions).where(and(eq(suggestions.id, id), eq(suggestions.organizationId, context.organizationId))).limit(1);
    if (!suggestion) return Response.json({ error: "Sugestão não encontrada." }, { status: 404 });
    if (suggestion.status === "APPROVED" || suggestion.status === "REJECTED") {
      if ((suggestion.status === "APPROVED" && payload.action === "APPROVE") || (suggestion.status === "REJECTED" && payload.action === "REJECT")) return Response.json({ id, status: suggestion.status, processChanged: false });
      return Response.json({ error: "Esta decisão é final e não pode ser reaberta por esta ação." }, { status: 409 });
    }
    const [process] = await db.select().from(processes).where(and(eq(processes.id, suggestion.processId), eq(processes.organizationId, context.organizationId))).limit(1);
    if (!process?.currentVersionId) return Response.json({ error: "Processo indisponível." }, { status: 404 });
    if (context.role === "PROCESS_OWNER" && process.ownerUserId !== context.userId) return Response.json({ error: "Este processo pertence a outro responsável." }, { status: 403 });
    const [experiment] = await db.select().from(suggestionExperiments).where(and(eq(suggestionExperiments.suggestionId, id), eq(suggestionExperiments.organizationId, context.organizationId))).limit(1);
    const now = new Date().toISOString();

    if (payload.action === "PILOT") {
      if (!["PENDING", "NEEDS_CLARIFICATION"].includes(suggestion.status)) return Response.json({ error: "Somente uma decisão pendente pode iniciar um teste." }, { status: 409 });
      if (!suggestion.sourceInsightId && suggestion.analysisStatus === "ANALYZING") return Response.json({ error: "Aguarde a análise da IA terminar antes de configurar o teste." }, { status: 409 });
      if (experiment) return Response.json({ error: "Este teste já foi configurado." }, { status: 409 });
      const config = payload.testConfig;
      const baselineValue = Number(config?.baselineValue);
      const targetValue = Number(config?.targetValue);
      if (!config?.responsibleName?.trim() || !config.metricName?.trim() || !config.metricUnit?.trim() || !config.desiredDirection || !Number.isFinite(baselineValue) || !Number.isFinite(targetValue) || !validDate(config.startsAt) || !validDate(config.endsAt)) {
        return Response.json({ error: "Responsável, métrica, baseline, meta e período do teste são obrigatórios." }, { status: 400 });
      }
      if (Date.parse(config.endsAt!) <= Date.parse(config.startsAt!)) return Response.json({ error: "O término do teste deve ser posterior ao início." }, { status: 400 });
      const experimentId = crypto.randomUUID();
      await db.batch([
        db.insert(suggestionExperiments).values({
          id: experimentId,
          organizationId: context.organizationId,
          suggestionId: id,
          responsibleName: config.responsibleName.trim().slice(0, 160),
          metricName: config.metricName.trim().slice(0, 240),
          metricUnit: config.metricUnit.trim().slice(0, 60),
          desiredDirection: config.desiredDirection,
          baselineValue,
          targetValue,
          guardrailMetric: config.guardrailMetric?.trim().slice(0, 500) || null,
          startsAt: new Date(config.startsAt!).toISOString(),
          endsAt: new Date(config.endsAt!).toISOString(),
          status: "ACTIVE",
        }),
        db.update(suggestions).set({ status: "IN_TEST", revision: suggestion.revision + 1, updatedAt: now }).where(and(eq(suggestions.id, id), eq(suggestions.organizationId, context.organizationId), eq(suggestions.revision, suggestion.revision))),
        ...(suggestion.sourceInsightId ? [db.update(insights).set({ status: "IN_TEST", updatedAt: now }).where(and(eq(insights.id, suggestion.sourceInsightId), eq(insights.organizationId, context.organizationId)))] : []),
        db.insert(auditEvents).values({ id: crypto.randomUUID(), organizationId: context.organizationId, actorUserId: context.userId, actorType: "USER", action: "SUGGESTION_PILOT_STARTED", entityType: "suggestion", entityId: id, metadataJson: JSON.stringify({ experimentId, metricName: config.metricName, baselineValue, targetValue, endsAt: config.endsAt }) }),
      ]);
      return Response.json({ id, status: "IN_TEST", experimentId, processChanged: false });
    }

    if (payload.action === "EXTEND") {
      if (!experiment || experiment.status !== "ACTIVE" || suggestion.status !== "IN_TEST" || !validDate(payload.endsAt)) return Response.json({ error: "Teste ou nova data inválidos." }, { status: 400 });
      if (Date.parse(payload.endsAt!) <= Date.parse(experiment.endsAt)) return Response.json({ error: "A nova data deve prolongar o teste atual." }, { status: 400 });
      await db.batch([
        db.update(suggestionExperiments).set({ endsAt: new Date(payload.endsAt!).toISOString(), updatedAt: now }).where(and(eq(suggestionExperiments.id, experiment.id), eq(suggestionExperiments.organizationId, context.organizationId))),
        db.insert(auditEvents).values({ id: crypto.randomUUID(), organizationId: context.organizationId, actorUserId: context.userId, actorType: "USER", action: "SUGGESTION_PILOT_EXTENDED", entityType: "suggestion", entityId: id, metadataJson: JSON.stringify({ previousEndsAt: experiment.endsAt, nextEndsAt: payload.endsAt }) }),
      ]);
      return Response.json({ id, status: "IN_TEST", processChanged: false });
    }

    if (payload.action === "CLARIFY") {
      if (suggestion.status !== "PENDING") return Response.json({ error: "Somente uma decisão pendente pode voltar para detalhamento." }, { status: 409 });
      await db.batch([
        db.update(suggestions).set({ status: "NEEDS_CLARIFICATION", revision: suggestion.revision + 1, updatedAt: now }).where(and(eq(suggestions.id, id), eq(suggestions.organizationId, context.organizationId), eq(suggestions.revision, suggestion.revision))),
        db.insert(auditEvents).values({ id: crypto.randomUUID(), organizationId: context.organizationId, actorUserId: context.userId, actorType: "USER", action: "SUGGESTION_CLARIFY", entityType: "suggestion", entityId: id, metadataJson: JSON.stringify({ previousStatus: suggestion.status }) }),
      ]);
      return Response.json({ id, status: "NEEDS_CLARIFICATION", processChanged: false });
    }

    const decisionReason = payload.decisionReason?.trim() || "";
    if (payload.action === "REJECT") {
      if (!["PENDING", "NEEDS_CLARIFICATION", "IN_TEST"].includes(suggestion.status)) return Response.json({ error: "Esta decisão não pode ser rejeitada neste estado." }, { status: 409 });
      if (decisionReason.length < 4) return Response.json({ error: "Registre o motivo da rejeição para preservar o aprendizado." }, { status: 400 });
      await db.batch([
        db.update(suggestions).set({ status: "REJECTED", decisionReason: decisionReason.slice(0, 4000), revision: suggestion.revision + 1, updatedAt: now }).where(and(eq(suggestions.id, id), eq(suggestions.organizationId, context.organizationId), eq(suggestions.revision, suggestion.revision))),
        ...(suggestion.sourceInsightId ? [db.update(insights).set({ status: "REJECTED", decisionReason: decisionReason.slice(0, 4000), updatedAt: now }).where(and(eq(insights.id, suggestion.sourceInsightId), eq(insights.organizationId, context.organizationId)))] : []),
        ...(experiment ? [db.update(suggestionExperiments).set({ status: "CANCELLED" as const, resultValue: Number.isFinite(Number(payload.resultValue)) ? Number(payload.resultValue) : null, resultNotes: payload.resultNotes?.trim().slice(0, 4000) || null, decisionReason: decisionReason.slice(0, 4000), updatedAt: now }).where(and(eq(suggestionExperiments.id, experiment.id), eq(suggestionExperiments.organizationId, context.organizationId)))] : []),
        db.insert(auditEvents).values({ id: crypto.randomUUID(), organizationId: context.organizationId, actorUserId: context.userId, actorType: "USER", action: "SUGGESTION_REJECTED", entityType: "suggestion", entityId: id, metadataJson: JSON.stringify({ previousStatus: suggestion.status, decisionReason }) }),
      ]);
      return Response.json({ id, status: "REJECTED", processChanged: false });
    }

    if (payload.action !== "APPROVE") return Response.json({ error: "Ação inválida." }, { status: 400 });
    if (suggestion.status !== "IN_TEST" || !experiment || experiment.status !== "ACTIVE") return Response.json({ error: "A mudança só pode ser aprovada depois de um teste ativo." }, { status: 409 });
    if (experiment && decisionReason.length < 4) return Response.json({ error: "Explique por que os dados sustentam a aprovação." }, { status: 400 });
    if (suggestion.baseVersionId !== process.currentVersionId) return Response.json({ error: "O processo mudou desde a sugestão. Revise a proposta sobre a versão atual." }, { status: 409 });
    const [base] = await db.select().from(processVersions).where(and(eq(processVersions.id, suggestion.baseVersionId), eq(processVersions.organizationId, context.organizationId))).limit(1);
    if (!base) return Response.json({ error: "Versão-base não encontrada." }, { status: 409 });
    const content = JSON.parse(base.contentJson) as AutomationReadinessInput & { steps: Array<{ key: string; title: string; body: string; exception?: string }> };
    const step = content.steps?.find((item) => item.key === suggestion.stepKey);
    if (!step) return Response.json({ error: "O passo mudou. Refaça a associação." }, { status: 409 });
    const approvedText = payload.approvedText?.trim() || suggestion.proposedText;
    const before = step.body;
    step.body = approvedText;
    const readiness = calculateAutomationReadiness(content);
    content.automationReadiness = readiness.score;
    const nextVersionId = crypto.randomUUID();
    const nextNumber = base.versionNumber + 1;
    const resultValue = Number(payload.resultValue);
    await db.batch([
      db.update(processVersions).set({ status: "SUPERSEDED" }).where(and(eq(processVersions.id, base.id), eq(processVersions.organizationId, context.organizationId), eq(processVersions.status, "CURRENT"))),
      db.insert(processVersions).values({ id: nextVersionId, organizationId: context.organizationId, processId: process.id, versionNumber: nextNumber, status: "CURRENT", summary: base.summary, contentJson: JSON.stringify(content), changeSummary: suggestion.rationale, createdByUserId: context.userId, publishedByUserId: context.userId }),
      db.update(processes).set({ currentVersionId: nextVersionId, automationReadiness: readiness.score, updatedAt: now }).where(and(eq(processes.id, process.id), eq(processes.organizationId, context.organizationId), eq(processes.currentVersionId, base.id))),
      db.update(suggestions).set({ status: "APPROVED", decisionReason: decisionReason.slice(0, 4000) || null, revision: suggestion.revision + 1, updatedAt: now }).where(and(eq(suggestions.id, id), eq(suggestions.organizationId, context.organizationId), eq(suggestions.revision, suggestion.revision))),
      ...(suggestion.sourceInsightId ? [db.update(insights).set({ status: "APPROVED", decisionReason: decisionReason.slice(0, 4000) || null, updatedAt: now }).where(and(eq(insights.id, suggestion.sourceInsightId), eq(insights.organizationId, context.organizationId)))] : []),
      ...(experiment ? [db.update(suggestionExperiments).set({ status: "COMPLETED" as const, resultValue: Number.isFinite(resultValue) ? resultValue : null, resultNotes: payload.resultNotes?.trim().slice(0, 4000) || null, decisionReason: decisionReason.slice(0, 4000), monitoringUntil: plusDays(new Date(now), 90), updatedAt: now }).where(and(eq(suggestionExperiments.id, experiment.id), eq(suggestionExperiments.organizationId, context.organizationId)))] : []),
      db.insert(auditEvents).values({ id: crypto.randomUUID(), organizationId: context.organizationId, actorUserId: context.userId, actorType: "USER", action: "PROCESS_VERSION_PUBLISHED", entityType: "process_version", entityId: nextVersionId, metadataJson: JSON.stringify({ suggestionId: id, experimentId: experiment?.id ?? null, decisionReason, processId: process.id, fromVersion: base.versionNumber, toVersion: nextNumber, diff: { stepKey: suggestion.stepKey, before, after: approvedText } }) }),
    ]);
    return Response.json({ id, status: "APPROVED", processChanged: true, version: nextNumber, diff: { before, after: approvedText } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "A decisão não foi concluída. Nenhuma versão foi alterada." }, { status: 500 });
  }
}
