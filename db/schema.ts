import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () => text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("users_email_uq").on(t.email)]);

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const memberships = sqliteTable("memberships", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role", { enum: ["CONSULTANT", "OWNER", "PROCESS_OWNER", "OPERATOR"] }).notNull(),
  status: text("status", { enum: ["ACTIVE", "REVOKED"] }).notNull().default("ACTIVE"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("memberships_org_user_uq").on(t.organizationId, t.userId),
  index("memberships_user_idx").on(t.userId, t.status),
]);

export const processes = sqliteTable("processes", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  sourceInterviewId: text("source_interview_id"),
  title: text("title").notNull(),
  area: text("area").notNull(),
  ownerName: text("owner_name").notNull(),
  ownerUserId: text("owner_user_id").references(() => users.id),
  status: text("status", { enum: ["CAPTURED", "IN_VALIDATION", "PUBLISHED", "ARCHIVED"] }).notNull(),
  dependencyScore: integer("dependency_score").notNull().default(0),
  automationReadiness: integer("automation_readiness").notNull().default(0),
  currentVersionId: text("current_version_id"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("processes_org_status_idx").on(t.organizationId, t.status)]);

export const processVersions = sqliteTable("process_versions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  processId: text("process_id").notNull().references(() => processes.id),
  versionNumber: integer("version_number").notNull(),
  status: text("status", { enum: ["DRAFT", "CURRENT", "SUPERSEDED"] }).notNull(),
  summary: text("summary").notNull(),
  contentJson: text("content_json").notNull(),
  changeSummary: text("change_summary").notNull().default("Versão inicial"),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  publishedByUserId: text("published_by_user_id").references(() => users.id),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("versions_process_number_uq").on(t.processId, t.versionNumber),
  index("versions_org_process_idx").on(t.organizationId, t.processId, t.status),
]);

export const insights = sqliteTable("insights", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  authorUserId: text("author_user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  transcript: text("transcript").notNull(),
  sourceObjectKey: text("source_object_key"),
  status: text("status", { enum: ["NEW", "ANALYZING", "AWAITING_DECISION", "FORWARDED", "IN_TEST", "APPROVED", "REJECTED", "REVIEW_REQUIRED", "FAILED"] }).notNull(),
  primaryProcessId: text("primary_process_id").references(() => processes.id),
  confidence: integer("confidence"),
  recommendation: text("recommendation"),
  analysisJson: text("analysis_json"),
  decisionReason: text("decision_reason"),
  linkedSuggestionId: text("linked_suggestion_id"),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("insights_org_status_idx").on(t.organizationId, t.status)]);

export const suggestions = sqliteTable("suggestions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  processId: text("process_id").notNull().references(() => processes.id),
  baseVersionId: text("base_version_id").notNull().references(() => processVersions.id),
  stepKey: text("step_key").notNull(),
  authorUserId: text("author_user_id").notNull().references(() => users.id),
  currentText: text("current_text").notNull(),
  proposedText: text("proposed_text").notNull(),
  rationale: text("rationale").notNull(),
  sourceInsightId: text("source_insight_id").references(() => insights.id),
  analysisStatus: text("analysis_status", { enum: ["ANALYZING", "COMPLETED", "FAILED"] }),
  analysisJson: text("analysis_json"),
  aiRecommendation: text("ai_recommendation"),
  aiConfidence: integer("ai_confidence"),
  status: text("status", { enum: ["PENDING", "NEEDS_CLARIFICATION", "IN_TEST", "APPROVED", "REJECTED"] }).notNull(),
  decisionReason: text("decision_reason"),
  revision: integer("revision").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index("suggestions_org_status_idx").on(t.organizationId, t.status),
  uniqueIndex("suggestions_source_insight_uq").on(t.sourceInsightId),
]);

export const suggestionExperiments = sqliteTable("suggestion_experiments", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  suggestionId: text("suggestion_id").notNull().references(() => suggestions.id),
  responsibleName: text("responsible_name").notNull(),
  metricName: text("metric_name").notNull(),
  metricUnit: text("metric_unit").notNull(),
  desiredDirection: text("desired_direction", { enum: ["INCREASE", "DECREASE"] }).notNull(),
  baselineValue: real("baseline_value").notNull(),
  targetValue: real("target_value").notNull(),
  guardrailMetric: text("guardrail_metric"),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  status: text("status", { enum: ["ACTIVE", "COMPLETED", "CANCELLED"] }).notNull(),
  resultValue: real("result_value"),
  resultNotes: text("result_notes"),
  decisionReason: text("decision_reason"),
  monitoringUntil: text("monitoring_until"),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  uniqueIndex("suggestion_experiments_suggestion_uq").on(t.suggestionId),
  index("suggestion_experiments_org_status_idx").on(t.organizationId, t.status),
]);

