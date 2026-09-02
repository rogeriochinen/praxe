import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("AI calls disable provider-side storage and require structured output", async () => {
  const source = await readFile(new URL("../lib/ai/provider.ts", import.meta.url), "utf8");
  const implementation = await readFile(new URL("../lib/implementation/engine.ts", import.meta.url), "utf8");
  assert.match(source, /store:\s*false/);
  assert.match(source, /type:\s*"json_schema"/);
  assert.match(source, /impactAnalysisSchema\.parse/);
  assert.match(implementation, /store:\s*false/);
  assert.match(implementation, /implementationAnalysisSchema\.parse/);
  assert.match(implementation, /provenance:\s*"LOCAL"/);
  assert.doesNotMatch(implementation, /provenance:\s*"MOCK"/);
});

test("all eight prompts are versioned", async () => {
  const source = await readFile(new URL("../lib/ai/prompts.ts", import.meta.url), "utf8");
  for (let index = 1; index <= 8; index++) assert.match(source, new RegExp(`"P-0${index}"`));
  assert.match(source, /nunca publica processos/i);
  assert.match(source, /processes deve conter entre 1 e 12 itens/i);
  assert.match(source, /DESCOBRIR[\s\S]*ESTRUTURAR[\s\S]*SINTETIZAR/);
  assert.match(source, /"P-05S"/);
});

test("dashboard metrics are explainable and automation readiness uses a deterministic 0-100 rubric", async () => {
  const metric = await readFile(new URL("../lib/metrics/automation-readiness.ts", import.meta.url), "utf8");
  const prompt = await readFile(new URL("../lib/ai/prompts.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../lib/workspace.ts", import.meta.url), "utf8");
  const product = await readFile(new URL("../components/product-app.tsx", import.meta.url), "utf8");
  assert.match(metric, /automation-readiness-v2/);
  assert.match(metric, /Padronização/);
  assert.match(metric, /Regras objetivas/);
  assert.match(metric, /Dados e integrações/);
  assert.match(metric, /Exceções controladas/);
  assert.match(metric, /Rastreabilidade/);
  assert.match(prompt, /nunca uma fração entre 0 e 1/i);
  assert.match(workspace, /calculateAutomationReadiness/);
  assert.match(product, /Entenda a métrica/);
  assert.match(product, /Prontidão para automação/);
  assert.match(product, /A decisão de automatizar ainda exige validação humana/);
});

test("operator suggestions receive a traceable AI impact analysis before testing", async () => {
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  const provider = await readFile(new URL("../lib/ai/provider.ts", import.meta.url), "utf8");
  const create = await readFile(new URL("../app/api/processes/[id]/suggestions/route.ts", import.meta.url), "utf8");
  const analyze = await readFile(new URL("../app/api/suggestions/[id]/analyze/route.ts", import.meta.url), "utf8");
  const decision = await readFile(new URL("../app/api/suggestions/[id]/decision/route.ts", import.meta.url), "utf8");
  const product = await readFile(new URL("../components/product-app.tsx", import.meta.url), "utf8");
  assert.match(schema, /analysisStatus/);
  assert.match(schema, /suggestionId/);
  assert.match(provider, /analyzeSuggestion/);
  assert.match(provider, /suggestionAnalysisJsonSchema/);
  assert.match(provider, /promptCatalog\["P-05S"\]/);
  assert.match(create, /runSuggestionAnalysis/);
  assert.match(create, /analysisWarning/);
  assert.match(analyze, /context\.organizationId/);
  assert.match(analyze, /Esta sugestão já está sendo analisada/);
  assert.match(decision, /Aguarde a análise da IA terminar/);
  assert.match(product, /Análise da IA/);
  assert.match(product, /Vale testar/);
  assert.match(product, /Plano de teste sugerido/);
  assert.match(product, /Sugestão da IA para o desenho do teste/);
  assert.match(product, /prompt P-05S/);
});

test("initial analysis consumes the prompt catalog and recovers explicitly from provider failure", async () => {
  const implementation = await readFile(new URL("../lib/implementation/engine.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/interviews/route.ts", import.meta.url), "utf8");
  assert.match(implementation, /implementationSystemPrompt/);
  assert.match(implementation, /evidence-engine-v1:fallback/);
  assert.match(implementation, /fallbackReason/);
  assert.match(route, /ANALYSIS_RETURNED_NO_PROCESSES/);
  assert.match(route, /analysisWarning/);
});

