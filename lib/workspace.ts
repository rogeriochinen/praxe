import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { getDb } from "@/db";
import {
  aiRuns,
  auditEvents,
  experimentReadings,
  insights,
  interviewSessions,
  memberships,
  organizations,
  processVersions,
  processes,
  reports,
  suggestionExperiments,
  suggestions,
  users,
} from "@/db/schema";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { calculateAutomationReadiness, type AutomationReadinessInput } from "@/lib/metrics/automation-readiness";
import { implementationAnalysisSchema } from "@/lib/implementation/contracts";
import { strengthenFounderAbsenceFindings } from "@/lib/implementation/founder-absence";
import { normalizeOperationalProcess } from "@/lib/implementation/operational-text";

export type WorkspaceContext = {
  userId: string;
  organizationId: string;
  role: "CONSULTANT" | "OWNER" | "PROCESS_OWNER" | "OPERATOR";
  email: string;
  displayName: string;
};

export const ACTIVE_BUSINESS_COOKIE = "pv_active_business";

function stableId(prefix: string, input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  return `${prefix}_${(hash >>> 0).toString(36)}`;
}

function cookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
  const identity = await getChatGPTUser();
  if (!identity) throw new Response("Não autenticado", { status: 401 });
  const db = getDb();
  const email = identity.email.trim().toLowerCase();
  const userId = stableId("usr", email);
  const defaultOrganizationId = stableId("org", email);
  const membershipId = stableId("mem", email);

  await db.insert(users).values({ id: userId, email, displayName: identity.displayName }).onConflictDoNothing();
  await db.insert(organizations).values({ id: defaultOrganizationId, name: "Minha empresa", createdByUserId: userId }).onConflictDoNothing();
  await db.insert(memberships).values({ id: membershipId, organizationId: defaultOrganizationId, userId, role: "OWNER", status: "ACTIVE" }).onConflictDoNothing();

  const membershipRows = await db.select().from(memberships).where(and(
    eq(memberships.userId, userId),
    eq(memberships.status, "ACTIVE"),
  ));
  const requestHeaders = await headers();
  const selectedOrganizationId = cookieValue(requestHeaders.get("cookie"), ACTIVE_BUSINESS_COOKIE);
  const membership = membershipRows.find((item) => item.organizationId === selectedOrganizationId)
    || membershipRows.find((item) => item.organizationId === defaultOrganizationId)
    || membershipRows[0];
  if (!membership) throw new Response("Acesso negado", { status: 403 });
  return { userId, organizationId: membership.organizationId, role: membership.role, email, displayName: identity.displayName };
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function reportContent(value: string) {
  const stored = parseJson<Record<string, unknown>>(value, {});
  const parsed = implementationAnalysisSchema.safeParse(stored);
  if (!parsed.success) return stored;
  return { ...stored, ...strengthenFounderAbsenceFindings(parsed.data) };
}

function isRecentProcessing(status: string, createdAt: string) {
  if (status !== "PROCESSING") return false;
  const parsed = Date.parse(createdAt.includes("T") ? createdAt : `${createdAt.replace(" ", "T")}Z`);
  return Number.isFinite(parsed) && Date.now() - parsed < 5 * 60 * 1000;
}

