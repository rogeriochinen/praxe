import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { processes, processVersions, suggestions } from "@/db/schema";
import { requireWorkspaceContext, writeAudit } from "@/lib/workspace";
import { runSuggestionAnalysis } from "@/lib/suggestions/analyze";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    const { id: processId } = await params;
    const payload = await request.json() as { stepKey?: string; proposedText?: string; rationale?: string };
    if (!payload.stepKey || !payload.proposedText?.trim() || !payload.rationale?.trim()) return Response.json({ error: "Passo, mudança e justificativa são obrigatórios." }, { status: 400 });
    if (payload.stepKey.length > 80 || payload.proposedText.trim().length > 4000 || payload.rationale.trim().length > 2000) return Response.json({ error: "A sugestão excede o limite permitido." }, { status: 400 });
    const db = getDb();
    const [process] = await db.select().from(processes).where(and(eq(processes.id, processId), eq(processes.organizationId, context.organizationId))).limit(1);
    if (!process?.currentVersionId) return Response.json({ error: "Processo não encontrado." }, { status: 404 });
    const [version] = await db.select().from(processVersions).where(and(eq(processVersions.id, process.currentVersionId), eq(processVersions.organizationId, context.organizationId))).limit(1);
    if (!version) return Response.json({ error: "Versão vigente indisponível." }, { status: 409 });
    const content = JSON.parse(version.contentJson) as { steps?: Array<{ key: string; body: string }> };
    const step = content.steps?.find((item) => item.key === payload.stepKey);
    if (!step) return Response.json({ error: "Este passo não pertence à versão vigente." }, { status: 409 });
    const id = crypto.randomUUID();
    await db.insert(suggestions).values({ id, organizationId: context.organizationId, processId, baseVersionId: version.id, stepKey: payload.stepKey, authorUserId: context.userId, currentText: step.body, proposedText: payload.proposedText.trim(), rationale: payload.rationale.trim(), analysisStatus: "ANALYZING", status: "PENDING" });
    await writeAudit(context, "SUGGESTION_CREATED", "suggestion", id, { processId, baseVersionId: version.id, stepKey: payload.stepKey });
    try {
      const analysis = await runSuggestionAnalysis(context, id);
      return Response.json({ id, status: "PENDING", analysisStatus: "COMPLETED", analysis: analysis.artifact }, { status: 201 });
    } catch {
      return Response.json({ id, status: "PENDING", analysisStatus: "FAILED", analysisWarning: "A sugestão foi salva e pode ser analisada novamente na caixa de decisões." }, { status: 201 });
    }
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Não foi possível enviar a sugestão." }, { status: 500 });
  }
}