test("legacy demo cleanup removes dependent rows before process roots", async () => {
  const route = await readFile(new URL("../app/api/interviews/route.ts", import.meta.url), "utf8");
  const cleanupStart = route.indexOf("async function removeKnownDemoData");
  const cleanupEnd = route.indexOf("async function parseInput", cleanupStart);
  const cleanup = route.slice(cleanupStart, cleanupEnd);

  assert.ok(cleanup.indexOf("db.update(insights).set({ primaryProcessId: null })") < cleanup.indexOf("db.delete(processes)"));
  assert.ok(cleanup.indexOf("db.delete(insights)") < cleanup.indexOf("db.delete(processes)"));
  assert.ok(cleanup.indexOf("db.delete(experimentReadings)") < cleanup.indexOf("db.delete(suggestions)"));
  assert.match(route, /INTERVIEW_ANALYSIS_FAILED/);
  assert.doesNotMatch(route, /nenhum processo publicado/);
});

test("failed, empty, or stale analysis can be retried", async () => {
  const workspace = await readFile(new URL("../lib/workspace.ts", import.meta.url), "utf8");
  const product = await readFile(new URL("../components/product-app.tsx", import.meta.url), "utf8");
  assert.match(workspace, /implementationIncomplete/);
  assert.match(workspace, /5 \* 60 \* 1000/);
  assert.match(workspace, /retryNotice/);
  assert.match(product, /Tentar novamente/);
});

test("implementation creates drafts and requires a separate human publish action", async () => {
  const create = await readFile(new URL("../app/api/interviews/route.ts", import.meta.url), "utf8");
  const publish = await readFile(new URL("../app/api/reports/[id]/publish/route.ts", import.meta.url), "utf8");
  assert.match(create, /status:\s*"IN_VALIDATION"/);
  assert.match(create, /status:\s*"DRAFT"/);
  assert.match(create, /currentVersionId:\s*null/);
  assert.match(publish, /IMPLEMENTATION_PUBLISHED/);
  assert.match(publish, /status:\s*"CURRENT"/);
  assert.match(publish, /status:\s*"PUBLISHED"/);
});

test("owner can correct the review draft without changing interview evidence or publishing", async () => {
  const route = await readFile(new URL("../app/api/reports/[id]/review/route.ts", import.meta.url), "utf8");
  const product = await readFile(new URL("../components/product-app.tsx", import.meta.url), "utf8");
  assert.match(route, /\["OWNER",\s*"CONSULTANT"\]/);
  assert.match(route, /report\.status === "PUBLISHED"/);
  assert.match(route, /evidence:\s*originalFindings\[index\]\?\.evidence/);
  assert.match(route, /evidence:\s*originalStep\?\.evidence/);
  assert.match(route, /origin:\s*"OWNER_CORRECTION"/);
  assert.match(route, /addedSteps/);
  assert.match(route, /removedSteps/);
  assert.match(route, /IMPLEMENTATION_REVIEW_CORRECTED/);
  assert.match(product, /Corrigir antes de aprovar/);
  assert.match(product, /Salvar correções/);
  assert.match(product, /Salvar mantém o status/);
  assert.match(product, /Adicionar etapa/);
  assert.match(product, /Excluir etapa/);
  assert.match(product, /Mover etapa/);
  assert.match(product, /Processos para revisar/);
  assert.match(product, /Editor do processo selecionado/);
  assert.match(product, /sm:max-w-\[1500px\]/);
  assert.match(product, /resize-y/);
});

test("transcript uploads are validated, preserved, and remain traceable", async () => {
  const source = await readFile(new URL("../app/api/interviews/route.ts", import.meta.url), "utf8");
  assert.match(source, /form\.get\("transcriptFile"\)/);
  assert.match(source, /MAX_TRANSCRIPT_FILE_BYTES/);
  assert.match(source, /"TRANSCRIPT"/);
  assert.match(source, /sourceAssetIds/);
  assert.match(source, /parseTranscriptFile/);
});

