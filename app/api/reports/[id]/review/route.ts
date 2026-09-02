import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditEvents, processVersions, processes, reports } from "@/db/schema";
import { requireWorkspaceContext } from "@/lib/workspace";
import { calculateAutomationReadiness, type AutomationReadinessInput } from "@/lib/metrics/automation-readiness";

const shortText = z.string().trim().min(2).max(240);
const longText = z.string().trim().min(4).max(6000);
const textList = z.array(z.string().trim().min(1).max(800)).max(30);

const reviewSchema = z.object({
  baseUpdatedAt: z.string().min(1),
  report: z.object({
    companyContext: longText,
    executiveSummary: longText,
    findings: z.array(z.object({
      title: shortText,
      detail: longText,
      severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
    }).strict()).min(1).max(20),
    priorities: z.array(z.object({
      title: shortText,
      whyNow: longText,
      horizon: z.enum(["7_DAYS", "30_DAYS", "90_DAYS"]),
      expectedOutcome: longText,
    }).strict()).max(12),
  }).strict(),
  processes: z.array(z.object({
    id: z.string().min(1),
    versionId: z.string().min(1),
    title: shortText,
    area: shortText,
    objective: longText,
    trigger: z.string().trim().max(1200),
    ownerRole: shortText,
    inputs: textList,
    steps: z.array(z.object({
      key: z.string().min(1).max(120),
      title: shortText,
      body: longText,
      ownerRole: shortText,
    }).strict()).min(1).max(40),
    decisions: textList,
    exceptions: textList,
    outputs: textList,
    risks: textList,
    dependencies: textList,
  }).strict()).min(1).max(12),
}).strict();

type JsonObject = Record<string, unknown>;

function parseObject(value: string): JsonObject {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID_STORED_JSON");
  return parsed as JsonObject;
}

