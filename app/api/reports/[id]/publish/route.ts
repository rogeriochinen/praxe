import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { interviewSessions, processVersions, processes, reports } from "@/db/schema";
import { requireWorkspaceContext, writeAudit } from "@/lib/workspace";
import { implementationAnalysisSchema } from "@/lib/implementation/contracts";
import { strengthenFounderAbsenceFindings } from "@/lib/implementation/founder-absence";
import { normalizeOperationalProcess } from "@/lib/implementation/operational-text";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    if (!["OWNER", "CONSULTANT"].includes(context.role)) return Response.json({ error: "Apenas o dono ou consultor pode publicar a implantação." }, { status: 403 });
    const { id } = await params;
    const db = getDb();
    const [report] = await db.select().from(reports).where(and(eq(reports.id, id), eq(reports.organizationId, context.organizationId))).limit(1);
    if (!report) return Response.json({ error: "Relatório não encontrado." }, { status: 404 });
    if (report.status === "PUBLISHED") return Response.json({ status: "PUBLISHED", alreadyPublished: true });
    let reportSource: { captureKind?: string; interviewId?: string } = {};
    let normalizedReportContent = report.contentJson;
    try {
      const stored = JSON.parse(report.contentJson) as Record<string, unknown>;
      reportSource = (stored as { source?: typeof reportSource }).source || {};
      const parsed = implementationAnalysisSchema.safeParse(stored);
      if (parsed.success) normalizedReportContent = JSON.stringify({ ...stored, ...strengthenFounderAbsenceFindings(parsed.data) });
    } catch { reportSource = {}; }

    const draftVersions = await db.select().from(processVersions).innerJoin(processes, eq(processes.id, processVersions.processId)).where(and(
      eq(processVersions.organizationId, context.organizationId),
      eq(processVersions.status, "DRAFT"),
      ...(reportSource.captureKind === "EXPANSION" ? [eq(processes.sourceInterviewId, report.interviewId)] : []),
    )).then((rows) => rows.map((row) => row.process_versions));
    for (const version of draftVersions) {
      const normalizedContent = normalizeOperationalProcess(JSON.parse(version.contentJson) as Record<string, unknown>);
      await db.batch([
        db.update(processVersions).set({ status: "CURRENT", contentJson: JSON.stringify(normalizedContent), publishedByUserId: context.userId }).where(and(eq(processVersions.id, version.id), eq(processVersions.organizationId, context.organizationId))),
        db.update(processes).set({ status: "PUBLISHED", currentVersionId: version.id, updatedAt: new Date().toISOString() }).where(and(eq(processes.id, version.processId), eq(processes.organizationId, context.organizationId))),
      ]);
    }
    await db.batch([
      db.update(reports).set({ status: "PUBLISHED", contentJson: normalizedReportContent, updatedAt: new Date().toISOString() }).where(and(eq(reports.id, report.id), eq(reports.organizationId, context.organizationId))),
      db.update(interviewSessions).set({ status: "REVIEWED" }).where(and(eq(interviewSessions.id, report.interviewId), eq(interviewSessions.organizationId, context.organizationId))),
    ]);
    await writeAudit(context, "IMPLEMENTATION_PUBLISHED", "report", report.id, { interviewId: report.interviewId, processCount: draftVersions.length });
    return Response.json({ status: "PUBLISHED", processCount: draftVersions.length });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "A publicação não foi concluída; os rascunhos foram preservados." }, { status: 500 });
  }
}