test("owners can add unmapped processes after onboarding without overwriting the library", async () => {
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  const capture = await readFile(new URL("../app/api/interviews/route.ts", import.meta.url), "utf8");
  const engine = await readFile(new URL("../lib/implementation/engine.ts", import.meta.url), "utf8");
  const publish = await readFile(new URL("../app/api/reports/[id]/publish/route.ts", import.meta.url), "utf8");
  const product = await readFile(new URL("../components/product-app.tsx", import.meta.url), "utf8");
  assert.match(schema, /sourceInterviewId/);
  assert.match(capture, /captureKind.*EXPANSION/);
  assert.match(capture, /isExistingProcess/);
  assert.match(capture, /skippedExistingCount/);
  assert.match(capture, /sourceInterviewId:\s*interviewId/);
  assert.match(capture, /reportId:\s*processRecords\.length \? reportId : null/);
  assert.match(engine, /existingProcesses/);
  assert.match(engine, /captureMode/);
  assert.match(publish, /processes\.sourceInterviewId/);
  assert.match(product, /Novos mapeamentos/);
  assert.match(product, /Adicionar novo mapeamento/);
  assert.match(product, /Mapear novos processos/);
  assert.match(product, /Somente processos novos viram rascunhos/);
  assert.match(product, /use <strong>Novos insights<\/strong>/);
});

test("one owner can create and switch isolated business workspaces in the MVP", async () => {
  const workspace = await readFile(new URL("../lib/workspace.ts", import.meta.url), "utf8");
  const businesses = await readFile(new URL("../app/api/businesses/route.ts", import.meta.url), "utf8");
  const product = await readFile(new URL("../components/product-app.tsx", import.meta.url), "utf8");
  assert.match(workspace, /ACTIVE_BUSINESS_COOKIE/);
  assert.match(workspace, /selectedOrganizationId/);
  assert.match(workspace, /membershipRows\.find/);
  assert.match(workspace, /businesses:\s*businessRows\.map/);
  assert.match(businesses, /BUSINESS_CREATED/);
  assert.match(businesses, /Set-Cookie/);
  assert.match(businesses, /eq\(memberships\.userId, context\.userId\)/);
  assert.match(businesses, /Você não tem acesso a este negócio/);
  assert.match(product, /Negócios mapeados/);
  assert.match(product, /Novo negócio/);
  assert.match(product, /Trocar negócio/);
  assert.match(product, /Criar e começar/);
});

test("published changes require a human decision endpoint", async () => {
  const source = await readFile(new URL("../app/api/suggestions/[id]/decision/route.ts", import.meta.url), "utf8");
  assert.match(source, /\["OWNER",\s*"PROCESS_OWNER"\]/);
  assert.match(source, /PROCESS_VERSION_PUBLISHED/);
  assert.match(source, /SUPERSEDED/);
  assert.match(source, /currentVersionId/);
  assert.match(source, /SUGGESTION_PILOT_STARTED/);
  assert.match(source, /baselineValue/);
  assert.match(source, /targetValue/);
  assert.match(source, /monitoringUntil/);
  assert.match(source, /decisionReason/);
  assert.match(source, /SUGGESTION_PILOT_EXTENDED/);
});

test("decision experiments persist measurements, due alerts, and 90-day follow-up", async () => {
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../lib/workspace.ts", import.meta.url), "utf8");
  const metrics = await readFile(new URL("../app/api/suggestions/[id]/metrics/route.ts", import.meta.url), "utf8");
  const product = await readFile(new URL("../components/product-app.tsx", import.meta.url), "utf8");
  assert.match(schema, /suggestionExperiments/);
  assert.match(schema, /experimentReadings/);
  assert.match(schema, /POST_APPROVAL/);
  assert.match(workspace, /reviewDue/);
  assert.match(workspace, /monitoringActive/);
  assert.match(metrics, /EXPERIMENT_METRIC_RECORDED/);
  assert.match(product, /Ciclo de decisões/);
  assert.match(product, /Aguardando avaliação|Avaliação vencida/);
  assert.match(product, /Registrar acompanhamento/);
  assert.match(product, /Por que foi rejeitada/);
  assert.match(product, /O teste terminou\. Os dados precisam de uma decisão/);
});

