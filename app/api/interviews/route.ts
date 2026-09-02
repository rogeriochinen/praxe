import { and, eq, inArray } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import {
  aiRuns,
  assistantMessages,
  experimentReadings,
  insights,
  interviewSessions,
  organizations,
  processVersions,
  processes,
  reports,
  sourceAssets,
  suggestionExperiments,
  suggestions,
} from "@/db/schema";
import { analyzeImplementation } from "@/lib/implementation/engine";
import { transcribeAudio } from "@/lib/ai/provider";
import { promptCatalog } from "@/lib/ai/prompts";
import { MAX_TRANSCRIPT_FILE_BYTES, isSupportedTranscriptFile, parseTranscriptFile } from "@/lib/transcripts/parser";
import { requireWorkspaceContext, writeAudit } from "@/lib/workspace";

const DEMO_PROCESS_TITLES = [
  "Fechamento de caixa",
  "Onboarding de clientes",
  "Compras e reposição",
  "Tratamento de reclamações",
];
const ALLOWED_AUDIO = new Set(["audio/webm", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-m4a", "audio/ogg"]);
const ALLOWED_TRANSCRIPT_MIME = new Set([
  "", "text/plain", "text/markdown", "text/vtt", "text/x-srt",
  "application/x-subrip", "application/srt", "application/vtt", "application/octet-stream",
]);

type RuntimeBucket = {
  put(key: string, value: ReadableStream, options?: unknown): Promise<unknown>;
  delete(key: string): Promise<void>;
};

async function preserveSourceFile(file: File, kind: "AUDIO" | "TRANSCRIPT", organizationId: string, userId: string) {
  const runtime = env as unknown as { BUCKET?: RuntimeBucket };
  if (!runtime.BUCKET) throw new Response("O armazenamento de arquivos está temporariamente indisponível.", { status: 503 });
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-") || (kind === "AUDIO" ? "entrevista.webm" : "transcricao.txt");
  const objectKey = `organizations/${organizationId}/interviews/${id}/${safeName}`;
  await runtime.BUCKET.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type || "text/plain" } });
  try {
    await getDb().insert(sourceAssets).values({
      id, organizationId, createdByUserId: userId, kind,
      objectKey, contentType: file.type || "text/plain", byteSize: file.size,
    });
  } catch (error) {
    await runtime.BUCKET.delete(objectKey);
    throw error;
  }
  return id;
}

async function removeKnownDemoData(organizationId: string) {
  const db = getDb();
  const seededInsightTitles = [
    "Automatizar a conferência de comprovantes",
    "Reposição sem aprovação até R$ 800",
    "Checklist único para novo cliente",
  ];
  const [demoRows, seeded] = await Promise.all([
    db.select({ id: processes.id }).from(processes).where(and(
      eq(processes.organizationId, organizationId),
      inArray(processes.title, DEMO_PROCESS_TITLES),
    )),
    db.select({ id: insights.id }).from(insights).where(and(
      eq(insights.organizationId, organizationId),
      inArray(insights.title, seededInsightTitles),
    )),
  ]);
  const processIds = demoRows.map((row) => row.id);
  const insightIds = seeded.map((row) => row.id);
  const suggestionRows = processIds.length
    ? await db.select({ id: suggestions.id }).from(suggestions).where(and(
      eq(suggestions.organizationId, organizationId),
      inArray(suggestions.processId, processIds),
    ))
    : [];
  const suggestionIds = suggestionRows.map((row) => row.id);
  const experimentRows = suggestionIds.length
    ? await db.select({ id: suggestionExperiments.id }).from(suggestionExperiments).where(and(
      eq(suggestionExperiments.organizationId, organizationId),
      inArray(suggestionExperiments.suggestionId, suggestionIds),
    ))
    : [];
  const experimentIds = experimentRows.map((row) => row.id);
  const cleanup = [];

  // Delete from the leaves toward the legacy process roots so D1 foreign keys
  // never block a real onboarding after the user has interacted with demo data.
  if (experimentIds.length) cleanup.push(
    db.delete(experimentReadings).where(and(eq(experimentReadings.organizationId, organizationId), inArray(experimentReadings.experimentId, experimentIds))),
  );
  if (suggestionIds.length) cleanup.push(
    db.delete(suggestionExperiments).where(and(eq(suggestionExperiments.organizationId, organizationId), inArray(suggestionExperiments.suggestionId, suggestionIds))),
    db.delete(aiRuns).where(and(eq(aiRuns.organizationId, organizationId), inArray(aiRuns.suggestionId, suggestionIds))),
    db.update(insights).set({ linkedSuggestionId: null }).where(and(eq(insights.organizationId, organizationId), inArray(insights.linkedSuggestionId, suggestionIds))),
  );
  if (insightIds.length) cleanup.push(
    db.update(assistantMessages).set({ linkedInsightId: null }).where(and(eq(assistantMessages.organizationId, organizationId), inArray(assistantMessages.linkedInsightId, insightIds))),
    db.delete(aiRuns).where(and(eq(aiRuns.organizationId, organizationId), inArray(aiRuns.insightId, insightIds))),
  );
  if (processIds.length) cleanup.push(
    db.update(insights).set({ primaryProcessId: null }).where(and(eq(insights.organizationId, organizationId), inArray(insights.primaryProcessId, processIds))),
  );
  if (suggestionIds.length) cleanup.push(
    db.delete(suggestions).where(and(eq(suggestions.organizationId, organizationId), inArray(suggestions.id, suggestionIds))),
  );
  if (insightIds.length) cleanup.push(
    db.delete(insights).where(and(eq(insights.organizationId, organizationId), inArray(insights.id, insightIds))),
  );
  if (processIds.length) cleanup.push(
    db.delete(processVersions).where(and(eq(processVersions.organizationId, organizationId), inArray(processVersions.processId, processIds))),
    db.delete(processes).where(and(eq(processes.organizationId, organizationId), inArray(processes.id, processIds))),
  );
  if (cleanup.length) await db.batch(cleanup as Parameters<typeof db.batch>[0]);
}