function changedFields(before: JsonObject, after: JsonObject, fields: string[]) {
  return fields.filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    if (!(["OWNER", "CONSULTANT"] as string[]).includes(context.role)) {
      return Response.json({ error: "Apenas o dono ou consultor pode corrigir a implantação." }, { status: 403 });
    }

    const parsed = reviewSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Revise os campos obrigatórios antes de salvar." }, { status: 400 });

    const { id } = await params;
    const db = getDb();
    const [report] = await db.select().from(reports).where(and(
      eq(reports.id, id),
      eq(reports.organizationId, context.organizationId),
    )).limit(1);
    if (!report) return Response.json({ error: "Relatório não encontrado." }, { status: 404 });
    if (report.status === "PUBLISHED") {
      return Response.json({ error: "A versão 1 já foi publicada. Use uma sugestão para propor novas mudanças." }, { status: 409 });
    }
    if (report.updatedAt !== parsed.data.baseUpdatedAt) {
      return Response.json({ error: "Este rascunho mudou em outra sessão. Recarregue antes de salvar novamente." }, { status: 409 });
    }

    const originalReport = parseObject(report.contentJson);
    const originalFindings = Array.isArray(originalReport.findings) ? originalReport.findings as JsonObject[] : [];
    const originalPriorities = Array.isArray(originalReport.priorities) ? originalReport.priorities as JsonObject[] : [];
    if (parsed.data.report.findings.length !== originalFindings.length || parsed.data.report.priorities.length !== originalPriorities.length) {
      return Response.json({ error: "A estrutura do diagnóstico mudou. Recarregue a revisão." }, { status: 409 });
    }

    const nextReport: JsonObject = {
      ...originalReport,
      founderAbsenceVersion: "founder-absence-v2",
      companyContext: parsed.data.report.companyContext,
      executiveSummary: parsed.data.report.executiveSummary,
      findings: parsed.data.report.findings.map((finding, index) => ({
        ...originalFindings[index],
        ...finding,
        evidence: originalFindings[index]?.evidence ?? [],
      })),
      priorities: parsed.data.report.priorities.map((priority, index) => ({
        ...originalPriorities[index],
        ...priority,
      })),
    };

    const processDiffs: Array<{
      processId: string;
      fields: string[];
      steps: { added: string[]; removed: string[]; reordered: boolean };
    }> = [];
    const correctedReportProcesses: JsonObject[] = [];
    const updates = [];
    for (const correction of parsed.data.processes) {
      const [process] = await db.select().from(processes).where(and(
        eq(processes.id, correction.id),
        eq(processes.organizationId, context.organizationId),
      )).limit(1);
      if (!process || process.status !== "IN_VALIDATION") {
        return Response.json({ error: "Um dos processos não está mais disponível para correção." }, { status: 409 });
      }

      const [version] = await db.select().from(processVersions).where(and(
        eq(processVersions.id, correction.versionId),
        eq(processVersions.processId, correction.id),
        eq(processVersions.organizationId, context.organizationId),
        eq(processVersions.status, "DRAFT"),
      )).limit(1);
      if (!version) return Response.json({ error: "Um rascunho mudou. Recarregue a revisão." }, { status: 409 });

      const original = parseObject(version.contentJson);
      const originalSteps = Array.isArray(original.steps) ? original.steps as JsonObject[] : [];
      const originalStepMap = new Map(originalSteps.map((step) => [String(step.key), step]));
      const originalStepKeys = originalSteps.map((step) => String(step.key));
      const submittedStepKeys = correction.steps.map((step) => step.key);
      if (new Set(submittedStepKeys).size !== submittedStepKeys.length) {
        return Response.json({ error: `“${process.title}” contém etapas duplicadas.` }, { status: 400 });
      }
      if (submittedStepKeys.some((key) => !originalStepMap.has(key) && !key.startsWith("owner_"))) {
        return Response.json({ error: `Uma nova etapa de “${process.title}” não pôde ser validada.` }, { status: 400 });
      }

      const addedSteps = submittedStepKeys.filter((key) => !originalStepMap.has(key));
      const removedSteps = originalStepKeys.filter((key) => !submittedStepKeys.includes(key));
      const retainedOriginalOrder = originalStepKeys.filter((key) => submittedStepKeys.includes(key));
      const retainedSubmittedOrder = submittedStepKeys.filter((key) => originalStepMap.has(key));
      const stepsReordered = JSON.stringify(retainedOriginalOrder) !== JSON.stringify(retainedSubmittedOrder);

      const nextContent: JsonObject = {
        ...original,
        title: correction.title,
        area: correction.area,
        objective: correction.objective,
        trigger: correction.trigger,
        ownerRole: correction.ownerRole,
        inputs: correction.inputs,
        steps: correction.steps.map((step) => {
          const originalStep = originalStepMap.get(step.key);
          return {
            ...(originalStep ?? {}),
            ...step,
            evidence: originalStep?.evidence ?? [],
            ...(originalStep ? {} : { origin: "OWNER_CORRECTION" }),
          };
        }),
        decisions: correction.decisions,
        exceptions: correction.exceptions,
        outputs: correction.outputs,
        risks: correction.risks,
        dependencies: correction.dependencies,
        evidence: original.evidence ?? [],
      };
      const readiness = calculateAutomationReadiness(nextContent as AutomationReadinessInput);
      nextContent.automationReadiness = readiness.score;
      const fields = changedFields(original, nextContent, [
        "title", "area", "objective", "trigger", "ownerRole", "inputs", "steps",
        "decisions", "exceptions", "outputs", "risks", "dependencies",
      ]);
      if (fields.length) processDiffs.push({
        processId: process.id,
        fields,
        steps: { added: addedSteps, removed: removedSteps, reordered: stepsReordered },
      });
      correctedReportProcesses.push(nextContent);

      updates.push(
        db.update(processVersions).set({
          summary: correction.objective,
          contentJson: JSON.stringify(nextContent),
          changeSummary: "Rascunho corrigido pelo dono antes da publicação",
        }).where(and(
          eq(processVersions.id, version.id),
          eq(processVersions.organizationId, context.organizationId),
          eq(processVersions.status, "DRAFT"),
        )),
        db.update(processes).set({
          title: correction.title,
          area: correction.area,
          ownerName: correction.ownerRole,
          automationReadiness: readiness.score,
          updatedAt: new Date().toISOString(),
        }).where(and(eq(processes.id, process.id), eq(processes.organizationId, context.organizationId))),
      );
    }

    nextReport.processes = correctedReportProcesses;

    const reportFields = changedFields(originalReport, nextReport, ["companyContext", "executiveSummary", "findings", "priorities"]);
    const now = new Date().toISOString();
    await db.batch([
      db.update(reports).set({ contentJson: JSON.stringify(nextReport), updatedAt: now }).where(and(
        eq(reports.id, report.id),
        eq(reports.organizationId, context.organizationId),
        eq(reports.updatedAt, report.updatedAt),
      )),
      ...updates,
      db.insert(auditEvents).values({
        id: crypto.randomUUID(),
        organizationId: context.organizationId,
        actorUserId: context.userId,
        actorType: "USER",
        action: "IMPLEMENTATION_REVIEW_CORRECTED",
        entityType: "report",
        entityId: report.id,
        metadataJson: JSON.stringify({ reportFields, processes: processDiffs, evidencePreserved: true }),
      }),
    ]);

    return Response.json({
      status: "AWAITING_OWNER",
      reportFields,
      correctedProcesses: processDiffs.length,
      evidencePreserved: true,
      updatedAt: now,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "As correções não foram salvas. O rascunho anterior permanece intacto." }, { status: 500 });
  }
}