test("voice insights are transcribed, analyzed, and gated by an owner decision", async () => {
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  const capture = await readFile(new URL("../app/api/insights/route.ts", import.meta.url), "utf8");
  const analyze = await readFile(new URL("../app/api/insights/[id]/analyze/route.ts", import.meta.url), "utf8");
  const decide = await readFile(new URL("../app/api/insights/[id]/decision/route.ts", import.meta.url), "utf8");
  const product = await readFile(new URL("../components/product-app.tsx", import.meta.url), "utf8");
  assert.match(capture, /form\.get\("audio"\)/);
  assert.match(capture, /transcribeAudio\(audio\)/);
  assert.match(capture, /env\.BUCKET\.put/);
  assert.match(analyze, /analyzeInsight\(insight\.transcript, candidates\)/);
  assert.match(analyze, /inArray\(insights\.status/);
  assert.match(analyze, /AWAITING_DECISION/);
  assert.match(decide, /impactAnalysisSchema\.parse/);
  assert.match(decide, /INSIGHT_APPROVED_FOR_PILOT/);
  assert.match(decide, /sourceInsightId: item\.id/);
  assert.match(decide, /INSIGHT_REJECTED/);
  assert.match(schema, /linkedSuggestionId/);
  assert.match(schema, /sourceInsightId/);
  assert.match(schema, /suggestions_source_insight_uq/);
  assert.match(product, /Gravar áudio/);
  assert.match(product, /Confirmar vínculo antes do teste/);
  assert.match(product, /Aprovar para teste/);
  assert.match(product, /Decisões › Rejeitadas/);
  assert.match(product, /Ver análise de impacto completa/);
  assert.match(product, /Texto experimental da etapa/);
  assert.match(product, /Áudio original preservado/);
  assert.match(product, /Evidências do insight/);
  assert.match(product, /Tentar nova análise/);
  assert.match(product, /prompt P-05/);
});

test("linked insight status follows its experiment and final decision", async () => {
  const decision = await readFile(new URL("../app/api/suggestions/[id]/decision/route.ts", import.meta.url), "utf8");
  assert.match(decision, /sourceInsightId/);
  assert.match(decision, /Somente uma decisão pendente pode iniciar um teste/);
  assert.match(decision, /só pode ser aprovada depois de um teste ativo/);
  assert.match(decision, /status:\s*"IN_TEST"/);
  assert.match(decision, /status:\s*"APPROVED"/);
  assert.match(decision, /status:\s*"REJECTED"/);
});

test("tenant filters are present on mutable business routes", async () => {
  const paths = [
    "../app/api/insights/[id]/analyze/route.ts",
    "../app/api/insights/[id]/decision/route.ts",
    "../app/api/processes/[id]/suggestions/route.ts",
    "../app/api/suggestions/[id]/analyze/route.ts",
    "../app/api/suggestions/[id]/decision/route.ts",
    "../app/api/suggestions/[id]/metrics/route.ts",
    "../app/api/reports/[id]/review/route.ts",
    "../app/api/assistant/messages/[id]/feedback/route.ts",
    "../app/api/assistant/messages/[id]/gap/route.ts",
  ];
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /organizationId/);
    assert.match(source, /context\.organizationId/);
  }
});

test("company assistant answers only from the current published process versions", async () => {
  const route = await readFile(new URL("../app/api/assistant/route.ts", import.meta.url), "utf8");
  const provider = await readFile(new URL("../lib/ai/company-assistant.ts", import.meta.url), "utf8");
  const prompt = await readFile(new URL("../lib/ai/prompts.ts", import.meta.url), "utf8");
  assert.match(route, /eq\(processes\.status, "PUBLISHED"\)/);
  assert.match(route, /eq\(processVersions\.status, "CURRENT"\)/);
  assert.match(route, /eq\(processes\.organizationId, organizationId\)/);
  assert.match(provider, /promptCatalog\["P-07"\]/);
  assert.match(provider, /store:\s*false/);
  assert.match(provider, /type:\s*"json_schema"/);
  assert.match(provider, /companyAssistantAnswerSchema\.parse/);
  assert.match(provider, /exactExcerpt/);
  assert.match(provider, /A resposta gerada não apresentou uma citação válida/);
  assert.match(prompt, /somente com base em publishedProcessVersions/i);
});

