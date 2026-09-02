import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { processes, suggestions } from "@/db/schema";
import { requireWorkspaceContext } from "@/lib/workspace";
import { runSuggestionAnalysis } from "@/lib/suggestions/analyze";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    const { id } = await params;
    const db = getDb();
    const [suggestion] = await db.select().from(suggestions).where(and(eq(suggestions.id, id), eq(suggestions.organizationId, context.organizationId))).limit(1);
    if (!suggestion) return Response.json({ error: "Sugestão não encontrada." }, { status: 404 });
    if (!["PENDING", "NEEDS_CLARIFICATION"].includes(suggestion.status)) return Response.json({ error: "A análise só pode ser refeita antes do teste." }, { status: 409 });
    if (suggestion.analysisStatus === "ANALYZING") return Response.json({ error: "Esta sugestão já está sendo analisada." }, { status: 409 });
    if (context.role === "OPERATOR" && suggestion.authorUserId !== context.userId) return Response.json({ error: "Você não pode reanalisar esta sugestão." }, { status: 403 });
    if (context.role === "PROCESS_OWNER") {
      const [process] = await db.select().from(processes).where(and(eq(processes.id, suggestion.processId), eq(processes.organizationId, context.organizationId))).limit(1);
      if (process?.ownerUserId !== context.userId) return Response.json({ error: "Este processo pertence a outro responsável." }, { status: 403 });
    }
    const result = await runSuggestionAnalysis(context, id);
    return Response.json({ id, status: "COMPLETED", analysis: result.artifact, provenance: result.provenance, model: result.model });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "A sugestão foi preservada, mas a análise da IA não terminou." }, { status: 500 });
  }
}
