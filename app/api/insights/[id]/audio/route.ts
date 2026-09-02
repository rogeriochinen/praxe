import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { insights } from "@/db/schema";
import { requireWorkspaceContext } from "@/lib/workspace";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    const { id } = await params;
    const [insight] = await getDb().select({ sourceObjectKey: insights.sourceObjectKey }).from(insights).where(and(eq(insights.id, id), eq(insights.organizationId, context.organizationId))).limit(1);
    if (!insight?.sourceObjectKey) return new Response("Áudio não encontrado.", { status: 404 });
    const object = await env.BUCKET.get(insight.sourceObjectKey);
    if (!object) return new Response("Áudio não encontrado.", { status: 404 });
    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType || "audio/webm",
        "Content-Length": String(object.size),
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="insight-${id}.webm"`,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return new Response("Não foi possível carregar o áudio.", { status: 500 });
  }
}
