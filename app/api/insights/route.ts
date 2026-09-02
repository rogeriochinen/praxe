import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { insights, sourceAssets } from "@/db/schema";
import { requireWorkspaceContext, writeAudit } from "@/lib/workspace";
import { transcribeAudio } from "@/lib/ai/provider";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ALLOWED_AUDIO = new Set(["audio/webm", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-m4a", "audio/ogg"]);

export async function POST(request: Request) {
  let cleanupSource: (() => Promise<void>) | null = null;
  let insightCreated = false;
  try {
    const context = await requireWorkspaceContext();
    const type = request.headers.get("content-type") ?? "";
    let transcript = "";
    let sourceObjectKey: string | null = null;

    if (type.includes("multipart/form-data")) {
      const form = await request.formData();
      const audio = form.get("audio");
      const note = String(form.get("note") ?? "").trim();
      if (!(audio instanceof File)) return Response.json({ error: "Áudio obrigatório." }, { status: 400 });
      if (!ALLOWED_AUDIO.has(audio.type) || audio.size === 0 || audio.size > MAX_AUDIO_BYTES) return Response.json({ error: "Use um áudio WEBM, MP3, M4A, MP4, WAV ou OGG de até 25 MB." }, { status: 400 });
      const assetId = crypto.randomUUID();
      sourceObjectKey = `org/${context.organizationId}/audio/${assetId}`;
      await env.BUCKET.put(sourceObjectKey, await audio.arrayBuffer(), { httpMetadata: { contentType: audio.type }, customMetadata: { organizationId: context.organizationId, uploadedBy: context.userId } });
      try {
        await getDb().insert(sourceAssets).values({ id: assetId, organizationId: context.organizationId, createdByUserId: context.userId, kind: "AUDIO", objectKey: sourceObjectKey, contentType: audio.type, byteSize: audio.size });
      } catch (error) {
        await env.BUCKET.delete(sourceObjectKey);
        throw error;
      }
      cleanupSource = async () => {
        await getDb().delete(sourceAssets).where(eq(sourceAssets.id, assetId));
        await env.BUCKET.delete(sourceObjectKey!);
      };
      const audioTranscript = await transcribeAudio(audio);
      transcript = [audioTranscript ? `TRANSCRIÇÃO DO ÁUDIO:\n${audioTranscript}` : "", note ? `CONTEXTO ADICIONAL DO DONO:\n${note}` : ""].filter(Boolean).join("\n\n");
      if (!transcript) throw new Response(JSON.stringify({ error: "Não foi possível transcrever o áudio. Tente novamente ou acrescente uma nota." }), { status: 422, headers: { "Content-Type": "application/json" } });
    } else {
      const payload = await request.json() as { text?: string };
      transcript = payload.text?.trim() ?? "";
    }

    transcript = transcript.trim();
    if (transcript.length < 5 || transcript.length > 8000) return Response.json({ error: "O insight transcrito deve ter entre 5 e 8.000 caracteres." }, { status: 400 });

    const id = crypto.randomUUID();
    const title = transcript.split(/[.!?\n]/)[0].slice(0, 110) || "Novo insight operacional";
    await getDb().insert(insights).values({ id, organizationId: context.organizationId, authorUserId: context.userId, title, transcript, sourceObjectKey, status: "NEW" });
    insightCreated = true;
    await writeAudit(context, "INSIGHT_CREATED", "insight", id, { hasAudio: !!sourceObjectKey });
    return Response.json({ id, status: "NEW" }, { status: 201 });
  } catch (error) {
    if (!insightCreated && cleanupSource) { try { await cleanupSource(); } catch { /* best-effort rollback */ } }
    if (error instanceof Response) return error;
    return Response.json({ error: "Não foi possível registrar o insight. Seus dados não foram publicados." }, { status: 500 });
  }
}