export async function getWorkspaceSnapshot(context: WorkspaceContext) {
  const db = getDb();
  const [organization, businessRows] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, context.organizationId)).limit(1).then((rows) => rows[0]),
    db.select({ id: organizations.id, name: organizations.name, role: memberships.role })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(and(eq(memberships.userId, context.userId), eq(memberships.status, "ACTIVE")))
      .orderBy(organizations.createdAt),
  ]);
  const interviewRows = await db.select().from(interviewSessions).where(eq(interviewSessions.organizationId, context.organizationId)).orderBy(desc(interviewSessions.createdAt));
  const hasRealImplementation = interviewRows.length > 0;

  if (!hasRealImplementation) {
    return {
      organization: { id: context.organizationId, name: organization?.name ?? "Minha empresa" },
      businesses: businessRows.map((business) => ({ ...business, active: business.id === context.organizationId })),
      membership: { role: context.role },
      onboardingRequired: true,
      retryNotice: null,
      aiConfigured: Boolean((env as unknown as { OPENAI_API_KEY?: string }).OPENAI_API_KEY),
      processes: [], insights: [], suggestions: [], reports: [], interviews: [],
    };
  }

  const [processRows, versionRows, insightRows, suggestionRows, experimentRows, readingRows, aiRunRows, reportRows] = await Promise.all([
    db.select().from(processes).where(eq(processes.organizationId, context.organizationId)).orderBy(desc(processes.updatedAt)),
    db.select().from(processVersions).where(eq(processVersions.organizationId, context.organizationId)),
    db.select().from(insights).where(eq(insights.organizationId, context.organizationId)).orderBy(desc(insights.createdAt)),
    db.select().from(suggestions).where(eq(suggestions.organizationId, context.organizationId)).orderBy(desc(suggestions.createdAt)),
    db.select().from(suggestionExperiments).where(eq(suggestionExperiments.organizationId, context.organizationId)).orderBy(desc(suggestionExperiments.createdAt)),
    db.select().from(experimentReadings).where(eq(experimentReadings.organizationId, context.organizationId)).orderBy(desc(experimentReadings.measuredAt)),
    db.select().from(aiRuns).where(eq(aiRuns.organizationId, context.organizationId)).orderBy(desc(aiRuns.createdAt)),
    db.select().from(reports).where(eq(reports.organizationId, context.organizationId)).orderBy(desc(reports.createdAt)),
  ]);
  const versionMap = new Map(versionRows.map((version) => [version.id, version]));
  const experimentMap = new Map(experimentRows.map((experiment) => [experiment.suggestionId, experiment]));
  const insightRunMap = new Map<string, typeof aiRunRows[number]>();
  for (const run of aiRunRows) if (run.insightId && !insightRunMap.has(run.insightId)) insightRunMap.set(run.insightId, run);
  const suggestionRunMap = new Map<string, typeof aiRunRows[number]>();
  for (const run of aiRunRows) if (run.suggestionId && !suggestionRunMap.has(run.suggestionId)) suggestionRunMap.set(run.suggestionId, run);
  const processing = interviewRows.some((interview) => isRecentProcessing(interview.status, interview.createdAt));
  const implementationIncomplete = reportRows.length === 0 || processRows.length === 0;

  return {
    organization: { id: context.organizationId, name: organization?.name ?? "Minha empresa" },
    businesses: businessRows.map((business) => ({ ...business, active: business.id === context.organizationId })),
    membership: { role: context.role },
    onboardingRequired: implementationIncomplete && !processing,
    retryNotice: implementationIncomplete && interviewRows.length > 0
      ? processRows.length === 0 && reportRows.length > 0
        ? "O diagnóstico anterior não gerou processos utilizáveis. Envie a transcrição novamente para reconstruir o relatório completo."
        : interviewRows[0]?.status === "PROCESSING"
          ? "A análise anterior foi interrompida antes de terminar. Sua fonte foi preservada; envie novamente para continuar."
          : "A tentativa anterior não terminou. Sua fonte foi preservada; envie novamente para gerar o diagnóstico e os processos."
      : null,
    aiConfigured: Boolean((env as unknown as { OPENAI_API_KEY?: string }).OPENAI_API_KEY),
    processes: processRows.map((process) => {
      const version = process.currentVersionId ? versionMap.get(process.currentVersionId) ?? null : versionRows.find((item) => item.processId === process.id) ?? null;
      const content = parseJson<AutomationReadinessInput>(version?.contentJson ?? null, {});
      const normalizedVersion = version ? { ...version, contentJson: JSON.stringify(normalizeOperationalProcess(parseJson(version.contentJson, {}))) } : null;
      return {
        ...process,
        automationReadiness: calculateAutomationReadiness(content).score,
        version: normalizedVersion,
      };
    }),
    insights: insightRows.map((insight) => {
      const run = insightRunMap.get(insight.id);
      return { ...insight, analysis: parseJson(insight.analysisJson, null), aiRun: run ? { model: run.model, provenance: run.provenance, promptVersion: run.promptVersion, status: run.status } : null };
    }),
    suggestions: suggestionRows.map((suggestion) => {
      const experiment = experimentMap.get(suggestion.id) ?? null;
      const run = suggestionRunMap.get(suggestion.id);
      return {
        ...suggestion,
        analysis: parseJson(suggestion.analysisJson, null),
        aiRun: run ? { model: run.model, provenance: run.provenance, promptVersion: run.promptVersion, status: run.status } : null,
        experiment: experiment ? {
          ...experiment,
          reviewDue: suggestion.status === "IN_TEST" && Date.parse(experiment.endsAt) <= Date.now(),
          monitoringActive: suggestion.status === "APPROVED" && Boolean(experiment.monitoringUntil) && Date.parse(experiment.monitoringUntil!) >= Date.now(),
          readings: readingRows.filter((reading) => reading.experimentId === experiment.id),
        } : null,
      };
    }),
    interviews: interviewRows.map((interview) => ({ ...interview, analysis: parseJson(interview.analysisJson, null) })),
    reports: reportRows.map((report) => ({ ...report, content: reportContent(report.contentJson) })),
  };
}

export async function writeAudit(context: WorkspaceContext, action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}, actorType: "USER" | "SYSTEM" | "AI" = "USER") {
  await getDb().insert(auditEvents).values({
    id: crypto.randomUUID(), organizationId: context.organizationId,
    actorUserId: actorType === "USER" ? context.userId : null,
    actorType, action, entityType, entityId, metadataJson: JSON.stringify(metadata),
  });
}
