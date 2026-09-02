export const MAX_TRANSCRIPT_FILE_BYTES = 8 * 1024 * 1024;

export const SUPPORTED_TRANSCRIPT_EXTENSIONS = ["txt", "md", "srt", "vtt"] as const;
export type TranscriptFormat = Uppercase<(typeof SUPPORTED_TRANSCRIPT_EXTENSIONS)[number]>;

export type TranscriptFileSummary = {
  format: TranscriptFormat;
  wordCount: number;
  speakerCount: number;
  speakers: string[];
  cueCount: number;
  durationSeconds: number | null;
  durationIsEstimated: boolean;
};

export type ParsedTranscript = TranscriptFileSummary & {
  rawText: string;
  normalizedText: string;
};

const TIMESTAMP = /(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})/;
const SPEAKER = /^(?:\[[^\]]+\]\s*)?(?:[-–—]\s*)?([\p{L}][\p{L}\p{N} ._'’-]{0,48}):\s+\S/u;

function extensionFromName(fileName: string) {
  return fileName.trim().toLowerCase().split(".").pop() || "";
}

export function isSupportedTranscriptFile(fileName: string) {
  return (SUPPORTED_TRANSCRIPT_EXTENSIONS as readonly string[]).includes(extensionFromName(fileName));
}

export function transcriptFormatFromName(fileName: string): TranscriptFormat {
  const extension = extensionFromName(fileName);
  if (!isSupportedTranscriptFile(fileName)) {
    throw new Error("Formato não aceito. Envie TXT, MD, SRT ou VTT.");
  }
  return extension.toUpperCase() as TranscriptFormat;
}

function secondsFromTimestamp(value: string) {
  const match = value.match(TIMESTAMP);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  return hours * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

function compactTimestamp(value: string) {
  const match = value.match(TIMESTAMP);
  if (!match) return value.trim();
  const hours = Number(match[1] || 0);
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${match[2]}:${match[3]}`
    : `${match[2]}:${match[3]}`;
}

function detectSpeakers(text: string) {
  const candidates = new Map<string, { label: string; count: number }>();
  for (const line of text.split("\n")) {
    const match = line.trim().match(SPEAKER);
    if (!match) continue;
    const speaker = match[1].trim();
    const key = speaker.toLocaleLowerCase("pt-BR");
    const current = candidates.get(key);
    candidates.set(key, { label: current?.label || speaker, count: (current?.count || 0) + 1 });
  }
  const recognizedRole = /^(?:speaker|falante|dono|entrevistador|consultor|operador|participante|owner|host|guest|moderador)(?:\s+\d+)?$/i;
  const nonSpeakerLabel = /^(?:fatal|remote|removing|error|warning|info|note|output|input|status|result|command|objetivo|processo|etapa|resultado|entrada|saída|requisitos|observação|nota)$/i;
  return Array.from(candidates.values())
    .filter((candidate) => recognizedRole.test(candidate.label) || (candidate.count >= 2 && !nonSpeakerLabel.test(candidate.label)))
    .map((candidate) => candidate.label)
    .slice(0, 30);
}

function normalizePlainText(rawText: string) {
  return rawText
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function parseSubtitle(rawText: string, format: "SRT" | "VTT") {
  const prepared = normalizePlainText(rawText)
    .replace(/^WEBVTT[^\n]*\n?/i, "")
    .replace(/^NOTE(?:.|\n)*?(?=\n\s*\n|$)/gim, "");
  const blocks = prepared.split(/\n\s*\n/);
  const cues: { start: string; endSeconds: number; text: string }[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes("-->") && TIMESTAMP.test(line));
    if (timingIndex < 0) continue;
    const [startValue, endValue = ""] = lines[timingIndex].split("-->").map((part) => part.trim());
    const startSeconds = secondsFromTimestamp(startValue);
    const endSeconds = secondsFromTimestamp(endValue);
    if (startSeconds === null || endSeconds === null || endSeconds < startSeconds) continue;
    const cueText = lines.slice(timingIndex + 1)
      .join(" ")
      .replace(/<v\s+([^>]+)>/gi, "$1: ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cueText) cues.push({ start: compactTimestamp(startValue), endSeconds, text: cueText });
  }

  if (!cues.length) throw new Error(`Não encontramos legendas válidas no arquivo ${format}. Confira os timestamps e tente novamente.`);
  return {
    text: cues.map((cue) => `[${cue.start}] ${cue.text}`).join("\n"),
    cueCount: cues.length,
    durationSeconds: Math.ceil(Math.max(...cues.map((cue) => cue.endSeconds))),
  };
}

export function parseTranscriptText(rawInput: string, fileName: string): ParsedTranscript {
  const format = transcriptFormatFromName(fileName);
  const rawText = normalizePlainText(rawInput);
  if (!rawText) throw new Error("O arquivo está vazio.");
  const suspiciousControls = Array.from(rawText).filter((character) => {
    const code = character.charCodeAt(0);
    return code < 32 && ![9, 10, 13].includes(code);
  }).length;
  const replacementCharacters = rawText.match(/�/g)?.length || 0;
  if (suspiciousControls > Math.max(3, rawText.length * 0.005) || replacementCharacters > Math.max(3, rawText.length * 0.005)) {
    throw new Error("O arquivo parece ser binário ou está em uma codificação não suportada.");
  }

  const subtitle = format === "SRT" || format === "VTT" ? parseSubtitle(rawText, format) : null;
  const normalizedText = subtitle?.text || rawText;
  const words = normalizedText.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu) || [];
  const speakers = detectSpeakers(normalizedText);
  const durationSeconds = subtitle?.durationSeconds ?? (words.length ? Math.ceil((words.length / 150) * 60) : null);
  return {
    rawText,
    normalizedText,
    format,
    wordCount: words.length,
    speakers,
    speakerCount: speakers.length,
    cueCount: subtitle?.cueCount || 0,
    durationSeconds,
    durationIsEstimated: !subtitle,
  };
}

export async function parseTranscriptFile(file: File): Promise<ParsedTranscript> {
  if (file.size > MAX_TRANSCRIPT_FILE_BYTES) throw new Error("A transcrição deve ter no máximo 8 MB.");
  if (!isSupportedTranscriptFile(file.name)) throw new Error("Formato não aceito. Envie TXT, MD, SRT ou VTT.");
  return parseTranscriptText(await file.text(), file.name);
}

export function formatTranscriptDuration(seconds: number | null) {
  if (seconds === null) return "—";
  const rounded = Math.max(1, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainder = rounded % 60;
  return hours > 0
    ? `${hours}h ${String(minutes).padStart(2, "0")}min`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}