async function parseInput(request: Request, organizationId: string, userId: string) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    const payload = await request.json() as { title?: string; companyName?: string; transcript?: string; captureKind?: string };
    return {
      title: payload.title?.trim() || "Entrevista com o dono",
      companyName: payload.companyName?.trim() || "Minha empresa",
      transcript: payload.transcript?.trim() || "",
      captureKind: payload.captureKind === "EXPANSION" ? "EXPANSION" as const : "INITIAL" as const,
      sourceAssetIds: [] as string[],
      transcriptFile: null as null | { name: string; format: string; wordCount: number; speakerCount: number; cueCount: number; durationSeconds: number | null },
    };
  }

  const form = await request.formData();
  const audio = form.get("audio");
  const transcriptFile = form.get("transcriptFile");
  const suppliedTranscript = String(form.get("transcript") || "").trim();
  const title = String(form.get("title") || "Entrevista com o dono").trim();
  const companyName = String(form.get("companyName") || "Minha empresa").trim();
  const captureKind = form.get("captureKind") === "EXPANSION" ? "EXPANSION" as const : "INITIAL" as const;
  const sourceAssetIds: string[] = [];
  let transcript = suppliedTranscript;
  let hasValidTranscriptFile = false;
  let transcriptFileMetadata: null | { name: string; format: string; wordCount: number; speakerCount: number; cueCount: number; durationSeconds: number | null } = null;

  if (transcriptFile instanceof File && transcriptFile.size > 0) {
    if (transcriptFile.size > MAX_TRANSCRIPT_FILE_BYTES) throw new Response("A transcrição deve ter no máximo 8 MB.", { status: 413 });
    if (!isSupportedTranscriptFile(transcriptFile.name) || !ALLOWED_TRANSCRIPT_MIME.has(transcriptFile.type.toLowerCase())) {
      throw new Response("Formato de transcrição não aceito. Envie TXT, MD, SRT ou VTT.", { status: 415 });
    }
    let parsed;
    try { parsed = await parseTranscriptFile(transcriptFile); }
    catch (error) { throw new Response(error instanceof Error ? error.message : "Não foi possível extrair a transcrição.", { status: 422 }); }
    if (!transcript) transcript = parsed.normalizedText;
    hasValidTranscriptFile = true;
    transcriptFileMetadata = {
      name: transcriptFile.name, format: parsed.format, wordCount: parsed.wordCount,
      speakerCount: parsed.speakerCount, cueCount: parsed.cueCount, durationSeconds: parsed.durationSeconds,
    };
  }

  if (audio instanceof File && audio.size > 0) {
    if (audio.size > 25 * 1024 * 1024) throw new Response("O áudio deve ter no máximo 25 MB.", { status: 413 });
    if (!ALLOWED_AUDIO.has(audio.type)) throw new Response("Formato de áudio não aceito. Use WebM, MP3, MP4, M4A, WAV ou OGG.", { status: 415 });
    if (!transcript) {
      const generated = await transcribeAudio(audio);
      if (!generated) throw new Response("A transcrição por IA ainda não está configurada. Grave com transcrição ao vivo, cole o texto ou envie um arquivo de transcrição.", { status: 422 });
      transcript = generated;
    }
  }
  if (transcript.length < 200 || transcript.length > 90000) {
    throw new Response("A transcrição deve ter entre 200 e 90.000 caracteres.", { status: 400 });
  }
  if (hasValidTranscriptFile && transcriptFile instanceof File) {
    sourceAssetIds.push(await preserveSourceFile(transcriptFile, "TRANSCRIPT", organizationId, userId));
  }
  if (audio instanceof File && audio.size > 0) {
    sourceAssetIds.push(await preserveSourceFile(audio, "AUDIO", organizationId, userId));
  }
  return { title, companyName, transcript, captureKind, sourceAssetIds, transcriptFile: transcriptFileMetadata };
}