test("company assistant conversations are isolated by business and user", async () => {
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/assistant/route.ts", import.meta.url), "utf8");
  const feedback = await readFile(new URL("../app/api/assistant/messages/[id]/feedback/route.ts", import.meta.url), "utf8");
  const gap = await readFile(new URL("../app/api/assistant/messages/[id]/gap/route.ts", import.meta.url), "utf8");
  assert.match(schema, /assistantConversations/);
  assert.match(schema, /assistantMessages/);
  assert.match(schema, /assistant_conversations_org_user_idx/);
  assert.match(schema, /assistant_messages_conversation_idx/);
  for (const source of [route, feedback, gap]) {
    assert.match(source, /context\.organizationId/);
    assert.match(source, /context\.userId/);
  }
});

test("company assistant exposes sources, feedback, history, and gap-to-insight recovery", async () => {
  const product = await readFile(new URL("../components/product-app.tsx", import.meta.url), "utf8");
  const gap = await readFile(new URL("../app/api/assistant/messages/[id]/gap/route.ts", import.meta.url), "utf8");
  assert.match(product, /Pergunte à empresa/);
  assert.match(product, /somente versões oficiais/i);
  assert.match(product, /Fontes oficiais/);
  assert.match(product, /Nova conversa/);
  assert.match(product, /Registrar como insight/);
  assert.match(product, /Abrir processo oficial/);
  assert.match(gap, /COMPANY_ASSISTANT_GAP_REGISTERED/);
  assert.match(gap, /status:\s*"NEW"/);
});

test("new diagnostics strengthen founder-absence findings without generic labels", async () => {
  const prompt = await readFile(new URL("../lib/ai/prompts.ts", import.meta.url), "utf8");
  const engine = await readFile(new URL("../lib/implementation/engine.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../lib/workspace.ts", import.meta.url), "utf8");
  const publish = await readFile(new URL("../app/api/reports/[id]/publish/route.ts", import.meta.url), "utf8");
  const findings = await readFile(new URL("../lib/implementation/founder-absence.ts", import.meta.url), "utf8");
  assert.match(prompt, /o que quebra se o dono se afastar por 30 dias/i);
  assert.match(prompt, /proibido usar títulos genéricos/i);
  assert.match(engine, /strengthenFounderAbsenceFindings/);
  assert.match(workspace, /reportContent/);
  assert.match(workspace, /strengthenFounderAbsenceFindings/);
  assert.match(publish, /normalizedReportContent/);
  assert.match(publish, /strengthenFounderAbsenceFindings/);
  assert.match(findings, /founder-absence-v2/);
});

test("every process step offers the correct improvement path before and after publication", async () => {
  const product = await readFile(new URL("../components/product-app.tsx", import.meta.url), "utf8");
  assert.match(product, /row\.status === "PUBLISHED" \? onSuggest\(step\) : onEdit\(row\.id, step\.key\)/);
  assert.match(product, /Como ainda é rascunho, a alteração será feita diretamente na revisão/);
  assert.match(product, /initialStepKey/);
  assert.match(product, /scrollIntoView/);
  assert.match(product, /Sugerir melhoria/);
});

test("process drafts never expose raw transcript markup as operational steps", async () => {
  const prompt = await readFile(new URL("../lib/ai/prompts.ts", import.meta.url), "utf8");
  const engine = await readFile(new URL("../lib/implementation/engine.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../lib/workspace.ts", import.meta.url), "utf8");
  const product = await readFile(new URL("../components/product-app.tsx", import.meta.url), "utf8");
  const publish = await readFile(new URL("../app/api/reports/[id]/publish/route.ts", import.meta.url), "utf8");
  assert.match(prompt, /Não use “Etapa N”, timestamp, nome ou iniciais do falante, Markdown/i);
  assert.match(prompt, /exclusivamente nos campos evidence/i);
  assert.match(engine, /parseTranscriptSpeechLine/);
  assert.match(engine, /normalizeOperationalProcess/);
  assert.match(workspace, /normalizedVersion/);
  assert.match(product, /normalizeOperationalProcess/);
  assert.match(publish, /normalizedContent/);
});