export const experimentReadings = sqliteTable("experiment_readings", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  experimentId: text("experiment_id").notNull().references(() => suggestionExperiments.id),
  phase: text("phase", { enum: ["TEST", "POST_APPROVAL"] }).notNull(),
  measuredAt: text("measured_at").notNull(),
  value: real("value").notNull(),
  source: text("source").notNull(),
  notes: text("notes"),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index("experiment_readings_org_experiment_idx").on(t.organizationId, t.experimentId, t.measuredAt)]);

export const aiRuns = sqliteTable("ai_runs", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  insightId: text("insight_id").references(() => insights.id),
  suggestionId: text("suggestion_id").references(() => suggestions.id),
  promptId: text("prompt_id").notNull(),
  promptVersion: text("prompt_version").notNull(),
  schemaVersion: text("schema_version").notNull(),
  model: text("model").notNull(),
  provenance: text("provenance", { enum: ["OPENAI", "LOCAL"] }).notNull(),
  inputHash: text("input_hash").notNull(),
  status: text("status", { enum: ["QUEUED", "RUNNING", "COMPLETED", "NEEDS_REVIEW", "REFUSED", "INCOMPLETE", "INVALID_OUTPUT", "FAILED"] }).notNull(),
  outputJson: text("output_json"),
  errorCode: text("error_code"),
  latencyMs: integer("latency_ms"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdAt: createdAt(),
  completedAt: text("completed_at"),
}, (t) => [index("ai_runs_org_insight_idx").on(t.organizationId, t.insightId)]);

export const sourceAssets = sqliteTable("source_assets", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  kind: text("kind", { enum: ["AUDIO", "TRANSCRIPT", "DOCUMENT"] }).notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("source_assets_key_uq").on(t.objectKey), index("source_assets_org_idx").on(t.organizationId)]);

export const interviewSessions = sqliteTable("interview_sessions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  transcript: text("transcript").notNull(),
  status: text("status", { enum: ["IMPORTED", "PROCESSING", "ANALYZED", "REVIEWED", "FAILED"] }).notNull(),
  analysisJson: text("analysis_json"),
  createdAt: createdAt(),
}, (t) => [index("interviews_org_idx").on(t.organizationId, t.createdAt)]);

export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  interviewId: text("interview_id").notNull().references(() => interviewSessions.id),
  status: text("status", { enum: ["DRAFT", "AWAITING_OWNER", "PUBLISHED"] }).notNull(),
  contentJson: text("content_json").notNull(),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("reports_org_status_idx").on(t.organizationId, t.status)]);

export const assistantConversations = sqliteTable("assistant_conversations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  status: text("status", { enum: ["ACTIVE", "ARCHIVED"] }).notNull().default("ACTIVE"),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index("assistant_conversations_org_user_idx").on(t.organizationId, t.createdByUserId, t.updatedAt),
]);

export const assistantMessages = sqliteTable("assistant_messages", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  conversationId: text("conversation_id").notNull().references(() => assistantConversations.id),
  authorUserId: text("author_user_id").references(() => users.id),
  role: text("role", { enum: ["USER", "ASSISTANT"] }).notNull(),
  content: text("content").notNull(),
  answerStatus: text("answer_status", { enum: ["ANSWERED", "GAP", "NEEDS_CLARIFICATION"] }),
  confidence: text("confidence", { enum: ["LOW", "MEDIUM", "HIGH"] }),
  citationsJson: text("citations_json").notNull().default("[]"),
  suggestedQuestionsJson: text("suggested_questions_json").notNull().default("[]"),
  model: text("model"),
  provenance: text("provenance", { enum: ["OPENAI", "LOCAL"] }),
  promptVersion: text("prompt_version"),
  feedback: text("feedback", { enum: ["HELPFUL", "NOT_HELPFUL"] }),
  feedbackNote: text("feedback_note"),
  linkedInsightId: text("linked_insight_id").references(() => insights.id),
  createdAt: createdAt(),
}, (t) => [
  index("assistant_messages_conversation_idx").on(t.organizationId, t.conversationId, t.createdAt),
]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  actorUserId: text("actor_user_id").references(() => users.id),
  actorType: text("actor_type", { enum: ["USER", "SYSTEM", "AI"] }).notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: createdAt(),
}, (t) => [index("audit_org_created_idx").on(t.organizationId, t.createdAt)]);
