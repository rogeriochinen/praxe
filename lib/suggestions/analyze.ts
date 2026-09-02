import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiRuns, auditEvents, processVersions, processes, suggestions } from "@/db/schema";
import { analyzeSuggestion } from "@/lib/ai/provider";
import { promptCatalog } from "@/lib/ai/prompts";
import type { WorkspaceContext } from "@/lib/workspace";

async function sha256(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function runSuggestionAnalysis(context: WorkspaceContext, suggestionId: string) {
  const db = getDb();
  const runId = crypto.randomUUID();
  const [suggestion] = await db.select().from(suggestions).where(and(eq(suggestions.id, suggestionId), eq(suggestions.organizationId, context.organizationId))).limit(1);
  if (!suggestion) throw new Error("SUGGESTION_NOT_FOUND");
  try {
    const [processRows, versionRows] = await Promise.all([
      db.select().from(processes).where(eq(processes.organizationId, context.organizationId)),
      db.select().from(processVersions).where(eq(processVersions.organizationId, context.organizationId)),
    ]);
    const versionMap = new Map(versionRows.map((version) => [version.id, version]));
    const candidates = processRows.map((process) => {
      const version = versionMap.get(process.currentVersionId || "") || versionRows.find((candidate) => candidate.processId === process.id);
      const content = version ? JSON.parse(version.contentJson) as { dependencies?: string[]; steps?: Array<{ key: string; title: string; body: string }> } : {};
      return { id: process.id, title: process.title, area: process.area, summary: version?.summary || "", dependencies: content.dependencies || [], steps: content.steps || [] };
    });
    const source = `TEXTO VIGENTE:\n${suggestion.currentText}\n\nTEXTO PROPOSTO PELO OPERADOR:\n${suggestion.proposedText}\n\nJUSTIFICATIVA DO OPERADOR:\n${suggestion.rationale}`;
    const inputHash = await sha256(JSON.stringify({ source, processId: suggestion.processId, stepKey: suggestion.stepKey, candidates }));
    await db.batch([
      db.update(suggestions).set({ analysisStatus: "ANALYZING", updatedAt: new Date().toISOString() }).where(and(eq(suggestions.id, suggestionId), eq(suggestions.organizationId, context.organizationId))),
      db.insert(aiRuns).values({ id: runId, organizationId: context.organizationId, suggestionId, promptId: "P-05S", promptVersion: promptCatalog["P-05S"].version, schemaVersion: "1.0.0", model: "pending", provenance: "LOCAL", inputHash, status: "RUNNING" }),
    ]);
    const result = await analyzeSuggestion(source, candidates, suggestion.processId, suggestion.stepKey);
    const confidence = result.artifact.confidence === "HIGH" ? 90 : result.artifact.confidence === "MEDIUM" ? 76 : 48;
    const now = new Date().toISOString();
    await db.batch([
      db.update(aiRuns).set({ model: result.model, provenance: result.provenance, status: "COMPLETED", outputJson: JSON.stringify(result.artifact), latencyMs: result.latencyMs, inputTokens: result.inputTokens, outputTokens: result.outputTokens, completedAt: now }).where(and(eq(aiRuns.id, runId), eq(aiRuns.organizationId, context.organizationId))),
      db.update(suggestions).set({ analysisStatus: "COMPLETED", analysisJson: JSON.stringify(result.artifact), aiRecommendation: result.artifact.recommendation, aiConfidence: confidence, updatedAt: now }).where(and(eq(suggestions.id, suggestionId), eq(suggestions.organizationId, context.organizationId))),
      db.insert(auditEvents).values({ id: crypto.randomUUID(), organizationId: context.organizationId, actorType: "AI", action: "SUGGESTION_ANALYZED", entityType: "suggestion", entityId: suggestionId, metadataJson: JSON.stringify({ runId, provenance: result.provenance, model: result.model, promptVersion: promptCatalog["P-05S"].version }) }),
    ]);
    return result;
  } catch (error) {
    const now = new Date().toISOString();
    try {
      await db.batch([
        db.update(aiRuns).set({ status: "FAILED", errorCode: error instanceof Error ? error.message.slice(0, 80) : "UNKNOWN", completedAt: now }).where(and(eq(aiRuns.id, runId), eq(aiRuns.organizationId, context.organizationId))),
        db.update(suggestions).set({ analysisStatus: "FAILED", updatedAt: now }).where(and(eq(suggestions.id, suggestionId), eq(suggestions.organizationId, context.organizationId))),
      ]);
    } catch { /* suggestion remains preserved */ }
    throw error;
  }
}