type ExistingProcess = { id: string; title: string; area: string; objective: string; trigger: string; outputs: string[] };

const TITLE_STOP_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "com", "um", "uma", "processo", "gestao"]);

function normalizedWords(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length > 1 && !TITLE_STOP_WORDS.has(word));
}

function isExistingProcess(candidate: { title: string; area: string }, existing: ExistingProcess[]) {
  const candidateWords = new Set(normalizedWords(candidate.title));
  const candidateTitle = [...candidateWords].join(" ");
  return existing.find((item) => {
    const existingWords = new Set(normalizedWords(item.title));
    const existingTitle = [...existingWords].join(" ");
    if (candidateTitle === existingTitle || candidateTitle.includes(existingTitle) || existingTitle.includes(candidateTitle)) return true;
    const intersection = [...candidateWords].filter((word) => existingWords.has(word)).length;
    const union = new Set([...candidateWords, ...existingWords]).size;
    return union > 0 && intersection / union >= 0.55 && item.area.toLocaleLowerCase("pt-BR") === candidate.area.toLocaleLowerCase("pt-BR");
  }) ?? null;
}

export async function POST(request: Request) {
  let interviewId: string | null = null;
  let failureStage = "READ_REQUEST";
  try {
    const context = await requireWorkspaceContext();
    if (!["OWNER", "CONSULTANT"].includes(context.role)) return Response.json({ error: "Apenas o dono ou consultor pode iniciar um novo mapeamento." }, { status: 403 });
    failureStage = "PARSE_INPUT";
    const input = await parseInput(request, context.organizationId, context.userId);
    if (input.transcript.length < 200 || input.transcript.length > 90000) {
      return Response.json({ error: "A transcrição deve ter entre 200 e 90.000 caracteres." }, { status: 400 });
    }
    interviewId = crypto.randomUUID();
    const db = getDb();
    failureStage = "REMOVE_LEGACY_DEMO";
    if (input.captureKind === "INITIAL") await removeKnownDemoData(context.organizationId);
    failureStage = "SAVE_INTERVIEW";
    await db.insert(interviewSessions).values({
      id: interviewId, organizationId: context.organizationId, createdByUserId: context.userId,
      title: input.title, transcript: input.transcript, status: "PROCESSING",
      analysisJson: JSON.stringify({ phase: "ANALYZING", sourceAssetIds: input.sourceAssetIds, transcriptFile: input.transcriptFile }),
    });
    await writeAudit(context, "INTERVIEW_RECEIVED", "interview", interviewId, {
      characterCount: input.transcript.length, sourceAssetCount: input.sourceAssetIds.length, transcriptFile: input.transcriptFile,
    });

    failureStage = "ANALYZE_INTERVIEW";
    const [existingProcessRows, existingVersionRows] = input.captureKind === "EXPANSION" ? await Promise.all([
      db.select().from(processes).where(eq(processes.organizationId, context.organizationId)),
      db.select().from(processVersions).where(eq(processVersions.organizationId, context.organizationId)),
    ]) : [[], []];
    const existingCatalog: ExistingProcess[] = existingProcessRows.map((process) => {
      const version = existingVersionRows.find((item) => item.id === process.currentVersionId) || existingVersionRows.find((item) => item.processId === process.id);
      let content: { objective?: string; trigger?: string; outputs?: string[] } = {};
      try { content = version ? JSON.parse(version.contentJson) as typeof content : {}; } catch { content = {}; }
      return { id: process.id, title: process.title, area: process.area, objective: content.objective || version?.summary || "", trigger: content.trigger || "", outputs: content.outputs || [] };
    });
    const result = await analyzeImplementation(input.transcript, input.companyName, existingCatalog);
    if (!result.analysis.processes.length) throw new Error("ANALYSIS_RETURNED_NO_PROCESSES");
    failureStage = "SAVE_DIAGNOSIS";
    const matchedExisting = new Map<string, string>();
    const newProcesses = input.captureKind === "EXPANSION" ? result.analysis.processes.filter((process) => {
      const match = isExistingProcess(process, existingCatalog);
      if (match) matchedExisting.set(process.title, match.title);
      return !match;
    }) : result.analysis.processes;
    const reportId = crypto.randomUUID();
    const reportContent = {
      ...result.analysis,
      founderAbsenceVersion: "founder-absence-v2",
      processes: newProcesses,
      founderDependency: result.dependency,
      provenance: result.provenance,
      model: result.model,
      analysisWarning: result.fallbackReason ? "A análise externa não respondeu. Os rascunhos foram gerados pelo motor local auditável e precisam de revisão humana." : null,
      source: { interviewId, title: input.title, captureKind: input.captureKind, sourceAssetIds: input.sourceAssetIds, transcriptFile: input.transcriptFile },
      expansionOutcome: { newProcessCount: newProcesses.length, skippedExistingCount: matchedExisting.size, matchedExisting: [...matchedExisting.entries()].map(([candidate, existing]) => ({ candidate, existing })) },
    };
    const processRecords = newProcesses.map((process) => {
      const processId = crypto.randomUUID();
      const versionId = crypto.randomUUID();
      return { process, processId, versionId };
    });
    const runId = crypto.randomUUID();

    await db.batch([
      db.update(organizations).set({ name: result.analysis.companyName }).where(eq(organizations.id, context.organizationId)),
      db.update(interviewSessions).set({ status: "ANALYZED", analysisJson: JSON.stringify(reportContent) }).where(and(eq(interviewSessions.id, interviewId), eq(interviewSessions.organizationId, context.organizationId))),
      ...(processRecords.length ? [db.insert(reports).values({
        id: reportId, organizationId: context.organizationId, interviewId, status: "AWAITING_OWNER",
        contentJson: JSON.stringify(reportContent), createdByUserId: context.userId,
      })] : []),
      db.insert(aiRuns).values({
        id: runId, organizationId: context.organizationId, promptId: "P-01",
        promptVersion: promptCatalog["P-01"].version, schemaVersion: "implementation-analysis-v1",
        model: result.model, provenance: result.provenance, inputHash: `${input.transcript.length}:${input.transcript.slice(0, 32)}`,
        status: result.provenance === "OPENAI" ? "COMPLETED" : "NEEDS_REVIEW",
        outputJson: JSON.stringify({ reportId: processRecords.length ? reportId : null, processCount: processRecords.length, skippedExistingCount: matchedExisting.size, fallbackReason: result.fallbackReason ?? null }),
        latencyMs: result.latencyMs, inputTokens: result.inputTokens, outputTokens: result.outputTokens,
        completedAt: new Date().toISOString(),
      }),
      ...processRecords.flatMap(({ process, processId, versionId }) => [
        db.insert(processes).values({
          id: processId, organizationId: context.organizationId, sourceInterviewId: interviewId, title: process.title, area: process.area,
          ownerName: process.ownerRole, status: "IN_VALIDATION",
          dependencyScore: result.dependency.score, automationReadiness: process.automationReadiness,
          currentVersionId: null,
        }),
        db.insert(processVersions).values({
          id: versionId, organizationId: context.organizationId, processId, versionNumber: 1, status: "DRAFT",
          summary: process.objective, contentJson: JSON.stringify(process), changeSummary: input.captureKind === "EXPANSION" ? "Gerado a partir de mapeamento complementar" : "Gerado a partir da entrevista inicial",
          createdByUserId: context.userId, publishedByUserId: null,
        }),
      ]),
    ]);
    await writeAudit(context, input.captureKind === "EXPANSION" ? "EXPANSION_MAPPING_ANALYZED" : "IMPLEMENTATION_ANALYZED", processRecords.length ? "report" : "interview", processRecords.length ? reportId : interviewId, {
      interviewId, processCount: processRecords.length, provenance: result.provenance, score: result.dependency.score,
      skippedExistingCount: matchedExisting.size, fallbackReason: result.fallbackReason ?? null,
    }, result.provenance === "OPENAI" ? "AI" : "SYSTEM");
    return Response.json({ interviewId, reportId: processRecords.length ? reportId : null, provenance: result.provenance, processCount: processRecords.length, skippedExistingCount: matchedExisting.size }, { status: 201 });
  } catch (error) {
    console.error("INTERVIEW_ANALYSIS_FAILED", {
      stage: failureStage,
      interviewId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    if (interviewId && !(error instanceof Response)) {
      try {
        await getDb().update(interviewSessions).set({ status: "FAILED", analysisJson: JSON.stringify({ phase: "FAILED", error: "ANALYSIS_FAILED" }) }).where(eq(interviewSessions.id, interviewId));
      } catch { /* Preserve the original failure. */ }
    }
    if (error instanceof Response) {
      const message = await error.text();
      return Response.json({ error: message || "A solicitação não pôde ser processada." }, { status: error.status });
    }
    return Response.json({ error: "A análise não foi concluída. Sua fonte foi preservada; tente novamente para gerar os rascunhos dos processos." }, { status: 500 });
  }
}
