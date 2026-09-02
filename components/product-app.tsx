"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity, AlertTriangle, Archive, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BellRing, BookOpen, BrainCircuit, Building2, CalendarDays, Check,
  CheckCircle2, ChevronRight, CircleGauge, ClipboardCheck, Clock3, FileAudio, FileText, GitBranch,
  Home, Info, Lightbulb, Loader2, MessageSquareText, Mic, Pause, Play, Quote,
  History, PencilLine, Plus, RefreshCw, Rocket, Save, Send, ShieldCheck, Sparkles, Target, ThumbsDown, ThumbsUp, Trash2, Upload, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatTranscriptDuration, parseTranscriptFile, type TranscriptFileSummary } from "@/lib/transcripts/parser";
import { calculateAutomationReadiness } from "@/lib/metrics/automation-readiness";
import { normalizeOperationalProcess } from "@/lib/implementation/operational-text";
import { PraxeLogo } from "@/components/praxe-logo";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";

type Evidence = { quote: string; speaker: string };
type ProcessContent = {
  title: string; area: string; objective: string; trigger: string; ownerRole: string;
  inputs: string[]; steps: { key: string; title: string; body: string; ownerRole: string; evidence: Evidence[] }[];
  decisions: string[]; exceptions: string[]; outputs: string[]; risks: string[]; dependencies: string[];
  automationReadiness: number; evidence: Evidence[];
};
type ProcessRow = {
  id: string; sourceInterviewId: string | null; title: string; area: string; ownerName: string; status: string;
  dependencyScore: number; automationReadiness: number; currentVersionId: string | null;
  version: null | { id: string; versionNumber: number; status: string; summary: string; contentJson: string };
};
type ReportContent = {
  companyName: string; companyContext: string; executiveSummary: string;
  founderDependency: { score: number; version: string; components: { key: string; label: string; value: number; weight: number }[] };
  findings: { title: string; detail: string; severity: "LOW" | "MEDIUM" | "HIGH"; evidence: Evidence[] }[];
  priorities: { title: string; whyNow: string; horizon: "7_DAYS" | "30_DAYS" | "90_DAYS"; expectedOutcome: string }[];
  roadmap: { period: string; actions: string[] }[];
  automationOpportunities: { title: string; impact: string; caution: string }[];
  openQuestions: string[]; provenance: "OPENAI" | "LOCAL"; model: string;
  analysisWarning?: string | null;
  source?: { interviewId: string; title: string; captureKind?: "INITIAL" | "EXPANSION"; sourceAssetIds?: string[] };
};
type InsightAnalysis = {
  title: string; summary: string; primaryProcessId: string | null; relatedProcessIds: string[]; routeStatus: "MATCHED" | "AMBIGUOUS" | "UNMAPPED";
  affectedSteps: string[]; affectedDependencies: string[]; newDependencies: string[]; possibleExceptions: string[]; currentVsProposed: { current: string; proposed: string };
  swot: { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] };
  expectedImprovements: string[]; impactDimensions: { time: string[]; cost: string[]; quality: string[]; risk: string[]; training: string[] };
  possibleWorsening: string[]; risksAndTradeoffs: string[]; evidence: { quote: string; relevance: string }[];
  assumptions: string[]; openQuestions: string[]; confidence: "LOW" | "MEDIUM" | "HIGH";
  recommendation: "APPROVE" | "PILOT" | "REJECT" | "NEED_MORE_INFO"; rationale: string;
};
type InsightRow = {
  id: string; title: string; transcript: string; status: string; confidence: number | null; recommendation: string | null;
  primaryProcessId: string | null; sourceObjectKey: string | null; decisionReason: string | null; linkedSuggestionId: string | null; createdAt: string; updatedAt: string;
  analysis: InsightAnalysis | null; aiRun: { model: string; provenance: "OPENAI" | "LOCAL"; promptVersion: string; status: string } | null;
};
type Workspace = {
  organization: { id: string; name: string }; membership: { role: string };
  businesses: { id: string; name: string; role: string; active: boolean }[];
  onboardingRequired: boolean; aiConfigured: boolean; retryNotice?: string | null;
  processes: ProcessRow[]; suggestions: Suggestion[]; insights: InsightRow[];
  interviews: { id: string; title: string; status: string; createdAt: string; analysis?: { source?: { captureKind?: "INITIAL" | "EXPANSION" }; expansionOutcome?: { newProcessCount: number; skippedExistingCount: number } } | null }[];
  reports: { id: string; status: string; content: ReportContent; createdAt: string; updatedAt: string }[];
};
type ExperimentReading = { id: string; phase: "TEST" | "POST_APPROVAL"; measuredAt: string; value: number; source: string; notes: string | null };
type SuggestionExperiment = {
  id: string; responsibleName: string; metricName: string; metricUnit: string; desiredDirection: "INCREASE" | "DECREASE";
  baselineValue: number; targetValue: number; guardrailMetric: string | null; startsAt: string; endsAt: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED"; resultValue: number | null; resultNotes: string | null;
  decisionReason: string | null; monitoringUntil: string | null; reviewDue: boolean; monitoringActive: boolean; readings: ExperimentReading[];
};
type Suggestion = {
  id: string; processId: string; stepKey: string; currentText: string; proposedText: string; rationale: string;
  status: "PENDING" | "NEEDS_CLARIFICATION" | "IN_TEST" | "APPROVED" | "REJECTED";
  decisionReason: string | null; sourceInsightId?: string | null; analysisStatus?: "ANALYZING" | "COMPLETED" | "FAILED" | null;
  aiRecommendation?: string | null; aiConfidence?: number | null; analysis?: SuggestionAnalysis | null;
  aiRun?: { model: string; provenance: "OPENAI" | "LOCAL"; promptVersion: string; status: string } | null;
  createdAt: string; updatedAt: string; experiment: SuggestionExperiment | null;
};
type SuggestionAnalysis = InsightAnalysis & { testPlan: { worthTesting: boolean; feasibility: "LOW" | "MEDIUM" | "HIGH"; primaryMetric: string; metricUnit: string; desiredDirection: "INCREASE" | "DECREASE"; baselineGuidance: string; targetGuidance: string; guardrailMetric: string; suggestedDurationDays: number; scope: string } };
type AssistantCitation = { processId: string; processTitle: string; versionId: string; versionNumber: number; stepKey: string | null; stepTitle: string | null; excerpt: string };
type AssistantMessage = {
  id: string; conversationId: string; role: "USER" | "ASSISTANT"; content: string;
  answerStatus: "ANSWERED" | "GAP" | "NEEDS_CLARIFICATION" | null; confidence: "LOW" | "MEDIUM" | "HIGH" | null;
  citations: AssistantCitation[]; suggestedQuestions: string[]; provenance: "OPENAI" | "LOCAL" | null;
  feedback: "HELPFUL" | "NOT_HELPFUL" | null; linkedInsightId: string | null; createdAt: string;
};
type AssistantConversation = { id: string; title: string; updatedAt: string };
type View = "report" | "processes" | "mapping" | "decisions" | "insights" | "overview";
type CaptureMode = "transcript" | "file" | "record" | "upload";

type RecognitionInstance = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: (() => void) | null; start(): void; stop(): void;
};

function readProcess(row: ProcessRow): ProcessContent {
  try { return normalizeOperationalProcess(JSON.parse(row.version?.contentJson || "{}") as ProcessContent); }
  catch { return { title: row.title, area: row.area, objective: row.version?.summary || "", trigger: "", ownerRole: row.ownerName, inputs: [], steps: [], decisions: [], exceptions: [], outputs: [], risks: [], dependencies: [], automationReadiness: row.automationReadiness, evidence: [] }; }
}

type ReviewProcess = ProcessContent & { id: string; versionId: string };
type ReviewDraft = {
  report: Pick<ReportContent, "companyContext" | "executiveSummary" | "findings" | "priorities">;
  processes: ReviewProcess[];
};

function createReviewDraft(report: ReportContent, rows: ProcessRow[]): ReviewDraft {
  return {
    report: JSON.parse(JSON.stringify({
      companyContext: report.companyContext,
      executiveSummary: report.executiveSummary,
      findings: report.findings,
      priorities: report.priorities,
    })) as ReviewDraft["report"],
    processes: rows.flatMap((row) => row.version ? [{
      ...JSON.parse(JSON.stringify(readProcess(row))) as ProcessContent,
      id: row.id,
      versionId: row.version.id,
    }] : []),
  };
}

function parseLines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

export function ProductApp({ user }: { user: { name: string; email: string; localDevelopment: boolean } }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<View>("report");
  const [selectedProcess, setSelectedProcess] = useState<ProcessRow | null>(null);
  const [suggestionTarget, setSuggestionTarget] = useState<{ process: ProcessRow; step: ProcessContent["steps"][number] } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewProcessId, setReviewProcessId] = useState<string | null>(null);
  const [reviewStepKey, setReviewStepKey] = useState<string | null>(null);
  const [reviewAlertDismissed, setReviewAlertDismissed] = useState(false);
  const [decisionFocusId, setDecisionFocusId] = useState<string | null>(null);
  const [mappingCaptureOpen, setMappingCaptureOpen] = useState(false);
  const [newBusinessOpen, setNewBusinessOpen] = useState(false);
  const [businessWorking, setBusinessWorking] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [toast, setToast] = useState("");

  async function loadWorkspace() {
    setLoadError("");
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar seu workspace.");
      setWorkspace(data);
      if (data.reports?.length) setView(data.reports[0].status === "PUBLISHED" ? "overview" : "report");
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Falha ao carregar."); }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar seu workspace.");
        if (!cancelled) {
          setWorkspace(data);
          if (data.reports?.length) setView(data.reports[0].status === "PUBLISHED" ? "overview" : "report");
        }
      })
      .catch((error: unknown) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : "Falha ao carregar."); });
    return () => { cancelled = true; };
  }, []);
  function flash(message: string) { setToast(message); window.setTimeout(() => setToast(""), 3600); }

  async function selectBusiness(organizationId: string) {
    if (workspace?.organization.id === organizationId || businessWorking) return;
    setBusinessWorking(true); setLoadError("");
    try {
      const response = await fetch("/api/businesses", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível trocar de negócio.");
      setSelectedProcess(null); setReviewOpen(false); setReviewStepKey(null); setDecisionFocusId(null); setMappingCaptureOpen(false); setAssistantOpen(false);
      await loadWorkspace();
      flash("Negócio alterado. Processos e decisões foram carregados no contexto correto.");
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Não foi possível trocar de negócio."); }
    finally { setBusinessWorking(false); }
  }

  if (loadError) return <FailureState message={loadError} retry={loadWorkspace} />;
  if (!workspace) return <LoadingState />;
  if (workspace.onboardingRequired) return <><ImplementationOnboarding user={user} aiConfigured={workspace.aiConfigured} retryNotice={workspace.retryNotice} businesses={workspace.businesses} activeBusinessId={workspace.organization.id} onBusinessSelect={selectBusiness} onNewBusiness={() => setNewBusinessOpen(true)} businessWorking={businessWorking} onComplete={async () => loadWorkspace()} /><NewBusinessDialog open={newBusinessOpen} onClose={() => setNewBusinessOpen(false)} onCreated={async (name) => { setNewBusinessOpen(false); setMappingCaptureOpen(false); await loadWorkspace(); flash(`${name} foi criado. Comece pela entrevista inicial.`); }} /></>;

  const latestInterview = workspace.interviews[0];
  if (!workspace.reports.length && latestInterview?.status === "PROCESSING") return <ProcessingState />;
  if (!workspace.reports.length) return <FailureState message="A entrevista foi preservada, mas o relatório não foi concluído." retry={loadWorkspace} />;

  if (mappingCaptureOpen) return <><ImplementationOnboarding
    user={user}
    aiConfigured={workspace.aiConfigured}
    businesses={workspace.businesses}
    activeBusinessId={workspace.organization.id}
    onBusinessSelect={selectBusiness}
    onNewBusiness={() => setNewBusinessOpen(true)}
    businessWorking={businessWorking}
    variant="expansion"
    companyNameDefault={workspace.organization.name}
    onCancel={() => setMappingCaptureOpen(false)}
    onComplete={async (result) => {
      setMappingCaptureOpen(false);
      await loadWorkspace();
      if ((result?.processCount ?? 0) > 0) {
        flash(`${result?.processCount} novo(s) processo(s) encontrado(s). Revise os rascunhos antes de publicar.`);
        setView("report");
      } else {
        flash("A captura foi preservada, mas não revelou um processo novo. Conteúdos sobre processos existentes devem seguir como insights ou sugestões.");
        setView("mapping");
      }
    }}
  /><NewBusinessDialog open={newBusinessOpen} onClose={() => setNewBusinessOpen(false)} onCreated={async (name) => { setNewBusinessOpen(false); setMappingCaptureOpen(false); await loadWorkspace(); flash(`${name} foi criado. Comece pela entrevista inicial.`); }} /></>;

  const report = workspace.reports[0];
  const sourceProcesses = report.content.source?.captureKind === "EXPANSION"
    ? workspace.processes.filter((row) => row.sourceInterviewId === report.content.source?.interviewId)
    : workspace.processes;
  const pendingSuggestions = workspace.suggestions.filter((item) => ["PENDING", "IN_TEST", "NEEDS_CLARIFICATION"].includes(item.status));
  const published = report.status === "PUBLISHED";
  const nav = [
    { id: "overview" as View, label: "Visão geral", icon: Home },
    { id: "report" as View, label: "Diagnóstico", icon: FileText },
    { id: "processes" as View, label: "Processos", icon: GitBranch },
    { id: "mapping" as View, label: "Novos mapeamentos", icon: Plus },
    { id: "decisions" as View, label: "Decisões", icon: MessageSquareText, badge: pendingSuggestions.length },
    { id: "insights" as View, label: "Novos insights", icon: Lightbulb },
  ];

  async function publish() {
    const response = await fetch(`/api/reports/${report.id}/publish`, { method: "POST" });
    const result = await response.json();
    if (!response.ok) return flash(result.error || "Não foi possível publicar.");
    flash(`${result.processCount} processos publicados como versão 1.`);
    await loadWorkspace();
  }

  function openReview(processId: string | null = null, stepKey: string | null = null) {
    setReviewProcessId(processId);
    setReviewStepKey(stepKey);
    setReviewOpen(true);
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="offcanvas" className="border-r-0">
        <SidebarHeader className="p-5"><Brand light /></SidebarHeader>
        <SidebarContent>
          <SidebarGroup><SidebarGroupLabel className="text-white/45">Sua operação</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>
            {nav.map((item) => <SidebarMenuItem key={item.id}><SidebarMenuButton isActive={view === item.id} onClick={() => setView(item.id)} className="h-10 px-3" tooltip={item.label}><item.icon /><span>{item.label}</span></SidebarMenuButton>{Boolean(item.badge) && <SidebarMenuBadge className="text-[#8FA6FF]">{item.badge}</SidebarMenuBadge>}</SidebarMenuItem>)}
          </SidebarMenu></SidebarGroupContent></SidebarGroup>
          <SidebarGroup><SidebarGroupLabel className="text-white/45">Negócios mapeados</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{workspace.businesses.map((business) => <SidebarMenuItem key={business.id}><SidebarMenuButton isActive={business.active} disabled={businessWorking} onClick={() => void selectBusiness(business.id)} className="h-auto min-h-10 px-3 py-2" tooltip={business.name}><Building2 /><span className="truncate">{business.name}</span>{business.active && <Check className="ml-auto size-3.5 text-[#8FA6FF]" />}</SidebarMenuButton></SidebarMenuItem>)}<SidebarMenuItem><SidebarMenuButton onClick={() => setNewBusinessOpen(true)} className="mt-1 h-10 border border-dashed border-white/20 px-3 text-[#8FA6FF] hover:bg-white/10 hover:text-white"><Plus /><span>Novo negócio</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroupContent></SidebarGroup>
          <SidebarGroup><SidebarGroupLabel className="text-white/45">Segundo cérebro</SidebarGroupLabel><SidebarGroupContent><SidebarMenu><SidebarMenuItem><SidebarMenuButton onClick={() => setAssistantOpen(true)} className="h-11 border border-[#8FA6FF40] bg-[#8FA6FF14] px-3 text-[#8FA6FF] hover:bg-[#8FA6FF25] hover:text-white" tooltip="Pergunte à empresa"><BrainCircuit /><span>Pergunte à empresa</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroupContent></SidebarGroup>
          <SidebarGroup><SidebarGroupLabel className="text-white/45">Status</SidebarGroupLabel><div className="mx-2 rounded-xl border border-white/10 bg-white/[.06] p-3 text-xs leading-5 text-white/65"><div className="flex items-center gap-2 font-semibold text-white"><ShieldCheck className="size-4 text-[#8FA6FF]" />{published ? "Versão oficial ativa" : "Revisão humana pendente"}</div><p className="mt-2">{report.content.provenance === "OPENAI" ? "Análise por IA com saída estruturada." : "Motor local auditável; IA externa não configurada."}</p></div></SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-4"><div className="rounded-xl border border-white/10 bg-white/[.06] p-3"><p className="truncate text-sm font-medium">{user.name}</p><p className="truncate text-xs text-white/50">{workspace.membership.role === "OWNER" ? "Dono" : workspace.membership.role} · {workspace.organization.name}</p>{user.localDevelopment ? <p className="mt-3 text-xs text-[#8FA6FF]">Ambiente local · login dispensado</p> : <a href="/signout-with-chatgpt?return_to=%2F" target="_top" className="mt-3 inline-block text-xs text-[#8FA6FF] hover:underline">Sair</a>}</div></SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-[#F0EFEA]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#D7D6CF] bg-[#F0EFEA]/90 px-4 backdrop-blur-xl sm:px-7">
          <div className="flex items-center gap-3"><SidebarTrigger className="md:hidden" /><div><p className="text-xs font-medium uppercase tracking-[.14em] text-[#57574F]">{workspace.organization.name}</p><p className="text-sm font-semibold text-[#1C1C1A]">{nav.find((item) => item.id === view)?.label}</p></div></div>
          <Badge className={published ? "border-0 bg-[#E3F2EA] text-[#147A4E]" : "border-0 bg-[#F8EEDD] text-[#9A5B00]"}>{published ? "Publicado" : "Rascunho para aprovação"}</Badge>
        </header>
        <main className="mx-auto w-full max-w-[1440px] p-4 pb-24 sm:p-7 lg:p-9">
          {view === "overview" && <Overview workspace={workspace} report={report.content} onProcess={setSelectedProcess} />}
          {view === "report" && <ExecutiveReport report={report.content} processes={sourceProcesses} published={published} onPublish={publish} onReview={() => openReview()} onProcess={setSelectedProcess} />}
          {view === "processes" && <ProcessLibrary rows={workspace.processes} onProcess={setSelectedProcess} />}
          {view === "mapping" && <AdditionalMapping interviews={workspace.interviews} processCount={workspace.processes.length} onStart={() => setMappingCaptureOpen(true)} />}
          {view === "decisions" && <DecisionQueue suggestions={workspace.suggestions} rejectedInsights={workspace.insights.filter((item) => item.status === "REJECTED" && !item.linkedSuggestionId)} processes={workspace.processes} focusId={decisionFocusId} onFocusHandled={() => setDecisionFocusId(null)} onChanged={async (message) => { flash(message); await loadWorkspace(); }} />}
          {view === "insights" && <InsightCapture insights={workspace.insights} processes={workspace.processes} onSaved={async (message, suggestionId) => { flash(message); await loadWorkspace(); if (suggestionId) { setDecisionFocusId(suggestionId); setView("decisions"); } }} />}
        </main>
      </SidebarInset>
      <ProcessSheet row={selectedProcess} onClose={() => setSelectedProcess(null)} onEdit={(processId, stepKey) => { setSelectedProcess(null); openReview(processId, stepKey); }} onSuggest={(step) => selectedProcess && setSuggestionTarget({ process: selectedProcess, step })} />
      {reviewOpen && <ReviewDialog
        key={`${report.id}:${reviewProcessId ?? "report"}:${reviewStepKey ?? "all"}`}
        open={reviewOpen}
        report={report}
        processes={sourceProcesses}
        initialProcessId={reviewProcessId}
        initialStepKey={reviewStepKey}
        onClose={() => setReviewOpen(false)}
        onSaved={async (message) => { setReviewOpen(false); flash(message); await loadWorkspace(); }}
      />}
      <SuggestionDialog target={suggestionTarget} onClose={() => setSuggestionTarget(null)} onSaved={async (message) => { setSuggestionTarget(null); flash(message); await loadWorkspace(); }} />
      <ReviewDueAlert
        suggestions={workspace.suggestions.filter((item) => item.status === "IN_TEST" && item.experiment?.reviewDue)}
        open={!reviewAlertDismissed}
        onClose={() => setReviewAlertDismissed(true)}
        onReview={() => { setReviewAlertDismissed(true); setView("decisions"); }}
      />
      <NewBusinessDialog open={newBusinessOpen} onClose={() => setNewBusinessOpen(false)} onCreated={async (name) => { setNewBusinessOpen(false); setMappingCaptureOpen(false); await loadWorkspace(); flash(`${name} foi criado. Comece pela entrevista inicial.`); }} />
      <button type="button" onClick={() => setAssistantOpen(true)} aria-label="Pergunte à empresa" className="fixed bottom-5 right-5 z-40 flex size-13 items-center justify-center gap-2 rounded-full bg-[#1C1C1A] text-sm font-semibold text-white shadow-[0_16px_50px_rgba(23,59,53,.28)] transition hover:-translate-y-0.5 hover:bg-[#1531AE] md:bottom-6 md:right-6 md:size-auto md:px-5 md:py-3"><BrainCircuit className="size-5 text-[#8FA6FF]" /><span className="hidden md:inline">Pergunte à empresa</span></button>
      <CompanyAssistant
        key={workspace.organization.id}
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        organizationName={workspace.organization.name}
        processes={workspace.processes}
        onProcess={(processId) => { const process = workspace.processes.find((item) => item.id === processId); if (process) { setAssistantOpen(false); setSelectedProcess(process); } }}
        onGapCreated={async () => { setAssistantOpen(false); setView("insights"); flash("Lacuna registrada em Novos insights para análise e decisão."); await loadWorkspace(); }}
      />
      {toast && <div role="status" className="fixed bottom-5 left-1/2 z-[80] -translate-x-1/2 rounded-xl bg-[#1C1C1A] px-5 py-3 text-sm font-medium text-white">{toast}</div>}
    </SidebarProvider>
  );
}

function Brand({ light = false }: { light?: boolean }) {
  return <div><PraxeLogo light={light} /><p className={`mt-1 pl-[42px] text-[10px] tracking-[.08em] ${light ? "text-white/45" : "text-[#57574F]"}`}>O JEITO DA CASA</p></div>;
}

function BusinessQuickSwitch({ businesses, activeBusinessId, working, onSelect, onNew }: { businesses: Workspace["businesses"]; activeBusinessId: string; working: boolean; onSelect?: (id: string) => Promise<void>; onNew?: () => void }) {
  if (!businesses.length) return null;
  return <Select value={activeBusinessId} disabled={working} onValueChange={(value) => value === "__new_business__" ? onNew?.() : void onSelect?.(value)}><SelectTrigger aria-label="Trocar negócio" className="w-[210px] bg-[#FAFAF7]"><Building2 className="size-4 text-[#1B3BD6]" /><SelectValue /></SelectTrigger><SelectContent>{businesses.map((business) => <SelectItem key={business.id} value={business.id}>{business.name}</SelectItem>)}<SelectItem value="__new_business__"><span className="flex items-center gap-2 font-semibold text-[#1B3BD6]"><Plus className="size-3.5" />Novo negócio</span></SelectItem></SelectContent></Select>;
}

function NewBusinessDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/businesses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível criar o negócio.");
      const createdName = result.name as string;
      setName("");
      await onCreated(createdName);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível criar o negócio."); }
    finally { setSaving(false); }
  }
  return <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><div className="mb-2 grid size-11 place-items-center rounded-2xl bg-[#E3F2EA] text-[#1B3BD6]"><Building2 /></div><DialogTitle className="font-serif text-3xl">Novo negócio</DialogTitle><DialogDescription>Crie um espaço vazio e independente para iniciar outro mapeamento. Você poderá trocar de negócio a qualquer momento.</DialogDescription></DialogHeader><div className="space-y-4"><label className="block text-sm font-medium text-[#1C1C1A]">Nome do negócio<Input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && name.trim().length >= 2) void create(); }} autoFocus placeholder="Ex.: Clínica Horizonte" className="mt-2" /></label><div className="rounded-xl bg-[#F0EFEA] p-4 text-xs leading-5 text-[#57574F]"><ShieldCheck className="mr-1 inline size-4 text-[#1B3BD6]" />Processos, entrevistas, decisões e métricas serão salvos no contexto deste negócio. Convites e permissões de equipes diferentes ficam para depois do MVP.</div>{error && <p role="alert" className="text-sm text-[#A33A33]">{error}</p>}</div><DialogFooter><Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button><Button onClick={create} disabled={saving || name.trim().length < 2} className="bg-[#1C1C1A] hover:bg-[#1531AE]">{saving ? <Loader2 className="animate-spin" /> : <Plus />}{saving ? "Criando…" : "Criar e começar"}</Button></DialogFooter></DialogContent></Dialog>;
}

function CompanyAssistant({ open, onClose, organizationName, processes, onProcess, onGapCreated }: { open: boolean; onClose: () => void; organizationName: string; processes: ProcessRow[]; onProcess: (processId: string) => void; onGapCreated: () => Promise<void> }) {
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [publishedProcessCount, setPublishedProcessCount] = useState(processes.filter((item) => item.status === "PUBLISHED").length);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const pendingCounterRef = useRef(0);

  async function loadChat(conversationId?: string) {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/assistant${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ""}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar as conversas.");
      setConversations(result.conversations || []);
      setActiveConversationId(result.activeConversationId || null);
      setMessages(result.messages || []);
      setPublishedProcessCount(result.publishedProcessCount || 0);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar as conversas."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => void loadChat());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, sending]);

  function newConversation() {
    setActiveConversationId(null); setMessages([]); setQuestion(""); setError("");
  }

  async function sendQuestion(suggested?: string) {
    const text = (suggested || question).replace(/\s+/g, " ").trim();
    if (text.length < 3 || sending) return;
    setSending(true); setError(""); setQuestion("");
    pendingCounterRef.current += 1;
    const temporaryId = `pending-${pendingCounterRef.current}`;
    setMessages((current) => [...current, { id: temporaryId, conversationId: activeConversationId || "", role: "USER", content: text, answerStatus: null, confidence: null, citations: [], suggestedQuestions: [], provenance: null, feedback: null, linkedInsightId: null, createdAt: new Date().toISOString() }]);
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, conversationId: activeConversationId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "O assistente não conseguiu responder.");
      setActiveConversationId(result.conversation.id);
      setMessages((current) => [...current.filter((item) => item.id !== temporaryId), result.userMessage, result.assistantMessage]);
      setConversations((current) => {
        const withoutCurrent = current.filter((item) => item.id !== result.conversation.id);
        return [{ ...result.conversation, updatedAt: new Date().toISOString() }, ...withoutCurrent];
      });
    } catch (reason) {
      setMessages((current) => current.filter((item) => item.id !== temporaryId));
      setQuestion(text);
      setError(reason instanceof Error ? reason.message : "O assistente não conseguiu responder.");
    } finally { setSending(false); }
  }

  async function recordFeedback(messageId: string, feedback: "HELPFUL" | "NOT_HELPFUL") {
    try {
      const response = await fetch(`/api/assistant/messages/${messageId}/feedback`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível registrar o feedback.");
      setMessages((current) => current.map((item) => item.id === messageId ? { ...item, feedback } : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível registrar o feedback."); }
  }

  async function registerGap(messageId: string) {
    try {
      const response = await fetch(`/api/assistant/messages/${messageId}/gap`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível registrar a lacuna.");
      setMessages((current) => current.map((item) => item.id === messageId ? { ...item, linkedInsightId: result.insightId } : item));
      await onGapCreated();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível registrar a lacuna."); }
  }

  const starters = ["Como executo um processo do início ao fim?", "Quem aprova as principais decisões?", "O que fazer quando ocorre uma exceção?"];
  return <Sheet open={open} onOpenChange={(next) => !next && onClose()}><SheetContent className="flex h-full w-full flex-col overflow-hidden p-0 sm:max-w-xl"><SheetHeader className="border-b border-white/10 bg-[#1C1C1A] p-5 text-left text-white"><div className="flex items-start gap-3"><div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#8FA6FF] text-[#1C1C1A]"><BrainCircuit className="size-5" /></div><div className="min-w-0"><SheetTitle className="font-serif text-2xl text-white">Pergunte à empresa</SheetTitle><SheetDescription className="mt-1 text-white/55">Segundo cérebro de {organizationName} · somente versões oficiais</SheetDescription></div></div><div className="mt-4 flex items-center gap-2"><Select value={activeConversationId || "__new__"} onValueChange={(value) => value === "__new__" ? newConversation() : void loadChat(value)}><SelectTrigger aria-label="Histórico de conversas" className="min-w-0 flex-1 border-white/15 bg-white/10 text-white"><History className="size-4" /><SelectValue placeholder="Nova conversa" /></SelectTrigger><SelectContent><SelectItem value="__new__">Nova conversa</SelectItem>{conversations.map((conversation) => <SelectItem key={conversation.id} value={conversation.id}>{conversation.title}</SelectItem>)}</SelectContent></Select><Button type="button" variant="outline" size="icon" onClick={newConversation} aria-label="Iniciar nova conversa" className="border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white"><Plus /></Button></div></SheetHeader><div className="flex min-h-0 flex-1 flex-col bg-[#F0EFEA]">{loading ? <div className="grid flex-1 place-items-center"><div className="text-center text-sm text-[#57574F]"><Loader2 className="mx-auto mb-3 size-6 animate-spin text-[#1B3BD6]" />Carregando o conhecimento oficial…</div></div> : <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-5">{messages.length === 0 ? <div className="mx-auto flex min-h-full max-w-md flex-col justify-center py-8 text-center"><div className="mx-auto grid size-16 place-items-center rounded-sm bg-[#E3F2EA] text-[#1B3BD6]"><BookOpen className="size-7" /></div><h2 className="mt-5 font-serif text-3xl text-[#1C1C1A]">O manual vivo da empresa.</h2><p className="mt-3 text-sm leading-6 text-[#57574F]">Faça uma pergunta operacional. A resposta mostrará exatamente qual processo, versão e etapa foram utilizados.</p><div className="mt-6 space-y-2">{starters.map((starter) => <button key={starter} type="button" disabled={publishedProcessCount === 0} onClick={() => void sendQuestion(starter)} className="w-full rounded-xl border bg-[#FAFAF7] px-4 py-3 text-left text-sm text-[#1C1C1A] transition hover:border-[#B9B8B0] hover:bg-[#FAFAF7] disabled:cursor-not-allowed disabled:opacity-50">{starter}</button>)}</div>{publishedProcessCount === 0 && <div className="mt-5 rounded-xl border border-[#E6D2AC] bg-[#F8EEDD] p-4 text-sm leading-6 text-[#9A5B00]">Publique ao menos um processo para ativar as respostas do segundo cérebro.</div>}</div> : <div className="space-y-5">{messages.map((message) => message.role === "USER" ? <div key={message.id} className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-[#1C1C1A] px-4 py-3 text-sm leading-6 text-white">{message.content}</div> : <article key={message.id} className="max-w-[94%] rounded-2xl rounded-bl-md border border-[#D7D6CF] bg-[#FAFAF7] p-4"><div className="mb-3 flex flex-wrap items-center gap-2"><Badge className={`border-0 ${message.answerStatus === "ANSWERED" ? "bg-[#E3F2EA] text-[#147A4E]" : message.answerStatus === "GAP" ? "bg-[#F7EDEC] text-[#A33A33]" : "bg-[#F8EEDD] text-[#9A5B00]"}`}>{message.answerStatus === "ANSWERED" ? "Base oficial encontrada" : message.answerStatus === "GAP" ? "Lacuna identificada" : "Precisa esclarecer"}</Badge>{message.confidence && <span className="text-[11px] text-[#57574F]">Confiança {message.confidence === "HIGH" ? "alta" : message.confidence === "MEDIUM" ? "moderada" : "baixa"}</span>}</div><p className="whitespace-pre-wrap text-sm leading-6 text-[#1C1C1A]">{message.content}</p>{message.citations.length > 0 && <div className="mt-4 space-y-2 border-t pt-4"><p className="text-[10px] font-bold uppercase tracking-[.13em] text-[#57574F]">Fontes oficiais</p>{message.citations.map((citation, index) => <button key={`${citation.versionId}:${citation.stepKey || index}`} type="button" aria-label={`Abrir processo oficial ${citation.processTitle}, versão ${citation.versionNumber}`} onClick={() => onProcess(citation.processId)} className="w-full rounded-xl bg-[#E7EAFB] p-3 text-left transition hover:bg-[#E3F2EA]"><span className="flex items-center gap-2 text-xs font-semibold text-[#1B3BD6]"><GitBranch className="size-3.5" />{citation.processTitle} · v{citation.versionNumber}</span>{citation.stepTitle && <span className="mt-1 block text-xs font-medium text-[#1C1C1A]">{citation.stepTitle}</span>}<span className="mt-1 block line-clamp-2 text-xs leading-5 text-[#57574F]">“{citation.excerpt}”</span></button>)}</div>}{message.suggestedQuestions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{message.suggestedQuestions.map((suggested) => <button key={suggested} type="button" onClick={() => void sendQuestion(suggested)} className="rounded-full border border-[#D7D6CF] px-3 py-1.5 text-xs text-[#1B3BD6] hover:bg-[#E7EAFB]">{suggested}</button>)}</div>}<div className="mt-4 flex flex-wrap items-center gap-1 border-t pt-3"><span className="mr-2 text-[11px] text-[#57574F]">Esta resposta ajudou?</span><button type="button" aria-label="Resposta útil" onClick={() => void recordFeedback(message.id, "HELPFUL")} className={`rounded-lg p-2 ${message.feedback === "HELPFUL" ? "bg-[#E3F2EA] text-[#147A4E]" : "text-[#57574F] hover:bg-[#E7EAFB]"}`}><ThumbsUp className="size-4" /></button><button type="button" aria-label="Resposta incorreta ou pouco útil" onClick={() => void recordFeedback(message.id, "NOT_HELPFUL")} className={`rounded-lg p-2 ${message.feedback === "NOT_HELPFUL" ? "bg-[#F7EDEC] text-[#A33A33]" : "text-[#57574F] hover:bg-[#F7EDEC]"}`}><ThumbsDown className="size-4" /></button>{(message.answerStatus === "GAP" || message.answerStatus === "NEEDS_CLARIFICATION" || message.feedback === "NOT_HELPFUL") && <Button type="button" variant="ghost" size="sm" disabled={Boolean(message.linkedInsightId)} onClick={() => void registerGap(message.id)} className="ml-auto text-[#A33A33] hover:bg-[#F7EDEC] hover:text-[#A33A33]"><Lightbulb />{message.linkedInsightId ? "Lacuna registrada" : "Registrar como insight"}</Button>}</div></article>)}{sending && <div className="flex max-w-[94%] items-center gap-3 rounded-2xl rounded-bl-md border bg-[#FAFAF7] p-4 text-sm text-[#57574F]"><Loader2 className="size-4 animate-spin text-[#1B3BD6]" />Consultando processos e versões oficiais…</div>}<div ref={endRef} /></div>}</div>}<div className="border-t bg-[#FAFAF7] p-4"><div className="flex items-end gap-2"><Textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendQuestion(); } }} disabled={sending || publishedProcessCount === 0} placeholder="Ex.: Quem aprova uma compra urgente?" className="min-h-12 max-h-32 resize-none bg-[#FAFAF7]" /><Button type="button" size="icon" aria-label="Enviar pergunta" onClick={() => void sendQuestion()} disabled={sending || question.trim().length < 3 || publishedProcessCount === 0} className="size-12 shrink-0 bg-[#1B3BD6] text-white hover:bg-[#1531AE]"><Send /></Button></div>{error && <p role="alert" className="mt-2 text-xs text-[#A33A33]">{error}</p>}<p className="mt-2 text-[10px] leading-4 text-[#57574F]"><ShieldCheck className="mr-1 inline size-3" />Respostas limitadas às versões publicadas. Em caso de dúvida, confirme com o dono do processo.</p></div></div></SheetContent></Sheet>;
}

type CaptureResult = { processCount: number; skippedExistingCount?: number; reportId?: string | null };

function ImplementationOnboarding({ user, aiConfigured, retryNotice, onComplete, variant = "initial", companyNameDefault = "", onCancel, businesses = [], activeBusinessId = "", onBusinessSelect, onNewBusiness, businessWorking = false }: { user: { name: string }; aiConfigured: boolean; retryNotice?: string | null; onComplete: (result?: CaptureResult) => Promise<void>; variant?: "initial" | "expansion"; companyNameDefault?: string; onCancel?: () => void; businesses?: Workspace["businesses"]; activeBusinessId?: string; onBusinessSelect?: (id: string) => Promise<void>; onNewBusiness?: () => void; businessWorking?: boolean }) {
  const expansion = variant === "expansion";
  const defaultTitle = expansion ? "Mapeamento complementar" : "Entrevista inicial com o dono";
  const [started, setStarted] = useState(expansion);
  const [mode, setMode] = useState<CaptureMode>("transcript");
  const [companyName, setCompanyName] = useState(companyNameDefault);
  const [title, setTitle] = useState(defaultTitle);
  const [transcript, setTranscript] = useState("");
  const [audio, setAudio] = useState<File | null>(null);
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [fileSummary, setFileSummary] = useState<TranscriptFileSummary | null>(null);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  useEffect(() => {
    if (!recording) return;
    const interval = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [recording]);

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop(); recognitionRef.current?.stop(); streamRef.current?.getTracks().forEach((track) => track.stop()); setRecording(false); return;
    }
    setError("");
    setTranscriptFile(null);
    setFileSummary(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => event.data.size && chunksRef.current.push(event.data);
      recorder.onstop = () => setAudio(new File([new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })], "entrevista.webm", { type: recorder.mimeType || "audio/webm" }));
      recorderRef.current = recorder; streamRef.current = stream; recorder.start(); setSeconds(0); setRecording(true);
      const Recognition = (window as unknown as { SpeechRecognition?: new () => RecognitionInstance; webkitSpeechRecognition?: new () => RecognitionInstance }).SpeechRecognition
        || (window as unknown as { webkitSpeechRecognition?: new () => RecognitionInstance }).webkitSpeechRecognition;
      if (Recognition) {
        const recognition = new Recognition(); recognition.continuous = true; recognition.interimResults = false; recognition.lang = "pt-BR";
        recognition.onresult = (event) => {
          let text = ""; for (let index = 0; index < event.results.length; index++) if (event.results[index].isFinal) text += `${event.results[index][0].transcript} `;
          if (text) setTranscript((current) => `${current}\nDono: ${text.trim()}`.trim());
        };
        recognition.onerror = () => undefined; recognition.start(); recognitionRef.current = recognition;
      }
    } catch { setError("Não foi possível acessar o microfone. Use a transcrição ou envie um arquivo."); }
  }

  async function selectTranscriptFile(file: File | null) {
    setError("");
    if (!file) return;
    try {
      const parsed = await parseTranscriptFile(file);
      setAudio(null);
      setTranscriptFile(file);
      setFileSummary(parsed);
      setTranscript(parsed.normalizedText);
      if (title === defaultTitle) setTitle(file.name.replace(/\.[^.]+$/, ""));
    } catch (reason) {
      setTranscriptFile(null);
      setFileSummary(null);
      setError(reason instanceof Error ? reason.message : "Não foi possível ler a transcrição.");
    }
  }

  function removeTranscriptFile() {
    setTranscriptFile(null);
    setFileSummary(null);
    setTranscript("");
  }

  function changeMode(nextMode: CaptureMode) {
    if (nextMode === "file") setAudio(null);
    if (nextMode === "record" || nextMode === "upload") {
      setTranscriptFile(null);
      setFileSummary(null);
    }
    setMode(nextMode);
    setError("");
  }

  function selectAudioFile(file: File | null) {
    setTranscriptFile(null);
    setFileSummary(null);
    setAudio(file);
    setError("");
  }

  async function submit() {
    setError("");
    if (!companyName.trim()) return setError("Informe o nome da empresa.");
    if (transcript.trim().length < 200 && !(audio && aiConfigured)) return setError("Inclua ao menos 200 caracteres de transcrição. Áudio sem texto exige a transcrição por IA configurada.");
    setProcessing(true);
    try {
      let response: Response;
      if (audio || transcriptFile) {
        const form = new FormData();
        if (audio) form.set("audio", audio);
        if (transcriptFile) form.set("transcriptFile", transcriptFile);
        form.set("transcript", transcript); form.set("title", title); form.set("companyName", companyName); form.set("captureKind", expansion ? "EXPANSION" : "INITIAL");
        response = await fetch("/api/interviews", { method: "POST", body: form });
      } else {
        response = await fetch("/api/interviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript, title, companyName, captureKind: expansion ? "EXPANSION" : "INITIAL" }) });
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "A análise não foi concluída.");
      await onComplete(result as CaptureResult);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "A análise não foi concluída."); setProcessing(false); }
  }

  if (processing) return <ProcessingState />;
  if (!started) return (
    <main className="min-h-svh bg-[#E5E4DE] px-5 py-6 sm:px-8">
      <div className="mx-auto flex min-h-[calc(100svh-3rem)] max-w-6xl flex-col overflow-hidden rounded-sm border border-[#D7D6CF] bg-[#FAFAF7]">
        <header className="flex flex-col gap-3 border-b border-[#1C1C1A18] px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-10"><Brand /><div className="flex items-center gap-3"><BusinessQuickSwitch businesses={businesses} activeBusinessId={activeBusinessId} working={businessWorking} onSelect={onBusinessSelect} onNew={onNewBusiness} /><span className="hidden text-xs text-[#57574F] lg:inline">{user.name}</span></div></header>
        <section className="grid flex-1 lg:grid-cols-[1.06fr_.94fr]">
          <div className="flex flex-col justify-center px-7 py-12 sm:px-12 lg:px-16">
            <span className="mb-5 w-fit rounded-full bg-[#E6D2AC] px-3 py-1 text-xs font-bold uppercase tracking-[.14em] text-[#9A5B00]">Seu ponto de partida</span>
            <h1 className="max-w-2xl text-balance font-serif text-5xl leading-[.98] tracking-[-.045em] text-[#1C1C1A] sm:text-6xl">Conte como a empresa realmente funciona.</h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[#57574F]">A primeira entrega nasce de uma entrevista com o dono. Você fala; o sistema encontra processos, decisões, riscos e os pontos em que a empresa ainda depende de você.</p>
            {retryNotice && <div className="mt-7 flex max-w-xl gap-3 rounded-xl border border-[#E6D2AC] bg-[#F8EEDD] p-4 text-sm leading-6 text-[#9A5B00]"><RefreshCw className="mt-0.5 size-5 shrink-0" />{retryNotice}</div>}
            <Button onClick={() => setStarted(true)} className="mt-9 h-12 w-fit rounded-xl bg-[#1B3BD6] px-5 text-white hover:bg-[#1531AE]">{retryNotice ? "Tentar novamente" : "Começar entrevista"} <ArrowRight /></Button>
            <div className="mt-8 grid max-w-xl grid-cols-3 gap-3 text-xs text-[#57574F]">{[["01","Você conta"],["02","Nós estruturamos"],["03","Você aprova"]].map(([number,label]) => <div key={number} className="rounded-xl border bg-[#FAFAF7] p-3"><span className="font-mono text-[#1B3BD6]">{number}</span><p className="mt-2 font-semibold text-[#1C1C1A]">{label}</p></div>)}</div>
          </div>
          <div className="relative hidden overflow-hidden bg-[#1C1C1A] p-10 text-white lg:block"><div className="absolute -right-28 -top-28 size-96 rounded-full border border-[#8FA6FF22]" /><div className="relative flex h-full flex-col justify-center"><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#8FA6FF]">O que você recebe</p><div className="mt-8 space-y-4">{[
            [CircleGauge, "Índice de dependência", "Onde sua presença ainda é necessária — e por quê."],
            [GitBranch, "Mapa de processos", "Etapas, decisões, exceções, donos e evidências."],
            [Target, "Plano de 90 dias", "As ações que primeiro devolvem tempo ao dono."],
          ].map(([Icon,titleText,body]) => { const I = Icon as typeof CircleGauge; return <article key={String(titleText)} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[.055] p-5"><I className="mt-1 size-5 shrink-0 text-[#8FA6FF]" /><div><h2 className="font-semibold">{String(titleText)}</h2><p className="mt-1 text-sm leading-6 text-white/60">{String(body)}</p></div></article>; })}</div></div></div>
        </section>
      </div>
    </main>
  );

  const modes = [
    { id: "transcript" as const, label: "Colar transcrição", icon: FileText },
    { id: "file" as const, label: "Enviar arquivo", icon: Upload },
    { id: "record" as const, label: "Gravar agora", icon: Mic },
    { id: "upload" as const, label: "Enviar áudio", icon: FileAudio },
  ];
  return (
    <main className="min-h-svh bg-[#E5E4DE] px-4 py-5 sm:px-8">
      <div className="mx-auto max-w-5xl rounded-sm border border-[#D7D6CF] bg-[#FAFAF7] p-5 sm:p-9">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><Button variant="ghost" onClick={() => expansion ? onCancel?.() : setStarted(false)}><ArrowLeft />Voltar</Button><div className="flex items-center gap-3"><BusinessQuickSwitch businesses={businesses} activeBusinessId={activeBusinessId} working={businessWorking} onSelect={onBusinessSelect} onNew={onNewBusiness} /><Brand /></div></div>
        <div className="mx-auto mt-8 max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#1B3BD6]">{expansion ? "Novo mapeamento" : "Entrevista inicial"}</p>
          <h1 className="mt-2 font-serif text-4xl tracking-[-.035em] text-[#1C1C1A]">{expansion ? "Que parte da empresa ainda não está no mapa?" : "Vamos capturar o que só você sabe."}</h1>
          <p className="mt-3 leading-7 text-[#57574F]">{expansion ? "Conte uma rotina que ainda não foi documentada. A IA compara a captura com a biblioteca atual e cria somente novos candidatos, sem sobrescrever o que já foi aprovado." : "Use a conversa presencial, grave agora, cole o texto ou envie a transcrição pronta. Nada será publicado sem sua aprovação."}</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-[#1C1C1A]">Empresa<Input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Nome da empresa" className="mt-2 bg-[#FAFAF7]" /></label><label className="text-sm font-medium text-[#1C1C1A]">Título da entrevista<Input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 bg-[#FAFAF7]" /></label></div>
          <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-[#E5E4DE] p-1.5 sm:grid-cols-4">{modes.map((item) => <button key={item.id} type="button" onClick={() => changeMode(item.id)} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 text-xs font-semibold transition sm:text-sm ${mode === item.id ? "bg-[#FAFAF7] text-[#1C1C1A]" : "text-[#57574F]"}`}><item.icon className="size-4" />{item.label}</button>)}</div>
          {mode === "file" && <section className="mt-5 space-y-3">
            {!transcriptFile ? <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#B9B8B0] bg-[#FAFAF7] p-6 text-center transition hover:border-[#1B3BD6] hover:bg-[#FAFAF7]"><FileText className="size-9 text-[#1B3BD6]" /><span className="mt-3 font-semibold">Escolha a transcrição da entrevista</span><span className="mt-1 text-xs text-[#57574F]">TXT, MD, SRT ou VTT · até 8 MB</span><span className="mt-3 rounded-full bg-[#E7EAFB] px-3 py-1 text-[11px] font-medium text-[#147A4E]">O original será preservado para auditoria</span><input type="file" accept=".txt,.md,.srt,.vtt,text/plain,text/markdown,application/x-subrip,text/vtt" className="sr-only" onChange={(event) => void selectTranscriptFile(event.target.files?.[0] || null)} /></label> : <article className="rounded-2xl border border-[#D7D6CF] bg-[#FAFAF7] p-5"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#E3F2EA] text-[#1B3BD6]"><CheckCircle2 className="size-5" /></div><div className="min-w-0"><p className="truncate font-semibold text-[#1C1C1A]">{transcriptFile.name}</p><p className="mt-1 text-xs text-[#57574F]">Arquivo lido e pronto para revisão</p></div></div><button type="button" onClick={removeTranscriptFile} aria-label="Remover arquivo" className="rounded-lg p-2 text-[#57574F] transition hover:bg-[#F7EDEC] hover:text-[#A33A33]"><X className="size-4" /></button></div>{fileSummary && <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Formato", fileSummary.format], ["Palavras", fileSummary.wordCount.toLocaleString("pt-BR")], ["Participantes", fileSummary.speakerCount || "Não identificados"], [fileSummary.durationIsEstimated ? "Duração estimada" : "Duração", formatTranscriptDuration(fileSummary.durationSeconds)]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-[#F0EFEA] p-3"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-[#57574F]">{label}</p><p className="mt-1 text-sm font-semibold text-[#1C1C1A]">{value}</p></div>)}</div>}{fileSummary?.speakers.length ? <p className="mt-3 text-xs text-[#57574F]"><strong>Vozes detectadas:</strong> {fileSummary.speakers.join(", ")}</p> : null}{fileSummary && fileSummary.cueCount > 0 ? <p className="mt-2 text-xs text-[#1B3BD6]">{fileSummary.cueCount} trechos com horário preservados para rastrear as evidências.</p> : null}</article>}
          </section>}
          {mode === "record" && <section className="mt-5 rounded-2xl border border-[#D7D6CF] bg-[#FAFAF7] p-6 text-center"><button onClick={toggleRecording} aria-label={recording ? "Parar gravação" : "Iniciar gravação"} className={`mx-auto grid size-20 place-items-center rounded-full text-white transition ${recording ? "animate-pulse bg-[#1B3BD6]" : "bg-[#1C1C1A]"}`}>{recording ? <Pause /> : <Mic />}</button><p className="mt-4 font-semibold">{recording ? `Gravando · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : audio ? "Gravação pronta" : "Toque para gravar"}</p><p className="mt-1 text-xs text-[#57574F]">{transcript ? "A transcrição ao vivo aparecerá abaixo." : "No Chrome, a fala também vira texto ao vivo."}</p>{audio && !recording && <audio controls src={URL.createObjectURL(audio)} className="mx-auto mt-4 max-w-full" />}</section>}
          {mode === "upload" && <label className="mt-5 flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#B9B8B0] bg-[#FAFAF7] p-6 text-center transition hover:border-[#1B3BD6]"><FileAudio className="size-8 text-[#1B3BD6]" /><span className="mt-3 font-semibold">{audio ? audio.name : "Escolha uma gravação da entrevista"}</span><span className="mt-1 text-xs text-[#57574F]">WebM, MP3, MP4, M4A, WAV ou OGG · até 25 MB</span><input type="file" accept="audio/webm,audio/mpeg,audio/mp4,audio/wav,audio/x-m4a,audio/ogg" className="sr-only" onChange={(event) => selectAudioFile(event.target.files?.[0] || null)} /></label>}
          <label className="mt-5 block text-sm font-medium text-[#1C1C1A]">{mode === "transcript" ? "Transcrição completa" : mode === "file" ? "Prévia extraída — revise antes de analisar" : "Transcrição capturada ou complementar"}<Textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder={"00:00:01 Dono: Quando chega um cliente novo, eu...\n00:00:12 Entrevistador: Quem aprova essa etapa?"} className="mt-2 min-h-64 resize-y bg-[#FAFAF7] font-mono text-xs leading-6" /></label>
          <div className="mt-2 flex items-center justify-between text-xs text-[#57574F]"><span>{transcript.length.toLocaleString("pt-BR")} caracteres</span><span>{aiConfigured ? "IA configurada para análise e transcrição" : "Motor local auditável ativo"}</span></div>
          {error && <div role="alert" className="mt-4 flex gap-3 rounded-xl border border-[#E0BAB6] bg-[#F7EDEC] p-4 text-sm text-[#A33A33]"><AlertTriangle className="size-5 shrink-0" />{error}</div>}
          <div className="mt-7 flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-md text-xs leading-5 text-[#57574F]"><ShieldCheck className="mr-1 inline size-4" />Áudio e arquivos originais ficam privados. A análise cria rascunhos com evidências; você continua sendo a autoridade.</p><Button onClick={submit} disabled={processing} className="h-12 rounded-xl bg-[#1B3BD6] px-5 text-white hover:bg-[#1531AE]">{expansion ? "Mapear novos processos" : "Gerar meu diagnóstico"} <Sparkles /></Button></div>
        </div>
      </div>
    </main>
  );
}

const PROCESSING_STAGES = ["Entrevista recebida", "Lendo evidências", "Estruturando processos", "Calculando dependências", "Montando seu plano"];

function ProcessingState() {
  const [step, setStep] = useState(0);
  useEffect(() => { const id = window.setInterval(() => setStep((value) => Math.min(PROCESSING_STAGES.length - 1, value + 1)), 1800); return () => window.clearInterval(id); }, []);
  return <main className="grid min-h-svh place-items-center bg-[#1C1C1A] px-5 text-white"><div className="w-full max-w-lg"><div className="mx-auto grid size-20 place-items-center border border-white/15 bg-[#30302D]"><PraxeLogo compact light /></div><h1 className="mt-8 text-center font-serif text-4xl">Estamos transformando fala em operação.</h1><p className="mt-3 text-center leading-7 text-white/55">Cada conclusão precisa encontrar uma evidência. Isso leva um pouco mais — e evita um relatório genérico.</p><div className="mt-9 space-y-3">{PROCESSING_STAGES.map((label, index) => <div key={label} className={`flex items-center gap-3 rounded-xl border p-3 transition ${index <= step ? "border-white/20 bg-white/[.08]" : "border-white/[.06] text-white/30"}`}>{index < step ? <Check className="size-4 text-[#8FA6FF]" /> : index === step ? <Loader2 className="size-4 animate-spin text-[#8FA6FF]" /> : <Clock3 className="size-4" />}<span className="text-sm font-medium">{label}</span></div>)}</div></div></main>;
}

function LoadingState() { return <main className="grid min-h-svh place-items-center bg-[#E5E4DE]"><div className="text-center"><Loader2 className="mx-auto size-8 animate-spin text-[#1C1C1A]" /><p className="mt-3 text-sm text-[#57574F]">Abrindo sua operação…</p></div></main>; }
function FailureState({ message, retry }: { message: string; retry: () => void }) { return <main className="grid min-h-svh place-items-center bg-[#E5E4DE] px-5"><div className="max-w-lg rounded-3xl border bg-[#FAFAF7] p-8 text-center"><AlertTriangle className="mx-auto size-10 text-[#1B3BD6]" /><h1 className="mt-4 font-serif text-3xl text-[#1C1C1A]">Seu material está seguro.</h1><p className="mt-3 leading-7 text-[#57574F]">{message}</p><Button onClick={retry} className="mt-6 bg-[#1C1C1A]"><RefreshCw />Tentar novamente</Button></div></main>; }

function ExecutiveReport({ report, processes, published, onPublish, onReview, onProcess }: { report: ReportContent; processes: ProcessRow[]; published: boolean; onPublish: () => void; onReview: () => void; onProcess: (row: ProcessRow) => void }) {
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const expansion = report.source?.captureKind === "EXPANSION";
  return <div className="space-y-7">
    <section className="relative overflow-hidden rounded-sm bg-[#1C1C1A] p-7 text-white sm:p-9"><div className="absolute -right-24 -top-24 size-72 rounded-full border border-[#8FA6FF22]" /><div className="relative grid gap-7 lg:grid-cols-[1fr_280px]"><div><div className="flex flex-wrap gap-2"><Badge className="border-0 bg-white/10 text-[#8FA6FF]">{expansion ? "Mapeamento complementar" : "Diagnóstico baseado na entrevista"}</Badge><Badge className="border-0 bg-white/10 text-white/70">{report.provenance === "OPENAI" ? "IA estruturada" : "Motor local auditável"}</Badge></div><h1 className="mt-5 max-w-3xl font-serif text-4xl leading-tight tracking-[-.035em] sm:text-5xl">{expansion ? "Novos processos encontrados — antes que continuem invisíveis." : "Onde você ainda é o processo — e como deixar de ser."}</h1><p className="mt-5 max-w-3xl text-base leading-7 text-white/65">{report.executiveSummary}</p></div><ScoreRing score={report.founderDependency.score} /></div></section>
    {report.analysisWarning && <section className="flex gap-3 rounded-2xl border border-[#E6D2AC] bg-[#F8EEDD] p-5 text-sm leading-6 text-[#9A5B00]"><AlertTriangle className="mt-0.5 size-5 shrink-0" /><div><strong>Relatório recuperado com segurança.</strong><p>{report.analysisWarning}</p></div></section>}
    {!published && <section className="flex flex-col gap-4 rounded-2xl border border-[#E6D2AC] bg-[#F8EEDD] p-5 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex items-center gap-2 font-semibold text-[#9A5B00]"><ShieldCheck className="size-5" />Tudo abaixo ainda é rascunho</div><p className="mt-1 text-sm text-[#9A5B00]">{expansion ? "Confira apenas os novos processos desta captura. A biblioteca já publicada permanece intacta." : "Confira o diagnóstico, corrija eventuais erros e só então publique a versão 1 oficial."}</p></div><div className="flex flex-col gap-2 sm:flex-row"><Button onClick={onReview} variant="outline" className="border-[#9A5B00] bg-[#FAFAF7] text-[#9A5B00] hover:bg-[#F8EEDD]"><PencilLine />Corrigir antes de aprovar</Button><Button onClick={onPublish} className="bg-[#1B3BD6] text-white hover:bg-[#1531AE]"><Rocket />{expansion ? "Adicionar à biblioteca" : "Aprovar e publicar versão 1"}</Button></div></section>}
    <section className="grid gap-4 lg:grid-cols-[.85fr_1.15fr]">
      <article className="rounded-sm border border-[#D7D6CF] bg-[#FAFAF7] p-6"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#57574F]">Composição da dependência</p><div className="mt-5 space-y-4">{report.founderDependency.components.map((item) => <div key={item.key}><div className="mb-1.5 flex justify-between text-xs"><span>{item.label}</span><strong>{item.value}</strong></div><Progress value={item.value} className="[&>div]:bg-[#1B3BD6]" /></div>)}</div><p className="mt-5 text-xs leading-5 text-[#57574F]">Score calculado por regra versionada ({report.founderDependency.version}), não inventado pelo modelo.</p></article>
      <article className="rounded-sm border border-[#D7D6CF] bg-[#FAFAF7] p-6"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#57574F]">O que quebra se você se afastar por 30 dias</p><div className="mt-4 space-y-3">{report.findings.slice(0, 4).map((finding) => <button key={finding.title} onClick={() => setEvidence(finding.evidence[0])} className="group flex w-full items-start gap-3 rounded-xl border border-[#E5E4DE] p-4 text-left transition hover:border-[#B9B8B0] hover:bg-[#FAFAF7]"><span className={`mt-1 size-2 shrink-0 rounded-full ${finding.severity === "HIGH" ? "bg-[#1B3BD6]" : "bg-[#9A5B00]"}`} /><div><h3 className="font-semibold text-[#1C1C1A]">{finding.title}</h3><p className="mt-1 text-sm leading-6 text-[#57574F]">{finding.detail}</p><span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#1B3BD6]"><Quote className="size-3" />Ver evidência</span></div></button>)}</div></article>
    </section>
    <section><div className="mb-4 flex items-end justify-between"><div><p className="text-sm text-[#57574F]">Do conhecimento para a execução</p><h2 className="font-serif text-3xl tracking-[-.03em]">Processos encontrados</h2></div><Badge variant="outline">{processes.length} rascunhos</Badge></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{processes.map((row) => <ProcessCard key={row.id} row={row} onClick={() => onProcess(row)} />)}</div></section>
    <section><div className="mb-4"><p className="text-sm text-[#57574F]">Decisões que devolvem tempo</p><h2 className="font-serif text-3xl tracking-[-.03em]">Seu plano de ação</h2></div><div className="grid gap-4 md:grid-cols-3">{report.priorities.slice(0, 3).map((priority, index) => <article key={priority.title} className="rounded-sm border border-[#D7D6CF] bg-[#FAFAF7] p-5"><span className="font-mono text-xs font-bold text-[#1B3BD6]">0{index + 1} · {priority.horizon.replaceAll("_", " ")}</span><h3 className="mt-4 font-semibold text-[#1C1C1A]">{priority.title}</h3><p className="mt-2 text-sm leading-6 text-[#57574F]">{priority.whyNow}</p><div className="mt-4 rounded-lg bg-[#E7EAFB] p-3 text-xs leading-5 text-[#147A4E]"><strong>Resultado:</strong> {priority.expectedOutcome}</div></article>)}</div></section>
    <Dialog open={Boolean(evidence)} onOpenChange={(open) => !open && setEvidence(null)}><DialogContent><DialogHeader><DialogTitle>De onde veio esta conclusão</DialogTitle><DialogDescription>Trecho preservado da entrevista original.</DialogDescription></DialogHeader>{evidence && <blockquote className="rounded-2xl bg-[#1C1C1A] p-6 font-serif text-xl leading-8 text-white"><Quote className="mb-4 size-6 text-[#8FA6FF]" />“{evidence.quote}”<footer className="mt-4 font-sans text-xs text-white/55">{evidence.speaker}</footer></blockquote>}</DialogContent></Dialog>
  </div>;
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? "#1B3BD6" : score >= 45 ? "#9A5B00" : "#147A4E";
  return <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[.055] p-5"><div className="relative grid size-36 place-items-center rounded-full" style={{ background: `conic-gradient(${color} ${score * 3.6}deg, rgba(255,255,255,.1) 0)` }}><div className="grid size-28 place-items-center rounded-full bg-[#1C1C1A] text-center"><div><span className="font-serif text-5xl">{score}</span><span className="text-xs text-white/45">/100</span></div></div></div><p className="mt-3 text-center text-xs font-semibold uppercase tracking-[.12em] text-white/55">Dependência do dono</p></div>;
}

type MetricKey = "mapped" | "published" | "dependency" | "readiness";

function metricLevel(score: number, inverse = false) {
  if (inverse) return score >= 70 ? "Alta — atenção prioritária" : score >= 40 ? "Moderada — requer plano de redução" : "Baixa — operação mais distribuída";
  return score >= 70 ? "Alta — bom candidato para avaliação técnica" : score >= 40 ? "Moderada — complete as lacunas antes de automatizar" : "Baixa — ainda não automatize";
}

function MetricCard({ icon: Icon, value, label, onExplain }: { icon: typeof GitBranch; value: string; label: string; onExplain: () => void }) {
  return <article className="flex min-h-52 flex-col rounded-2xl border bg-[#FAFAF7] p-5"><Icon className="size-5 text-[#1B3BD6]" /><p className="mt-5 font-serif text-4xl text-[#1C1C1A]">{value}</p><p className="mt-1 text-sm text-[#57574F]">{label}</p><Button type="button" variant="ghost" size="sm" onClick={onExplain} className="mt-auto -ml-3 w-fit text-[#1B3BD6] hover:bg-[#E7EAFB] hover:text-[#1C1C1A]"><Info />Entenda a métrica</Button></article>;
}

function Overview({ workspace, report, onProcess }: { workspace: Workspace; report: ReportContent; onProcess: (row: ProcessRow) => void }) {
  const [openMetric, setOpenMetric] = useState<MetricKey | null>(null);
  const published = workspace.processes.filter((row) => row.status === "PUBLISHED").length;
  const readinessResults = workspace.processes.map((row) => calculateAutomationReadiness(readProcess(row)));
  const avgAutomation = readinessResults.length ? Math.round(readinessResults.reduce((total, item) => total + item.score, 0) / readinessResults.length) : 0;
  const readinessComponents = readinessResults[0]?.components.map((component) => ({
    ...component,
    score: Math.round(readinessResults.reduce((total, item) => total + (item.components.find((candidate) => candidate.key === component.key)?.score ?? 0), 0) / readinessResults.length),
  })) ?? [];
  const details: Record<MetricKey, { title: string; description: string; calculation: string; reading: string; content?: ReactNode }> = {
    mapped: {
      title: "Processos mapeados",
      description: "Quantidade total de processos identificados para o negócio atual, incluindo rascunhos em validação e versões publicadas.",
      calculation: "Contagem de todos os processos que pertencem ao negócio selecionado.",
      reading: "O número mostra a cobertura do mapa operacional, mas não mede sozinho a qualidade ou a atualização dos processos.",
    },
    published: {
      title: "Versões publicadas",
      description: "Processos que já passaram pela revisão humana e possuem uma versão oficial disponível para consulta e execução.",
      calculation: "Contagem dos processos com status “Publicado”. Cada processo entra uma única vez, pela sua versão vigente.",
      reading: `${published} de ${workspace.processes.length} processos estão oficiais. Rascunhos não entram nesta métrica.`,
    },
    dependency: {
      title: "Dependência do dono",
      description: "Estima quanto a operação ainda depende de conhecimento, aprovações e intervenção direta do dono. Nesta métrica, quanto menor, melhor.",
      calculation: "Média ponderada de aprovações centralizadas (30%), conhecimento exclusivo do dono (30%), exceções sem regra (18%), passagens manuais (12%) e ausência de substitutos (10%).",
      reading: metricLevel(report.founderDependency.score, true),
      content: <div className="space-y-3">{report.founderDependency.components.map((component) => <div key={component.key}><div className="mb-1.5 flex items-center justify-between gap-4 text-xs"><span className="font-medium text-[#1C1C1A]">{component.label} · peso {Math.round(component.weight * 100)}%</span><strong className="text-[#1C1C1A]">{component.value}/100</strong></div><Progress value={component.value} className="h-2" /></div>)}</div>,
    },
    readiness: {
      title: "Prontidão para automação",
      description: "Média do preparo técnico dos processos para uma futura automação. Ela não autoriza automatizar: indica se o processo já está claro, rastreável e estável o suficiente para uma avaliação técnica.",
      calculation: "Cada processo é recalculado por uma régua fixa: padronização (25%), regras objetivas (20%), dados e integrações (20%), exceções controladas (15%) e rastreabilidade (20%). A nota exibida é a média dos processos.",
      reading: metricLevel(avgAutomation),
      content: <div className="space-y-3">{readinessComponents.map((component) => <div key={component.key}><div className="mb-1.5 flex items-center justify-between gap-4 text-xs"><span className="font-medium text-[#1C1C1A]">{component.label} · peso {Math.round(component.weight * 100)}%</span><strong className="text-[#1C1C1A]">{component.score}/100</strong></div><Progress value={component.score} className="h-2" /><p className="mt-1.5 text-xs leading-5 text-[#57574F]">{component.description}</p></div>)}</div>,
    },
  };
  const selected = openMetric ? details[openMetric] : null;

  return <div className="space-y-7"><div><p className="text-sm text-[#57574F]">Sua empresa em movimento</p><h1 className="font-serif text-4xl tracking-[-.035em]">Clareza operacional, em números reais.</h1></div><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard icon={GitBranch} value={String(workspace.processes.length)} label="processos mapeados" onExplain={() => setOpenMetric("mapped")} /><MetricCard icon={CheckCircle2} value={String(published)} label="versões publicadas" onExplain={() => setOpenMetric("published")} /><MetricCard icon={CircleGauge} value={`${report.founderDependency.score}/100`} label="dependência do dono" onExplain={() => setOpenMetric("dependency")} /><MetricCard icon={Sparkles} value={`${avgAutomation}/100`} label="prontidão para automação" onExplain={() => setOpenMetric("readiness")} /></section><section><h2 className="font-serif text-3xl">Processos recentes</h2><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{workspace.processes.slice(0,6).map((row) => <ProcessCard key={row.id} row={row} onClick={() => onProcess(row)} />)}</div></section><Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setOpenMetric(null)}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle className="font-serif text-3xl text-[#1C1C1A]">{selected?.title}</DialogTitle><DialogDescription className="text-sm leading-6">{selected?.description}</DialogDescription></DialogHeader>{selected && <div className="space-y-5"><section className="rounded-2xl bg-[#E7EAFB] p-4"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#57574F]">Como é calculada</p><p className="mt-2 text-sm leading-6 text-[#1C1C1A]">{selected.calculation}</p></section>{selected.content}<section className="rounded-2xl border border-[#E6D2AC] bg-[#F8EEDD] p-4"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#9A5B00]">Como interpretar agora</p><p className="mt-2 text-sm leading-6 text-[#9A5B00]">{selected.reading}</p></section>{openMetric === "readiness" && <p className="text-xs leading-5 text-[#57574F]"><ShieldCheck className="mr-1 inline size-4" />A régua usa somente o que está documentado no processo. A decisão de automatizar ainda exige validação humana, análise de risco e um piloto controlado.</p>}</div>}<DialogFooter><Button type="button" onClick={() => setOpenMetric(null)} className="bg-[#1C1C1A] text-white hover:bg-[#1531AE]">Entendi</Button></DialogFooter></DialogContent></Dialog></div>;
}

function AdditionalMapping({ interviews, processCount, onStart }: { interviews: Workspace["interviews"]; processCount: number; onStart: () => void }) {
  const expansions = interviews.filter((item) => item.analysis?.source?.captureKind === "EXPANSION");
  return <div className="space-y-7">
    <section className="relative overflow-hidden rounded-sm bg-[#1C1C1A] p-7 text-white sm:p-9"><div className="absolute -right-20 -top-24 size-72 rounded-full border border-[#8FA6FF22]" /><div className="relative grid gap-7 lg:grid-cols-[1fr_280px] lg:items-center"><div><Badge className="border-0 bg-white/10 text-[#8FA6FF]">Mapa vivo da empresa</Badge><h1 className="mt-5 max-w-3xl font-serif text-4xl leading-tight tracking-[-.035em] sm:text-5xl">O onboarding terminou. O mapeamento, não.</h1><p className="mt-4 max-w-2xl leading-7 text-white/65">Sempre que lembrar de uma rotina, descobrir uma área ou conversar com outra pessoa da equipe, faça uma nova captura. A IA compara o material com os {processCount} processos atuais e separa somente o que ainda não está mapeado.</p><Button onClick={onStart} className="mt-7 h-12 bg-[#1B3BD6] text-white hover:bg-[#1531AE]"><Plus />Adicionar novo mapeamento</Button></div><div className="rounded-2xl border border-white/10 bg-white/[.055] p-5"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#8FA6FF]">O que acontece depois</p><ol className="mt-4 space-y-4 text-sm text-white/70">{["Você envia áudio, arquivo ou transcrição.", "A IA compara com a biblioteca vigente.", "Somente processos novos viram rascunhos.", "Você corrige, aprova e publica."].map((item, index) => <li key={item} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-bold text-white">{index + 1}</span><span>{item}</span></li>)}</ol></div></div></section>
    <section className="grid gap-4 md:grid-cols-3"><article className="rounded-2xl border bg-[#FAFAF7] p-5"><GitBranch className="size-5 text-[#1B3BD6]" /><p className="mt-5 font-serif text-4xl text-[#1C1C1A]">{processCount}</p><p className="mt-1 text-sm text-[#57574F]">processos no mapa atual</p></article><article className="rounded-2xl border bg-[#FAFAF7] p-5"><Mic className="size-5 text-[#1B3BD6]" /><p className="mt-5 font-serif text-4xl text-[#1C1C1A]">4</p><p className="mt-1 text-sm text-[#57574F]">formas de adicionar contexto</p></article><article className="rounded-2xl border bg-[#FAFAF7] p-5"><ShieldCheck className="size-5 text-[#1B3BD6]" /><p className="mt-5 font-serif text-4xl text-[#1C1C1A]">100%</p><p className="mt-1 text-sm text-[#57574F]">dos novos rascunhos exigem aprovação</p></article></section>
    <section><div className="mb-4"><p className="text-sm text-[#57574F]">Capturas complementares</p><h2 className="font-serif text-3xl tracking-[-.03em]">Histórico de novos mapeamentos</h2></div>{expansions.length === 0 ? <div className="rounded-2xl border border-dashed bg-[#FAFAF7] p-10 text-center"><FileAudio className="mx-auto size-8 text-[#B9B8B0]" /><h3 className="mt-4 font-semibold text-[#1C1C1A]">Nenhuma captura complementar ainda</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#57574F]">Use esta área quando o dono lembrar de uma rotina esquecida ou quando outra área da empresa for entrevistada.</p></div> : <div className="space-y-3">{expansions.map((item) => { const outcome = item.analysis?.expansionOutcome; return <article key={item.id} className="flex flex-col gap-4 rounded-2xl border bg-[#FAFAF7] p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-[#1C1C1A]">{item.title}</h3><Badge variant="outline">{item.status === "REVIEWED" ? "Publicado" : item.status === "FAILED" ? "Falhou" : "Analisado"}</Badge></div><p className="mt-2 text-xs text-[#57574F]">{formatDate(item.createdAt)}</p></div><div className="flex gap-5 text-sm"><span><strong className="text-[#1C1C1A]">{outcome?.newProcessCount ?? "—"}</strong> novos</span><span><strong className="text-[#1C1C1A]">{outcome?.skippedExistingCount ?? "—"}</strong> já mapeados</span></div></article>; })}</div>}</section>
    <section className="rounded-2xl border border-[#D7D6CF] bg-[#F0EFEA] p-5"><div className="flex gap-3"><Lightbulb className="mt-0.5 size-5 shrink-0 text-[#1B3BD6]" /><div><h3 className="font-semibold text-[#1C1C1A]">A rotina já existe e você quer melhorá-la?</h3><p className="mt-1 text-sm leading-6 text-[#57574F]">Nesse caso, use <strong>Novos insights</strong> ou “Sugerir melhoria” dentro do processo. Esta área é dedicada a descobrir processos que ainda não fazem parte do mapa.</p></div></div></section>
  </div>;
}

function ProcessLibrary({ rows, onProcess }: { rows: ProcessRow[]; onProcess: (row: ProcessRow) => void }) {
  const areas = Array.from(new Set(rows.map((row) => row.area)));
  return <div className="space-y-7"><div><p className="text-sm text-[#57574F]">A operação que antes estava na cabeça</p><h1 className="font-serif text-4xl tracking-[-.035em]">Biblioteca de processos</h1></div>{areas.map((area) => <section key={area}><div className="mb-3 flex items-center gap-2"><Building2 className="size-4 text-[#1B3BD6]" /><h2 className="font-semibold">{area}</h2></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.filter((row) => row.area === area).map((row) => <ProcessCard key={row.id} row={row} onClick={() => onProcess(row)} />)}</div></section>)}</div>;
}

function ProcessCard({ row, onClick }: { row: ProcessRow; onClick: () => void }) {
  const content = readProcess(row);
  return <button onClick={onClick} className="group rounded-sm border border-[#D7D6CF] bg-[#FAFAF7] p-5 text-left transition hover:-translate-y-0.5 hover:border-[#B9B8B0]"><div className="flex items-center justify-between"><Badge className={row.status === "PUBLISHED" ? "border-0 bg-[#E3F2EA] text-[#147A4E]" : "border-0 bg-[#F8EEDD] text-[#9A5B00]"}>{row.status === "PUBLISHED" ? `Versão ${row.version?.versionNumber}` : "Em validação"}</Badge><ChevronRight className="size-4 text-[#B9B8B0] transition group-hover:translate-x-1" /></div><h3 className="mt-5 text-lg font-semibold text-[#1C1C1A]">{row.title}</h3><p className="mt-2 line-clamp-2 text-sm leading-6 text-[#57574F]">{content.objective}</p><div className="mt-5 flex items-center justify-between border-t pt-4 text-xs text-[#57574F]"><span>{row.area}</span><span>{content.steps.length} etapas</span></div></button>;
}

function ProcessSheet({ row, onClose, onEdit, onSuggest }: { row: ProcessRow | null; onClose: () => void; onEdit: (processId: string, stepKey?: string) => void; onSuggest: (step: ProcessContent["steps"][number]) => void }) {
  const content = row ? readProcess(row) : null;
  return <Sheet open={Boolean(row)} onOpenChange={(open) => !open && onClose()}><SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl">{row && content && <><SheetHeader className="border-b bg-[#1C1C1A] p-6 text-white"><div><Badge className="border-0 bg-white/10 text-[#8FA6FF]">{row.status === "PUBLISHED" ? `Versão oficial v${row.version?.versionNumber}` : "Rascunho da implantação"}</Badge></div><SheetTitle className="mt-3 font-serif text-3xl text-white">{row.title}</SheetTitle><SheetDescription className="text-white/55">{row.area} · {content.ownerRole}</SheetDescription>{row.status !== "PUBLISHED" && <Button onClick={() => onEdit(row.id)} variant="outline" className="mt-3 w-fit border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"><PencilLine />Corrigir este rascunho</Button>}</SheetHeader><div className="space-y-7 p-6"><section><p className="text-xs font-bold uppercase tracking-[.14em] text-[#57574F]">Objetivo</p><p className="mt-2 leading-7 text-[#1C1C1A]">{content.objective}</p></section><section className="grid gap-3 sm:grid-cols-2"><InfoBox label="Gatilho" value={content.trigger || "A confirmar"} /><InfoBox label="Saída" value={content.outputs?.[0] || "A confirmar"} /></section><section><p className="text-xs font-bold uppercase tracking-[.14em] text-[#57574F]">Como acontece hoje</p><div className="mt-4 space-y-3">{content.steps.map((step, index) => <article key={step.key} className="rounded-xl border bg-[#FAFAF7] p-4"><div className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#1C1C1A] text-xs font-semibold text-white">{index + 1}</span><div className="min-w-0"><h3 className="font-semibold">{step.title}</h3><p className="mt-2 text-sm leading-6 text-[#57574F]">{step.body}</p><p className="mt-2 text-xs text-[#57574F]">{step.ownerRole}</p><Button variant="ghost" size="sm" onClick={() => row.status === "PUBLISHED" ? onSuggest(step) : onEdit(row.id, step.key)} className="mt-2 -ml-3 text-[#1B3BD6]"><MessageSquareText />Sugerir melhoria</Button>{row.status !== "PUBLISHED" && <p className="mt-1 text-[11px] leading-4 text-[#57574F]">Como ainda é rascunho, a alteração será feita diretamente na revisão antes da publicação.</p>}</div></div></article>)}</div></section>{content.exceptions.length > 0 && <ListSection title="Exceções a validar" values={content.exceptions} tone="warn" />}{content.risks.length > 0 && <ListSection title="Riscos observados" values={content.risks} tone="risk" />}<section><p className="text-xs font-bold uppercase tracking-[.14em] text-[#57574F]">Evidências da entrevista</p><div className="mt-3 space-y-2">{content.evidence.map((item, index) => <blockquote key={index} className="rounded-xl bg-[#E7EAFB] p-4 text-sm leading-6 text-[#57574F]">“{item.quote}”<footer className="mt-2 text-xs font-semibold text-[#1B3BD6]">{item.speaker}</footer></blockquote>)}</div></section></div></>}</SheetContent></Sheet>;
}

function InfoBox({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-[#E7EAFB] p-4"><p className="text-xs font-bold uppercase tracking-wider text-[#57574F]">{label}</p><p className="mt-2 text-sm leading-6 text-[#1C1C1A]">{value}</p></div>; }
function ListSection({ title, values, tone }: { title: string; values: string[]; tone: "warn" | "risk" }) { return <section className={`rounded-xl p-4 ${tone === "warn" ? "bg-[#F8EEDD]" : "bg-[#F7EDEC]"}`}><p className="text-xs font-bold uppercase tracking-[.14em] text-[#9A5B00]">{title}</p><ul className="mt-3 space-y-2 text-sm text-[#57574F]">{values.map((value) => <li key={value} className="flex gap-2"><span>•</span>{value}</li>)}</ul></section>; }

function ReviewDialog({ open, report, processes, initialProcessId, initialStepKey, onClose, onSaved }: {
  open: boolean;
  report: Workspace["reports"][number];
  processes: ProcessRow[];
  initialProcessId: string | null;
  initialStepKey: string | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const initialDraft = createReviewDraft(report.content, processes);
  const [draft, setDraft] = useState<ReviewDraft>(initialDraft);
  const [initialHash] = useState(() => JSON.stringify(initialDraft));
  const [activeTab, setActiveTab] = useState(initialProcessId ? "processes" : "diagnosis");
  const [selectedReviewProcessId, setSelectedReviewProcessId] = useState(initialProcessId || initialDraft.processes[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const initialStepRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!initialStepKey || activeTab !== "processes") return;
    const frame = window.requestAnimationFrame(() => initialStepRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, initialStepKey]);

  function updateDraft(change: (next: ReviewDraft) => void) {
    setDraft((current) => {
      const next = structuredClone(current);
      change(next);
      return next;
    });
  }

  function addStep(processIndex: number) {
    updateDraft((next) => {
      const process = next.processes[processIndex];
      process.steps.push({
        key: `owner_${crypto.randomUUID()}`,
        title: "Nova etapa",
        body: "",
        ownerRole: process.ownerRole,
        evidence: [],
      });
    });
  }

  function removeStep(processIndex: number, stepIndex: number) {
    updateDraft((next) => {
      if (next.processes[processIndex].steps.length <= 1) return;
      next.processes[processIndex].steps.splice(stepIndex, 1);
    });
  }

  function moveStep(processIndex: number, stepIndex: number, direction: -1 | 1) {
    updateDraft((next) => {
      const steps = next.processes[processIndex].steps;
      const destination = stepIndex + direction;
      if (destination < 0 || destination >= steps.length) return;
      const [step] = steps.splice(stepIndex, 1);
      steps.splice(destination, 0, step);
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/reports/${report.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUpdatedAt: report.updatedAt,
          report: {
            companyContext: draft.report.companyContext,
            executiveSummary: draft.report.executiveSummary,
            findings: draft.report.findings.map(({ title, detail, severity }) => ({ title, detail, severity })),
            priorities: draft.report.priorities,
          },
          processes: draft.processes.map((process) => ({
            id: process.id,
            versionId: process.versionId,
            title: process.title,
            area: process.area,
            objective: process.objective,
            trigger: process.trigger,
            ownerRole: process.ownerRole,
            inputs: process.inputs,
            steps: process.steps.map(({ key, title, body, ownerRole }) => ({ key, title, body, ownerRole })),
            decisions: process.decisions,
            exceptions: process.exceptions,
            outputs: process.outputs,
            risks: process.risks,
            dependencies: process.dependencies,
          })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar as correções.");
      await onSaved(`${result.correctedProcesses} processo(s) corrigido(s). O rascunho continua aguardando sua aprovação.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar as correções.");
    } finally {
      setSaving(false);
    }
  }

  const changed = JSON.stringify(draft) !== initialHash;
  const valid = draft.processes.every((process) =>
    process.title.trim().length >= 2
    && process.area.trim().length >= 2
    && process.ownerRole.trim().length >= 2
    && process.objective.trim().length >= 4
    && process.steps.length >= 1
    && process.steps.every((step) => step.title.trim().length >= 2 && step.body.trim().length >= 4 && step.ownerRole.trim().length >= 2),
  );
  const selectedProcessIndex = Math.max(0, draft.processes.findIndex((process) => process.id === selectedReviewProcessId));
  const selectedProcess = draft.processes[selectedProcessIndex];
  return <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && !saving && onClose()}>
    <DialogContent className="flex h-svh max-h-svh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 [&_[data-slot=dialog-close]]:text-white [&_[data-slot=dialog-close]]:opacity-80 [&_[data-slot=dialog-close]]:hover:bg-white/10 [&_[data-slot=dialog-close]]:hover:opacity-100 sm:h-[94svh] sm:max-h-[94svh] sm:w-[96vw] sm:max-w-[1500px] sm:rounded-2xl sm:border">
      <DialogHeader className="shrink-0 border-b bg-[#1C1C1A] px-6 py-4 pr-14 text-white sm:px-8 sm:py-5">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-[#8FA6FF]"><PencilLine className="size-4" />Revisão humana</div>
        <DialogTitle className="mt-1 font-serif text-2xl text-white sm:text-3xl">Corrija o rascunho antes de publicar</DialogTitle>
        <DialogDescription className="max-w-3xl text-white/60">Edite interpretações, responsáveis e etapas. Os trechos originais da entrevista permanecem bloqueados como evidência, e salvar não publica nada.</DialogDescription>
      </DialogHeader>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
        <div className="shrink-0 border-b bg-[#FAFAF7] px-4 py-2 sm:px-8 sm:py-3"><TabsList className="w-full sm:w-auto"><TabsTrigger value="diagnosis">Diagnóstico</TabsTrigger><TabsTrigger value="processes">Processos ({draft.processes.length})</TabsTrigger></TabsList></div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <TabsContent value="diagnosis" className="mt-0 h-full space-y-7 overflow-y-auto px-5 py-6 sm:px-8">
            <section className="grid gap-5 lg:grid-cols-2">
              <ReviewField label="Contexto da empresa" hint="Corrija interpretações sobre momento, equipe e operação."><Textarea value={draft.report.companyContext} onChange={(event) => updateDraft((next) => { next.report.companyContext = event.target.value; })} className="mt-2 min-h-40 resize-y bg-[#FAFAF7]" /></ReviewField>
              <ReviewField label="Resumo executivo" hint="Este é o texto principal apresentado ao dono."><Textarea value={draft.report.executiveSummary} onChange={(event) => updateDraft((next) => { next.report.executiveSummary = event.target.value; })} className="mt-2 min-h-40 resize-y bg-[#FAFAF7]" /></ReviewField>
            </section>
            <section><h3 className="font-serif text-2xl text-[#1C1C1A]">Achados do diagnóstico</h3><p className="mt-1 text-sm text-[#57574F]">A conclusão pode ser corrigida; a citação que a sustenta continua intacta.</p><Accordion type="multiple" className="mt-4 rounded-2xl border bg-[#FAFAF7] px-5">{draft.report.findings.map((finding, index) => <AccordionItem key={index} value={`finding-${index}`}><AccordionTrigger><span className="flex items-center gap-3"><span className={`size-2 rounded-full ${finding.severity === "HIGH" ? "bg-[#1B3BD6]" : finding.severity === "MEDIUM" ? "bg-[#9A5B00]" : "bg-[#147A4E]"}`} />{finding.title}</span></AccordionTrigger><AccordionContent className="space-y-4"><ReviewField label="Título"><Input value={finding.title} onChange={(event) => updateDraft((next) => { next.report.findings[index].title = event.target.value; })} className="mt-2" /></ReviewField><ReviewField label="Interpretação"><Textarea value={finding.detail} onChange={(event) => updateDraft((next) => { next.report.findings[index].detail = event.target.value; })} className="mt-2 min-h-28" /></ReviewField><ReviewField label="Criticidade"><Select value={finding.severity} onValueChange={(value: "LOW" | "MEDIUM" | "HIGH") => updateDraft((next) => { next.report.findings[index].severity = value; })}><SelectTrigger className="mt-2 w-full sm:w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="LOW">Baixa</SelectItem><SelectItem value="MEDIUM">Média</SelectItem><SelectItem value="HIGH">Alta</SelectItem></SelectContent></Select></ReviewField>{finding.evidence[0] && <blockquote className="rounded-xl bg-[#E7EAFB] p-4 text-sm leading-6 text-[#57574F]"><span className="text-xs font-bold uppercase tracking-wider text-[#1B3BD6]">Evidência preservada</span><p className="mt-2">“{finding.evidence[0].quote}”</p><footer className="mt-2 text-xs font-semibold">{finding.evidence[0].speaker}</footer></blockquote>}</AccordionContent></AccordionItem>)}</Accordion></section>
            <section><h3 className="font-serif text-2xl text-[#1C1C1A]">Prioridades recomendadas</h3><div className="mt-4 grid gap-4 lg:grid-cols-3">{draft.report.priorities.map((priority, index) => <article key={index} className="space-y-4 rounded-2xl border bg-[#FAFAF7] p-5"><ReviewField label="Prioridade"><Input value={priority.title} onChange={(event) => updateDraft((next) => { next.report.priorities[index].title = event.target.value; })} className="mt-2" /></ReviewField><ReviewField label="Por que agora"><Textarea value={priority.whyNow} onChange={(event) => updateDraft((next) => { next.report.priorities[index].whyNow = event.target.value; })} className="mt-2 min-h-24" /></ReviewField><ReviewField label="Resultado esperado"><Textarea value={priority.expectedOutcome} onChange={(event) => updateDraft((next) => { next.report.priorities[index].expectedOutcome = event.target.value; })} className="mt-2 min-h-24" /></ReviewField></article>)}</div></section>
          </TabsContent>
          <TabsContent value="processes" className="mt-0 h-full overflow-hidden">
            <div className="flex h-full min-h-0 flex-col lg:grid lg:grid-cols-[300px_minmax(0,1fr)]">
              <aside className="shrink-0 border-b bg-[#FAFAF7] lg:min-h-0 lg:border-r lg:border-b-0 lg:overflow-y-auto" aria-label="Processos para revisar">
                <div className="border-b px-5 py-4">
                  <p className="font-semibold text-[#1C1C1A]">Processos para revisar</p>
                  <p className="mt-1 text-xs leading-5 text-[#57574F]">Selecione um processo para editar sem perder o contexto.</p>
                </div>
                <nav className="flex gap-2 overflow-x-auto p-3 lg:flex-col lg:overflow-x-visible" aria-label="Seleção do processo">
                  {draft.processes.map((process, index) => {
                    const selected = process.id === selectedProcess?.id;
                    return <button key={process.id} type="button" onClick={() => setSelectedReviewProcessId(process.id)} aria-current={selected ? "true" : undefined} className={`min-w-[230px] rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B3BD6] focus-visible:ring-offset-2 lg:min-w-0 ${selected ? "border-[#1B3BD6] bg-[#FAFAF7]" : "border-transparent bg-transparent hover:border-[#D7D6CF] hover:bg-white/70"}`}>
                      <span className="flex items-start gap-3"><span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${selected ? "bg-[#1C1C1A] text-white" : "bg-[#D7D6CF] text-[#57574F]"}`}>{index + 1}</span><span className="min-w-0"><span className="block break-words text-sm font-semibold leading-5 text-[#1C1C1A]">{process.title || "Processo sem nome"}</span><span className="mt-1 block text-xs leading-5 text-[#57574F]">{process.area || "Área a definir"} · {process.steps.length} etapas</span></span></span>
                    </button>;
                  })}
                </nav>
              </aside>
              <main className="min-h-0 overflow-y-auto bg-[#FAFAF7]" aria-label="Editor do processo selecionado">
                {selectedProcess ? <div className="mx-auto max-w-[1120px] px-5 py-6 sm:px-8 sm:py-8">
                  <div className="mb-6 flex flex-col gap-4 border-b border-[#D7D6CF] pb-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#1B3BD6]">Editor do processo {selectedProcessIndex + 1} de {draft.processes.length}</p><h3 className="mt-2 break-words font-serif text-3xl leading-tight text-[#1C1C1A]">{selectedProcess.title || "Processo sem nome"}</h3><p className="mt-2 text-sm text-[#57574F]">Revise todos os campos e etapas deste processo antes de avançar para o próximo.</p></div>
                    <div className="shrink-0 rounded-xl border border-[#D7D6CF] bg-[#E3F2EA] px-4 py-3 text-xs leading-5 text-[#147A4E]"><ShieldCheck className="mr-2 inline size-4" />Evidências originais preservadas</div>
                  </div>
                  <div className="space-y-8">
                    <section className="rounded-2xl border bg-[#FAFAF7] p-5 sm:p-6">
                      <h4 className="font-semibold text-[#1C1C1A]">Identificação e contexto</h4>
                      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3"><ReviewField label="Nome do processo"><Input value={selectedProcess.title} onChange={(event) => updateDraft((next) => { next.processes[selectedProcessIndex].title = event.target.value; })} className="mt-2" /></ReviewField><ReviewField label="Área"><Input value={selectedProcess.area} onChange={(event) => updateDraft((next) => { next.processes[selectedProcessIndex].area = event.target.value; })} className="mt-2" /></ReviewField><ReviewField label="Responsável"><Input value={selectedProcess.ownerRole} onChange={(event) => updateDraft((next) => { next.processes[selectedProcessIndex].ownerRole = event.target.value; })} className="mt-2" /></ReviewField></div>
                      <div className="mt-5 grid gap-5 xl:grid-cols-2"><ReviewField label="Objetivo"><Textarea value={selectedProcess.objective} onChange={(event) => updateDraft((next) => { next.processes[selectedProcessIndex].objective = event.target.value; })} className="mt-2 min-h-36 resize-y" /></ReviewField><ReviewField label="Gatilho"><Textarea value={selectedProcess.trigger} onChange={(event) => updateDraft((next) => { next.processes[selectedProcessIndex].trigger = event.target.value; })} className="mt-2 min-h-36 resize-y" /></ReviewField></div>
                    </section>
                    <section>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h4 className="font-semibold text-[#1C1C1A]">Etapas do processo</h4><p className="mt-1 text-sm text-[#57574F]">Edite o conteúdo, reorganize a sequência ou inclua e remova etapas.</p></div><Button type="button" variant="outline" size="sm" onClick={() => addStep(selectedProcessIndex)} className="w-full sm:w-auto"><Plus />Adicionar etapa</Button></div>
                      <div className="mt-4 space-y-4">{selectedProcess.steps.map((step, stepIndex) => <article key={step.key} ref={step.key === initialStepKey ? initialStepRef : undefined} className={`rounded-2xl border bg-[#FAFAF7] p-5 transition sm:p-6 ${step.key === initialStepKey ? "border-[#1B3BD6] ring-2 ring-[#1B3BD6]/20" : ""}`}>
                        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b pb-4"><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-[#1C1C1A] text-xs font-semibold text-white">{stepIndex + 1}</span><span className="text-sm font-semibold text-[#1C1C1A]">Etapa {stepIndex + 1}</span>{step.key.startsWith("owner_") && <Badge className="border-0 bg-[#E3F2EA] text-[#147A4E]">Adicionada pelo dono</Badge>}</div><div className="flex items-center gap-1"><Button type="button" variant="ghost" size="icon-sm" onClick={() => moveStep(selectedProcessIndex, stepIndex, -1)} disabled={stepIndex === 0} aria-label={`Mover etapa ${stepIndex + 1} para cima`} title="Mover para cima"><ArrowUp /></Button><Button type="button" variant="ghost" size="icon-sm" onClick={() => moveStep(selectedProcessIndex, stepIndex, 1)} disabled={stepIndex === selectedProcess.steps.length - 1} aria-label={`Mover etapa ${stepIndex + 1} para baixo`} title="Mover para baixo"><ArrowDown /></Button><Button type="button" variant="ghost" size="icon-sm" onClick={() => removeStep(selectedProcessIndex, stepIndex)} disabled={selectedProcess.steps.length === 1} aria-label={`Excluir etapa ${stepIndex + 1}`} title={selectedProcess.steps.length === 1 ? "O processo precisa manter ao menos uma etapa" : "Excluir etapa"} className="text-[#A33A33] hover:bg-[#F7EDEC] hover:text-[#A33A33]"><Trash2 /></Button></div></div>
                        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]"><ReviewField label="Título da etapa"><Input value={step.title} onChange={(event) => updateDraft((next) => { next.processes[selectedProcessIndex].steps[stepIndex].title = event.target.value; })} className="mt-2" /></ReviewField><ReviewField label="Responsável"><Input value={step.ownerRole} onChange={(event) => updateDraft((next) => { next.processes[selectedProcessIndex].steps[stepIndex].ownerRole = event.target.value; })} className="mt-2" /></ReviewField></div>
                        <div className="mt-5"><ReviewField label="Como é executada" hint="Descreva a ação, o critério de conclusão e quem recebe o trabalho em seguida."><Textarea value={step.body} onChange={(event) => updateDraft((next) => { next.processes[selectedProcessIndex].steps[stepIndex].body = event.target.value; })} placeholder="Descreva a execução completa desta etapa." className="mt-2 min-h-40 resize-y leading-6" /></ReviewField></div>
                        {step.evidence[0] ? <p className="mt-4 rounded-xl bg-[#E7EAFB] p-4 text-xs leading-5 text-[#57574F]"><strong>Evidência preservada:</strong> “{step.evidence[0].quote}”</p> : <p className="mt-4 rounded-xl border border-dashed border-[#D7D6CF] bg-[#FAFAF7] p-4 text-xs leading-5 text-[#57574F]"><strong>Inclusão humana:</strong> esta etapa não possui citação na entrevista original e ficará identificada na auditoria.</p>}
                      </article>)}</div>
                      <Button type="button" variant="outline" onClick={() => addStep(selectedProcessIndex)} className="mt-4 w-full border-dashed py-6"><Plus />Adicionar outra etapa</Button>
                    </section>
                    <section className="rounded-2xl border bg-[#FAFAF7] p-5 sm:p-6"><h4 className="font-semibold text-[#1C1C1A]">Regras e conexões</h4><p className="mt-1 text-sm text-[#57574F]">Use uma linha para cada item. Os campos podem crescer verticalmente conforme necessário.</p><div className="mt-5 grid gap-5 xl:grid-cols-2"><LinesField label="Entradas" values={selectedProcess.inputs} onChange={(values) => updateDraft((next) => { next.processes[selectedProcessIndex].inputs = values; })} /><LinesField label="Saídas" values={selectedProcess.outputs} onChange={(values) => updateDraft((next) => { next.processes[selectedProcessIndex].outputs = values; })} /><LinesField label="Decisões" values={selectedProcess.decisions} onChange={(values) => updateDraft((next) => { next.processes[selectedProcessIndex].decisions = values; })} /><LinesField label="Exceções" values={selectedProcess.exceptions} onChange={(values) => updateDraft((next) => { next.processes[selectedProcessIndex].exceptions = values; })} /><LinesField label="Riscos" values={selectedProcess.risks} onChange={(values) => updateDraft((next) => { next.processes[selectedProcessIndex].risks = values; })} /><LinesField label="Dependências" values={selectedProcess.dependencies} onChange={(values) => updateDraft((next) => { next.processes[selectedProcessIndex].dependencies = values; })} /></div></section>
                  </div>
                </div> : <div className="grid h-full place-items-center p-8 text-center"><div><FileText className="mx-auto size-8 text-[#57574F]" /><p className="mt-3 font-semibold text-[#1C1C1A]">Nenhum processo disponível para revisão</p></div></div>}
              </main>
            </div>
          </TabsContent>
        </div>
      </Tabs>
      <DialogFooter className="shrink-0 border-t bg-[#FAFAF7] px-5 py-3 sm:px-8 sm:py-4"><div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div>{error ? <p className="text-sm text-[#A33A33]">{error}</p> : changed && !valid ? <p className="text-sm text-[#A33A33]">Complete o nome, o responsável e a execução de todas as etapas.</p> : <p className="text-xs text-[#57574F]">Salvar mantém o status “aguardando aprovação”.</p>}</div><div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end"><Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button><Button onClick={save} disabled={saving || !changed || !valid} className="bg-[#1C1C1A] text-white hover:bg-[#1531AE]">{saving ? <Loader2 className="animate-spin" /> : <Save />}{saving ? "Salvando…" : "Salvar correções"}</Button></div></div></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function ReviewField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block text-sm font-medium text-[#1C1C1A]"><span>{label}</span>{hint && <span className="mt-1 block text-xs font-normal leading-5 text-[#57574F]">{hint}</span>}{children}</label>;
}

function LinesField({ label, values, onChange }: { label: string; values: string[]; onChange: (values: string[]) => void }) {
  return <ReviewField label={label} hint="Um item por linha"><Textarea value={values.join("\n")} onChange={(event) => onChange(parseLines(event.target.value))} className="mt-2 min-h-32 resize-y leading-6" /></ReviewField>;
}

function SuggestionDialog({ target, onClose, onSaved }: { target: { process: ProcessRow; step: ProcessContent["steps"][number] } | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [proposedText, setProposedText] = useState(""); const [rationale, setRationale] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  async function save() {
    if (!target) return; setSaving(true); setError("");
    try {
      const response = await fetch(`/api/processes/${target.process.id}/suggestions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stepKey: target.step.key, currentText: target.step.body, proposedText, rationale }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Falha ao enviar.");
      setProposedText(""); setRationale(""); onSaved(result.analysisStatus === "COMPLETED" ? "Sugestão salva e analisada pela IA. O dono já pode revisar riscos e configurar um teste." : "Sugestão salva. A análise da IA pode ser refeita na caixa de decisões.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao enviar."); } finally { setSaving(false); }
  }
  return <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>Sugerir melhoria no processo</DialogTitle><DialogDescription>Você propõe; o dono decide. A versão oficial permanece intacta até aprovação.</DialogDescription></DialogHeader>{target && <div className="space-y-4"><div className="rounded-xl bg-[#E7EAFB] p-4 text-sm"><strong>{target.step.title}</strong><p className="mt-2 leading-6 text-[#57574F]">{target.step.body}</p></div><label className="text-sm font-medium">Como deveria ficar<Textarea value={proposedText} onChange={(event) => setProposedText(event.target.value)} className="mt-2 min-h-28" /></label><label className="text-sm font-medium">Por que isso melhora a operação?<Textarea value={rationale} onChange={(event) => setRationale(event.target.value)} className="mt-2 min-h-24" /></label>{error && <p className="text-sm text-[#A33A33]">{error}</p>}</div>}<DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save} disabled={saving || proposedText.length < 8 || rationale.length < 8} className="bg-[#1C1C1A]">{saving ? <Loader2 className="animate-spin" /> : <Send />}Enviar para aprovação</Button></DialogFooter></DialogContent></Dialog>;
}

type DecisionTab = "pending" | "testing" | "review" | "approved" | "rejected";
type DecisionItem = Suggestion & { sourceKind?: "SUGGESTION" | "INSIGHT" };

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function inputDate(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function addDaysInput(days: number) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return inputDate(value);
}

function metricValue(value: number | null | undefined, unit: string) {
  if (value === null || value === undefined) return "—";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)} ${unit}`;
}

function DecisionQueue({ suggestions, rejectedInsights, processes, focusId, onFocusHandled, onChanged }: { suggestions: Suggestion[]; rejectedInsights: InsightRow[]; processes: ProcessRow[]; focusId: string | null; onFocusHandled: () => void; onChanged: (message: string) => Promise<void> }) {
  const dueCount = suggestions.filter((item) => item.status === "IN_TEST" && item.experiment?.reviewDue).length;
  const focusSuggestion = focusId ? suggestions.find((item) => item.id === focusId) ?? null : null;
  const [tab, setTab] = useState<DecisionTab>(focusSuggestion ? "pending" : dueCount ? "review" : "pending");
  const [testTarget, setTestTarget] = useState<Suggestion | null>(focusSuggestion);
  const [metricTarget, setMetricTarget] = useState<Suggestion | null>(null);
  const [evaluationTarget, setEvaluationTarget] = useState<{ suggestion: Suggestion; mode: "REVIEW" | "REJECT" } | null>(null);
  const [actionError, setActionError] = useState("");
  const [workingId, setWorkingId] = useState("");
  const processName = (id: string) => processes.find((row) => row.id === id)?.title || "Processo não vinculado";
  const processOwner = (id: string) => processes.find((row) => row.id === id)?.ownerName || "Dono do processo";
  const rejectedInsightItems: DecisionItem[] = rejectedInsights.map((insight) => ({
    id: `insight:${insight.id}`,
    processId: insight.primaryProcessId || "",
    stepKey: "",
    currentText: insight.analysis?.currentVsProposed.current || "",
    proposedText: insight.analysis?.currentVsProposed.proposed || insight.transcript,
    rationale: insight.analysis?.rationale || "Insight analisado e rejeitado pelo dono.",
    status: "REJECTED",
    decisionReason: insight.decisionReason,
    createdAt: insight.createdAt,
    updatedAt: insight.updatedAt,
    experiment: null,
    sourceKind: "INSIGHT",
  }));
  const buckets: Record<DecisionTab, DecisionItem[]> = {
    pending: suggestions.filter((item) => ["PENDING", "NEEDS_CLARIFICATION"].includes(item.status)),
    testing: suggestions.filter((item) => item.status === "IN_TEST" && !item.experiment?.reviewDue),
    review: suggestions.filter((item) => item.status === "IN_TEST" && item.experiment?.reviewDue),
    approved: suggestions.filter((item) => item.status === "APPROVED"),
    rejected: [...suggestions.filter((item) => item.status === "REJECTED"), ...rejectedInsightItems],
  };

  async function simpleDecision(item: Suggestion, action: "CLARIFY") {
    setWorkingId(item.id);
    setActionError("");
    try {
      const response = await fetch(`/api/suggestions/${item.id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "A decisão não foi concluída.");
      await onChanged("A sugestão voltou para detalhamento sem alterar o processo oficial.");
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : "A decisão não foi concluída."); }
    finally { setWorkingId(""); }
  }

  async function analyzeDecision(item: Suggestion) {
    setWorkingId(item.id); setActionError("");
    try {
      const response = await fetch(`/api/suggestions/${item.id}/analyze`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "A análise da IA não foi concluída.");
      await onChanged("A análise da IA foi atualizada. O dono continua responsável pela decisão.");
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : "A análise da IA não foi concluída."); }
    finally { setWorkingId(""); }
  }

  return <div className="space-y-7">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm text-[#57574F]">Melhoria contínua com evidência</p><h1 className="font-serif text-4xl tracking-[-.035em]">Ciclo de decisões</h1><p className="mt-3 max-w-3xl leading-7 text-[#57574F]">Teste mudanças em escala controlada, compare o antes e o depois e preserve cada decisão como aprendizado da empresa.</p></div>{dueCount > 0 && <button type="button" onClick={() => setTab("review")} className="flex items-center gap-3 rounded-2xl border border-[#E0BAB6] bg-[#F7EDEC] px-4 py-3 text-left text-[#A33A33]"><BellRing className="size-5" /><span><strong className="block text-sm">{dueCount} teste(s) aguardando avaliação</strong><span className="text-xs">A decisão final está vencida.</span></span></button>}</div>
    <Tabs value={tab} onValueChange={(value) => setTab(value as DecisionTab)} className="gap-5">
      <div className="overflow-x-auto pb-1"><TabsList className="h-auto min-w-max justify-start bg-[#E5E4DE] p-1"><DecisionTabTrigger value="pending" label="Pendentes" count={buckets.pending.length} /><DecisionTabTrigger value="testing" label="Em teste" count={buckets.testing.length} /><DecisionTabTrigger value="review" label="Avaliar" count={buckets.review.length} alert={dueCount > 0} /><DecisionTabTrigger value="approved" label="Aprovadas" count={buckets.approved.length} /><DecisionTabTrigger value="rejected" label="Rejeitadas" count={buckets.rejected.length} /></TabsList></div>
      {(["pending", "testing", "review", "approved", "rejected"] as DecisionTab[]).map((key) => <TabsContent key={key} value={key} className="mt-0">
        {buckets[key].length === 0 ? <DecisionEmpty tab={key} /> : <div className="space-y-4">{buckets[key].map((item) => <DecisionCard
          key={item.id}
          item={item}
          processName={processName(item.processId)}
          working={workingId === item.id}
          onTest={() => setTestTarget(item)}
          onMetric={() => setMetricTarget(item)}
          onEvaluate={() => setEvaluationTarget({ suggestion: item, mode: "REVIEW" })}
          onReject={() => setEvaluationTarget({ suggestion: item, mode: "REJECT" })}
          onClarify={() => simpleDecision(item, "CLARIFY")}
          onAnalyze={() => analyzeDecision(item)}
        />)}</div>}
      </TabsContent>)}
    </Tabs>
    {actionError && <p role="alert" className="rounded-xl border border-[#E0BAB6] bg-[#F7EDEC] p-4 text-sm text-[#A33A33]">{actionError}</p>}
    {testTarget && <TestSetupDialog key={testTarget.id} target={testTarget} responsibleName={processOwner(testTarget.processId)} onClose={() => { setTestTarget(null); onFocusHandled(); }} onSaved={async () => { setTestTarget(null); onFocusHandled(); setTab("testing"); await onChanged("Teste iniciado. A mudança ainda não alterou o processo oficial."); }} />}
    {metricTarget && <MetricDialog key={`${metricTarget.id}:${metricTarget.status}`} target={metricTarget} onClose={() => setMetricTarget(null)} onSaved={async () => { setMetricTarget(null); await onChanged("Medição registrada no histórico do teste."); }} />}
    {evaluationTarget && <EvaluationDialog key={`${evaluationTarget.suggestion.id}:${evaluationTarget.mode}`} target={evaluationTarget} onClose={() => setEvaluationTarget(null)} onSaved={async (status, version) => { setEvaluationTarget(null); setTab(status === "APPROVED" ? "approved" : status === "REJECTED" ? "rejected" : "testing"); await onChanged(status === "APPROVED" ? `Mudança aprovada e publicada como versão ${version}. O acompanhamento de 90 dias começou.` : status === "REJECTED" ? "Mudança rejeitada e preservada no backlog com a justificativa." : "Prazo do teste prorrogado."); }} />}
  </div>;
}

function DecisionTabTrigger({ value, label, count, alert = false }: { value: DecisionTab; label: string; count: number; alert?: boolean }) {
  return <TabsTrigger value={value} className="gap-2 px-4 py-2.5"><span>{label}</span><span className={`grid min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold ${alert ? "bg-[#1B3BD6] text-white" : "bg-white/70 text-[#57574F]"}`}>{count}</span></TabsTrigger>;
}

function DecisionEmpty({ tab }: { tab: DecisionTab }) {
  const copy: Record<DecisionTab, [string, string]> = {
    pending: ["Nenhuma decisão pendente", "As próximas sugestões da operação aparecerão aqui."],
    testing: ["Nenhum teste em andamento", "As mudanças escolhidas para piloto aparecerão com prazo e métricas."],
    review: ["Nenhum teste vencido", "Quando um prazo terminar, a avaliação dos dados será cobrada aqui."],
    approved: ["Nenhuma mudança aprovada", "Decisões validadas e seu acompanhamento de 90 dias aparecerão aqui."],
    rejected: ["Backlog vazio", "Mudanças rejeitadas serão preservadas com seus motivos."],
  };
  return <div className="rounded-2xl border border-dashed bg-[#FAFAF7] p-12 text-center"><CheckCircle2 className="mx-auto size-9 text-[#B9B8B0]" /><h2 className="mt-4 font-semibold">{copy[tab][0]}</h2><p className="mt-2 text-sm text-[#57574F]">{copy[tab][1]}</p></div>;
}

function DecisionCard({ item, processName, working, onTest, onMetric, onEvaluate, onReject, onClarify, onAnalyze }: { item: DecisionItem; processName: string; working: boolean; onTest: () => void; onMetric: () => void; onEvaluate: () => void; onReject: () => void; onClarify: () => void; onAnalyze: () => void }) {
  const experiment = item.experiment;
  const latest = experiment?.readings[0];
  return <article className={`overflow-hidden rounded-2xl border bg-[#FAFAF7] ${experiment?.reviewDue ? "border-[#E0BAB6] shadow-[0_0_0_3px_rgba(216,104,63,.08)]" : "border-[#D7D6CF]"}`}>
    <div className="p-5 sm:p-6"><div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{processName}</Badge>{item.sourceKind === "INSIGHT" && <Badge className="border-0 bg-[#E7EAFB] text-[#1B3BD6]">Insight do dono</Badge>}{item.sourceInsightId && <Badge className="border-0 bg-[#E7EAFB] text-[#1B3BD6]">Originada de insight</Badge>}<DecisionStatusBadge item={item} /></div><h2 className="mt-4 text-lg font-semibold leading-7 text-[#1C1C1A]">{item.proposedText}</h2><p className="mt-2 text-sm leading-6 text-[#57574F]">{item.rationale}</p></div><DecisionActions item={item} working={working} onTest={onTest} onMetric={onMetric} onEvaluate={onEvaluate} onReject={onReject} onClarify={onClarify} /></div>
      {!item.sourceInsightId && ["PENDING", "NEEDS_CLARIFICATION"].includes(item.status) && <SuggestionAiAnalysis item={item} working={working} onAnalyze={onAnalyze} />}
      {experiment && <div className="mt-6 border-t pt-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricTile label="Métrica principal" value={experiment.metricName} detail={experiment.desiredDirection === "DECREASE" ? "Menor é melhor" : "Maior é melhor"} /><MetricTile label="Antes" value={metricValue(experiment.baselineValue, experiment.metricUnit)} detail="Baseline" /><MetricTile label={item.status === "APPROVED" ? "Resultado do teste" : "Última medição"} value={metricValue(experiment.resultValue ?? latest?.value, experiment.metricUnit)} detail={latest ? formatDate(latest.measuredAt) : "Aguardando dado"} /><MetricTile label="Meta" value={metricValue(experiment.targetValue, experiment.metricUnit)} detail={experiment.guardrailMetric || "Sem métrica de segurança"} /></div><ExperimentProgress experiment={experiment} currentValue={experiment.resultValue ?? latest?.value} />
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#57574F]"><span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" />Teste: {formatDate(experiment.startsAt)} – {formatDate(experiment.endsAt)}</span><span className="flex items-center gap-1.5"><ClipboardCheck className="size-3.5" />Responsável: {experiment.responsibleName}</span>{item.status === "APPROVED" && experiment.monitoringUntil && <span className="flex items-center gap-1.5"><Activity className="size-3.5" />Monitoramento até {formatDate(experiment.monitoringUntil)}</span>}</div>
        {experiment.decisionReason && <p className={`mt-4 rounded-xl p-4 text-sm leading-6 ${item.status === "REJECTED" ? "bg-[#F7EDEC] text-[#A33A33]" : "bg-[#E3F2EA] text-[#147A4E]"}`}><strong>{item.status === "REJECTED" ? "Por que foi rejeitada: " : "Fundamento da aprovação: "}</strong>{experiment.decisionReason}</p>}
      </div>}
      {!experiment && item.decisionReason && <p className="mt-5 rounded-xl bg-[#F7EDEC] p-4 text-sm leading-6 text-[#A33A33]"><strong>Por que foi rejeitada: </strong>{item.decisionReason}</p>}
    </div>
  </article>;
}

function SuggestionAiAnalysis({ item, working, onAnalyze }: { item: Suggestion; working: boolean; onAnalyze: () => void }) {
  if (item.analysisStatus === "ANALYZING") return <div className="mt-5 flex items-center gap-3 rounded-xl border border-[#D7D6CF] bg-[#F0EFEA] p-4 text-sm text-[#57574F]"><Loader2 className="size-4 animate-spin text-[#1B3BD6]" /><span><strong className="text-[#1C1C1A]">IA analisando a sugestão.</strong> Comparando riscos, impactos e viabilidade do teste.</span></div>;
  if (!item.analysis || item.analysisStatus === "FAILED") return <div className="mt-5 flex flex-col gap-3 rounded-xl border border-[#E0BAB6] bg-[#F7EDEC] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-[#A33A33]">Análise da IA indisponível</p><p className="mt-1 text-xs text-[#57574F]">A sugestão foi preservada. Você pode solicitar uma nova análise antes de decidir.</p></div><Button onClick={onAnalyze} disabled={working} variant="outline" className="shrink-0 border-[#E0BAB6]">{working ? <Loader2 className="animate-spin" /> : <BrainCircuit />}Gerar análise da IA</Button></div>;
  const analysis = item.analysis;
  const recommendation = analysis.recommendation === "PILOT" ? "Vale testar" : analysis.recommendation === "NEED_MORE_INFO" ? "Pedir mais informações" : "Não testar agora";
  const feasibility = analysis.testPlan.feasibility === "HIGH" ? "Alta" : analysis.testPlan.feasibility === "MEDIUM" ? "Média" : "Baixa";
  return <Accordion type="single" collapsible className="mt-5 rounded-xl border border-[#D7D6CF] bg-[#FAFAF7] px-4"><AccordionItem value="suggestion-ai" className="border-0"><AccordionTrigger className="hover:no-underline"><span className="flex flex-wrap items-center gap-2 text-left text-sm"><BrainCircuit className="size-4 text-[#1B3BD6]" /><strong>Análise da IA: {recommendation}</strong><Badge className="border-0 bg-[#FAFAF7] text-[#147A4E]">{item.aiConfidence ?? 0}% confiança</Badge><Badge variant="outline">Viabilidade {feasibility.toLowerCase()}</Badge></span></AccordionTrigger><AccordionContent className="space-y-5">
    <p className="text-sm leading-6 text-[#1C1C1A]">{analysis.summary}</p>
    <div className="grid gap-3 md:grid-cols-2"><div className="rounded-xl bg-[#FAFAF7] p-4"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#57574F]">Regra vigente</p><p className="mt-2 text-sm leading-6 text-[#1C1C1A]">{analysis.currentVsProposed.current}</p></div><div className="rounded-xl bg-[#E3F2EA] p-4"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#1B3BD6]">Mudança avaliada</p><p className="mt-2 text-sm leading-6 text-[#147A4E]">{analysis.currentVsProposed.proposed}</p></div></div>
    <div className="grid gap-3 sm:grid-cols-2"><SwotBox title="Forças" values={analysis.swot.strengths} tone="green" /><SwotBox title="Fraquezas" values={analysis.swot.weaknesses} tone="amber" /><SwotBox title="Oportunidades" values={analysis.swot.opportunities} tone="blue" /><SwotBox title="Ameaças" values={analysis.swot.threats} tone="red" /></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><InsightList title="Tempo" values={analysis.impactDimensions.time} /><InsightList title="Custo" values={analysis.impactDimensions.cost} /><InsightList title="Qualidade" values={analysis.impactDimensions.quality} /><InsightList title="Risco" values={analysis.impactDimensions.risk} /><InsightList title="Treinamento" values={analysis.impactDimensions.training} /></div>
    <div className="grid gap-4 lg:grid-cols-3"><InsightList title="Pode melhorar" values={analysis.expectedImprovements} /><InsightList title="Pode piorar" values={analysis.possibleWorsening} /><InsightList title="Riscos e trade-offs" values={analysis.risksAndTradeoffs} /></div>
    <div className="rounded-xl bg-[#1C1C1A] p-5 text-white"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8FA6FF]">Plano de teste sugerido</p><p className="mt-1 font-semibold">{analysis.testPlan.primaryMetric} · {analysis.testPlan.suggestedDurationDays} dias</p></div><Badge className="border-0 bg-white/10 text-white">{analysis.testPlan.metricUnit}</Badge></div><div className="mt-4 grid gap-3 text-xs leading-5 text-white/70 sm:grid-cols-2"><p><strong className="text-white">Escopo:</strong> {analysis.testPlan.scope}</p><p><strong className="text-white">Guardrail:</strong> {analysis.testPlan.guardrailMetric}</p><p><strong className="text-white">Baseline:</strong> {analysis.testPlan.baselineGuidance}</p><p><strong className="text-white">Meta:</strong> {analysis.testPlan.targetGuidance}</p></div></div>
    <div className="rounded-xl border-l-4 border-[#9A5B00] bg-[#F8EEDD] p-4"><p className="text-xs font-bold uppercase tracking-[.1em] text-[#9A5B00]">Fundamento da recomendação</p><p className="mt-2 text-sm leading-6 text-[#9A5B00]">{analysis.rationale}</p></div>
    {item.aiRun && <p className="text-[11px] text-[#57574F]">Análise: {item.aiRun.provenance === "OPENAI" ? "OpenAI" : "motor local"} · {item.aiRun.model} · prompt P-05S v{item.aiRun.promptVersion}</p>}
  </AccordionContent></AccordionItem></Accordion>;
}

function DecisionStatusBadge({ item }: { item: Suggestion }) {
  const styles = item.status === "APPROVED" ? "bg-[#E3F2EA] text-[#147A4E]" : item.status === "REJECTED" ? "bg-[#E5E4DE] text-[#57574F]" : item.experiment?.reviewDue ? "bg-[#F7EDEC] text-[#A33A33]" : item.status === "IN_TEST" ? "bg-[#E7EAFB] text-[#1B3BD6]" : "bg-[#F8EEDD] text-[#9A5B00]";
  const label = item.status === "APPROVED" ? "Aprovada" : item.status === "REJECTED" ? "Rejeitada" : item.experiment?.reviewDue ? "Avaliação vencida" : item.status === "IN_TEST" ? "Em teste" : item.status === "NEEDS_CLARIFICATION" ? "Precisa de detalhes" : "Pendente";
  return <Badge className={`border-0 ${styles}`}>{label}</Badge>;
}

function DecisionActions({ item, working, onTest, onMetric, onEvaluate, onReject, onClarify }: { item: Suggestion; working: boolean; onTest: () => void; onMetric: () => void; onEvaluate: () => void; onReject: () => void; onClarify: () => void }) {
  if (item.status === "APPROVED") return item.experiment?.monitoringActive ? <Button onClick={onMetric} variant="outline"><Activity />Registrar acompanhamento</Button> : null;
  if (item.status === "REJECTED") return null;
  if (item.status === "IN_TEST") return <div className="grid shrink-0 grid-cols-2 gap-2"><Button onClick={onMetric} variant="outline"><Activity />Medição</Button>{item.experiment?.reviewDue ? <Button onClick={onEvaluate} className="bg-[#1B3BD6] hover:bg-[#1531AE]"><ClipboardCheck />Avaliar</Button> : <Button onClick={onEvaluate} variant="outline"><ClipboardCheck />Encerrar</Button>}</div>;
  const analysisRunning = !item.sourceInsightId && item.analysisStatus === "ANALYZING";
  return <div className="grid shrink-0 grid-cols-2 gap-2"><Button onClick={onTest} disabled={analysisRunning} className="bg-[#1B3BD6] hover:bg-[#1531AE]">{analysisRunning ? <Loader2 className="animate-spin" /> : <Play />}{analysisRunning ? "Analisando" : "Testar"}</Button><Button onClick={onClarify} disabled={working} variant="outline">{working ? <Loader2 className="animate-spin" /> : <MessageSquareText />}Detalhar</Button><Button onClick={onReject} variant="ghost" className="col-span-2 text-[#A33A33]"><Archive />Rejeitar e arquivar</Button></div>;
}

function MetricTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl bg-[#F0EFEA] p-4"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#57574F]">{label}</p><p className="mt-2 break-words text-sm font-semibold text-[#1C1C1A]">{value}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-[#57574F]">{detail}</p></div>;
}

function ExperimentProgress({ experiment, currentValue }: { experiment: SuggestionExperiment; currentValue: number | null | undefined }) {
  if (currentValue === null || currentValue === undefined) return <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#E5E4DE]"><div className="h-full w-0 bg-[#1B3BD6]" /></div>;
  const desiredChange = experiment.desiredDirection === "DECREASE" ? experiment.baselineValue - experiment.targetValue : experiment.targetValue - experiment.baselineValue;
  const achievedChange = experiment.desiredDirection === "DECREASE" ? experiment.baselineValue - currentValue : currentValue - experiment.baselineValue;
  const progress = desiredChange === 0 ? 100 : Math.max(0, Math.min(100, (achievedChange / desiredChange) * 100));
  return <div className="mt-4"><div className="mb-1.5 flex items-center justify-between text-xs text-[#57574F]"><span>Progresso até a meta</span><strong className="text-[#1B3BD6]">{Math.round(progress)}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-[#E5E4DE]"><div className="h-full rounded-full bg-[#1B3BD6] transition-all" style={{ width: `${progress}%` }} /></div></div>;
}

function TestSetupDialog({ target, responsibleName, onClose, onSaved }: { target: Suggestion; responsibleName: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const suggestedPlan = target.analysis?.testPlan;
  const [responsible, setResponsible] = useState(responsibleName);
  const [metricName, setMetricName] = useState(suggestedPlan?.primaryMetric || "Tempo médio de execução da etapa");
  const [metricUnit, setMetricUnit] = useState(suggestedPlan?.metricUnit || "minutos");
  const [direction, setDirection] = useState<"INCREASE" | "DECREASE">(suggestedPlan?.desiredDirection || "DECREASE");
  const [baseline, setBaseline] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [guardrail, setGuardrail] = useState(suggestedPlan?.guardrailMetric || "Taxa de erros ou retrabalho não deve aumentar");
  const [startsAt, setStartsAt] = useState(inputDate());
  const [endsAt, setEndsAt] = useState(addDaysInput(suggestedPlan?.suggestedDurationDays || 30));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/suggestions/${target.id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "PILOT", testConfig: { responsibleName: responsible, metricName, metricUnit, desiredDirection: direction, baselineValue: Number(baseline), targetValue: Number(targetValue), guardrailMetric: guardrail, startsAt, endsAt } }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Não foi possível iniciar o teste.");
      await onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível iniciar o teste."); } finally { setSaving(false); }
  }
  const valid = responsible.trim().length >= 2 && metricName.trim().length >= 3 && metricUnit.trim().length >= 1 && baseline !== "" && targetValue !== "" && Date.parse(endsAt) > Date.parse(startsAt);
  return <Dialog open onOpenChange={(open) => !open && !saving && onClose()}><DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-3xl"><DialogHeader><div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-[#E3F2EA] text-[#1B3BD6]"><Play className="size-5" /></div><DialogTitle className="font-serif text-2xl">Configurar teste da mudança</DialogTitle><DialogDescription>Defina antes do início como o resultado será medido. O processo oficial permanece intacto durante o teste.</DialogDescription></DialogHeader><div className="space-y-5"><div className="rounded-xl bg-[#F0EFEA] p-4 text-sm leading-6 text-[#1C1C1A]"><strong>Mudança proposta:</strong> {target.proposedText}</div>{suggestedPlan && <div className="rounded-xl border border-[#D7D6CF] bg-[#FAFAF7] p-4"><div className="flex items-center gap-2 text-sm font-semibold text-[#1C1C1A]"><BrainCircuit className="size-4 text-[#1B3BD6]" />Sugestão da IA para o desenho do teste</div><div className="mt-3 grid gap-3 text-xs leading-5 text-[#57574F] sm:grid-cols-2"><p><strong className="text-[#1C1C1A]">Escopo:</strong> {suggestedPlan.scope}</p><p><strong className="text-[#1C1C1A]">Baseline:</strong> {suggestedPlan.baselineGuidance}</p><p><strong className="text-[#1C1C1A]">Meta:</strong> {suggestedPlan.targetGuidance}</p><p><strong className="text-[#1C1C1A]">Duração sugerida:</strong> {suggestedPlan.suggestedDurationDays} dias</p></div><p className="mt-3 text-xs text-[#57574F]">Métrica, unidade, direção, guardrail e prazo foram pré-preenchidos. Confirme os valores reais de baseline e meta antes de iniciar.</p></div>}<div className="grid gap-4 sm:grid-cols-2"><ReviewField label="Responsável pelo teste"><Input value={responsible} onChange={(event) => setResponsible(event.target.value)} className="mt-2" /></ReviewField><ReviewField label="Métrica principal"><Input value={metricName} onChange={(event) => setMetricName(event.target.value)} className="mt-2" /></ReviewField><ReviewField label="Unidade"><Input value={metricUnit} onChange={(event) => setMetricUnit(event.target.value)} placeholder="minutos, %, R$..." className="mt-2" /></ReviewField><ReviewField label="Direção desejada"><Select value={direction} onValueChange={(value: "INCREASE" | "DECREASE") => setDirection(value)}><SelectTrigger className="mt-2 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DECREASE">Reduzir é melhor</SelectItem><SelectItem value="INCREASE">Aumentar é melhor</SelectItem></SelectContent></Select></ReviewField><ReviewField label="Valor atual (baseline)" hint="Informe um dado real medido antes da mudança."><Input type="number" step="any" value={baseline} onChange={(event) => setBaseline(event.target.value)} className="mt-2" /></ReviewField><ReviewField label="Meta do teste" hint="Defina o resultado que comprovará a melhoria."><Input type="number" step="any" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} className="mt-2" /></ReviewField><ReviewField label="Início"><Input type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-2" /></ReviewField><ReviewField label="Término e avaliação"><Input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="mt-2" /></ReviewField></div><ReviewField label="Métrica de segurança" hint="O que não pode piorar durante o teste?"><Textarea value={guardrail} onChange={(event) => setGuardrail(event.target.value)} className="mt-2 min-h-24 resize-y" /></ReviewField>{error && <p role="alert" className="text-sm text-[#A33A33]">{error}</p>}</div><DialogFooter><Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button><Button onClick={save} disabled={!valid || saving} className="bg-[#1B3BD6] hover:bg-[#1531AE]">{saving ? <Loader2 className="animate-spin" /> : <Play />}{saving ? "Iniciando…" : "Iniciar teste"}</Button></DialogFooter></DialogContent></Dialog>;
}

function MetricDialog({ target, onClose, onSaved }: { target: Suggestion; onClose: () => void; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState(""); const [measuredAt, setMeasuredAt] = useState(inputDate()); const [source, setSource] = useState("Medição manual"); const [notes, setNotes] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  async function save() { setSaving(true); setError(""); try { const response = await fetch(`/api/suggestions/${target.id}/metrics`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: Number(value), measuredAt, source, notes }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Não foi possível registrar."); setValue(""); setNotes(""); await onSaved(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível registrar."); } finally { setSaving(false); } }
  return <Dialog open onOpenChange={(open) => !open && !saving && onClose()}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle className="font-serif text-2xl">Registrar medição</DialogTitle><DialogDescription>{target.status === "APPROVED" ? "Acompanhe se o ganho continua depois da aprovação." : "Adicione um ponto de dados ao teste antes da decisão final."}</DialogDescription></DialogHeader>{target.experiment && <div className="space-y-4"><div className="grid grid-cols-2 gap-3"><MetricTile label="Baseline" value={metricValue(target.experiment.baselineValue, target.experiment.metricUnit)} detail="Antes da mudança" /><MetricTile label="Meta" value={metricValue(target.experiment.targetValue, target.experiment.metricUnit)} detail={target.experiment.metricName} /></div><div className="grid gap-4 sm:grid-cols-2"><ReviewField label={`Valor (${target.experiment.metricUnit})`}><Input type="number" step="any" value={value} onChange={(event) => setValue(event.target.value)} className="mt-2" /></ReviewField><ReviewField label="Data da medição"><Input type="date" value={measuredAt} onChange={(event) => setMeasuredAt(event.target.value)} className="mt-2" /></ReviewField></div><ReviewField label="Fonte do dado"><Input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Planilha, ERP, observação..." className="mt-2" /></ReviewField><ReviewField label="Observações"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-2 min-h-24 resize-y" /></ReviewField>{error && <p role="alert" className="text-sm text-[#A33A33]">{error}</p>}</div>}<DialogFooter><Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button><Button onClick={save} disabled={saving || value === "" || source.trim().length < 2} className="bg-[#1C1C1A]">{saving ? <Loader2 className="animate-spin" /> : <Save />}Salvar medição</Button></DialogFooter></DialogContent></Dialog>;
}

function EvaluationDialog({ target, onClose, onSaved }: { target: { suggestion: Suggestion; mode: "REVIEW" | "REJECT" }; onClose: () => void; onSaved: (status: "APPROVED" | "REJECTED" | "IN_TEST", version?: number) => Promise<void> }) {
  const latest = target.suggestion.experiment?.readings[0]?.value;
  const [decision, setDecision] = useState<"APPROVE" | "REJECT" | "EXTEND">(target.mode === "REJECT" ? "REJECT" : "APPROVE"); const [resultValue, setResultValue] = useState(latest === undefined ? "" : String(latest)); const [resultNotes, setResultNotes] = useState(""); const [reason, setReason] = useState(""); const [endsAt, setEndsAt] = useState(addDaysInput(14)); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  async function save() { setSaving(true); setError(""); try { const response = await fetch(`/api/suggestions/${target.suggestion.id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(decision === "EXTEND" ? { action: "EXTEND", endsAt } : { action: decision, decisionReason: reason, resultValue: resultValue === "" ? undefined : Number(resultValue), resultNotes }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Não foi possível concluir a avaliação."); await onSaved(result.status, result.version); } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : "Não foi possível concluir a avaliação."); } finally { setSaving(false); } }
  const experiment = target.suggestion.experiment;
  const requiresResult = Boolean(experiment && decision !== "EXTEND");
  const valid = decision === "EXTEND" ? Boolean(experiment && Date.parse(endsAt) > Date.parse(experiment.endsAt)) : reason.trim().length >= 4 && (!requiresResult || resultValue !== "");
  return <Dialog open onOpenChange={(open) => !open && !saving && onClose()}><DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle className="font-serif text-2xl">{target.mode === "REJECT" && !experiment ? "Arquivar sugestão" : "Avaliar resultado do teste"}</DialogTitle><DialogDescription>{experiment ? "Compare os dados com o baseline e registre a decisão humana." : "A justificativa mantém a ideia recuperável no backlog."}</DialogDescription></DialogHeader><div className="space-y-5">{experiment && <><div className="grid grid-cols-3 gap-3"><MetricTile label="Antes" value={metricValue(experiment.baselineValue, experiment.metricUnit)} detail="Baseline" /><MetricTile label="Último dado" value={metricValue(experiment.readings[0]?.value, experiment.metricUnit)} detail={experiment.readings[0] ? formatDate(experiment.readings[0].measuredAt) : "Não medido"} /><MetricTile label="Meta" value={metricValue(experiment.targetValue, experiment.metricUnit)} detail={experiment.metricName} /></div><ReviewField label="Decisão"><Select value={decision} onValueChange={(value: "APPROVE" | "REJECT" | "EXTEND") => setDecision(value)}><SelectTrigger className="mt-2 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="APPROVE">Aprovar e publicar nova versão</SelectItem><SelectItem value="REJECT">Rejeitar e manter no backlog</SelectItem><SelectItem value="EXTEND">Prorrogar o teste</SelectItem></SelectContent></Select></ReviewField></>}{decision === "EXTEND" ? <ReviewField label="Nova data de avaliação"><Input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="mt-2" /></ReviewField> : <><ReviewField label={experiment ? `Resultado final (${experiment.metricUnit})` : "Resultado observado (opcional)"}><Input type="number" step="any" value={resultValue} onChange={(event) => setResultValue(event.target.value)} className="mt-2" /></ReviewField><ReviewField label={decision === "APPROVE" ? "Por que os dados sustentam a aprovação?" : "Por que a mudança foi rejeitada?"}><Textarea value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 min-h-28 resize-y" /></ReviewField><ReviewField label="Análise e observações"><Textarea value={resultNotes} onChange={(event) => setResultNotes(event.target.value)} className="mt-2 min-h-24 resize-y" /></ReviewField></>}{error && <p role="alert" className="text-sm text-[#A33A33]">{error}</p>}</div><DialogFooter><Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button><Button onClick={save} disabled={!valid || saving} className={decision === "REJECT" ? "bg-[#A33A33] hover:bg-[#A33A33]" : "bg-[#1C1C1A]"}>{saving ? <Loader2 className="animate-spin" /> : decision === "APPROVE" ? <Check /> : decision === "EXTEND" ? <CalendarDays /> : <Archive />}{decision === "APPROVE" ? "Aprovar mudança" : decision === "EXTEND" ? "Prorrogar teste" : "Rejeitar e arquivar"}</Button></DialogFooter></DialogContent></Dialog>;
}

function ReviewDueAlert({ suggestions, open, onClose, onReview }: { suggestions: Suggestion[]; open: boolean; onClose: () => void; onReview: () => void }) {
  return <Dialog open={open && suggestions.length > 0} onOpenChange={(nextOpen) => !nextOpen && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><div className="mb-2 grid size-11 place-items-center rounded-2xl bg-[#F7EDEC] text-[#1B3BD6]"><BellRing /></div><DialogTitle className="font-serif text-2xl">O teste terminou. Os dados precisam de uma decisão.</DialogTitle><DialogDescription>{suggestions.length} mudança(s) chegaram à data de avaliação. O processo oficial continua protegido até o dono aprovar ou rejeitar.</DialogDescription></DialogHeader><div className="space-y-2">{suggestions.slice(0, 3).map((item) => <div key={item.id} className="rounded-xl bg-[#F0EFEA] p-4"><p className="line-clamp-2 text-sm font-semibold text-[#1C1C1A]">{item.proposedText}</p><p className="mt-1 text-xs text-[#57574F]">Responsável: {item.experiment?.responsibleName} · venceu em {formatDate(item.experiment?.endsAt)}</p></div>)}</div><DialogFooter><Button variant="ghost" onClick={onClose}>Lembrar depois</Button><Button onClick={onReview} className="bg-[#1B3BD6] hover:bg-[#1531AE]"><ClipboardCheck />Analisar dados agora</Button></DialogFooter></DialogContent></Dialog>;
}

function InsightCapture({ insights, processes, onSaved }: { insights: InsightRow[]; processes: ProcessRow[]; onSaved: (message: string, suggestionId?: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [audio, setAudio] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [decisionTarget, setDecisionTarget] = useState<{ insight: InsightRow; action: "PILOT" | "REJECT" | "MORE_INFO" } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  useEffect(() => {
    if (!recording) return;
    const interval = window.setInterval(() => setSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(interval);
  }, [recording]);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") { recorder.onstop = null; recorder.stop(); }
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setRecording(false);
      return;
    }
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => event.data.size && chunksRef.current.push(event.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], `insight-${Date.now()}.webm`, { type: recorder.mimeType || "audio/webm" });
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudio(file);
        setAudioUrl(URL.createObjectURL(blob));
      };
      recorderRef.current = recorder;
      streamRef.current = stream;
      setAudio(null);
      setSeconds(0);
      recorder.start();
      setRecording(true);
    } catch { setError("Não foi possível acessar o microfone. Autorize o navegador ou registre o insight por texto."); }
  }

  function removeAudio() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudio(null);
    setAudioUrl("");
    setSeconds(0);
  }

  async function submit() {
    setSaving(true); setError("");
    try {
      const request = audio ? (() => { const form = new FormData(); form.set("audio", audio); if (text.trim()) form.set("note", text.trim()); return { body: form }; })() : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) };
      const created = await fetch("/api/insights", { method: "POST", ...request });
      const item = await created.json(); if (!created.ok) throw new Error(item.error || "Não foi possível registrar.");
      const analyzed = await fetch(`/api/insights/${item.id}/analyze`, { method: "POST" });
      const result = await analyzed.json(); if (!analyzed.ok) throw new Error(result.error || "Insight registrado, mas a análise não terminou.");
      setText(""); removeAudio(); await onSaved("Insight transcrito, relacionado aos processos e analisado pela IA.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível registrar."); } finally { setSaving(false); }
  }

  async function retryAnalysis(id: string) {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/insights/${id}/analyze`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "A nova análise não foi concluída.");
      await onSaved("A análise foi refeita e voltou para sua decisão.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "A nova análise não foi concluída."); }
    finally { setSaving(false); }
  }

  const processName = (id: string | null) => processes.find((row) => row.id === id)?.title || "Processo ainda não confirmado";
  const orderedInsights = [...insights].sort((left, right) => Number(right.status === "AWAITING_DECISION") - Number(left.status === "AWAITING_DECISION") || Date.parse(right.createdAt) - Date.parse(left.createdAt));
  return <div className="space-y-7">
    <div><p className="text-sm text-[#57574F]">A empresa continua aprendendo</p><h1 className="font-serif text-4xl tracking-[-.035em]">O que mudou na operação?</h1><p className="mt-3 max-w-3xl leading-7 text-[#57574F]">Fale enquanto caminha, dirige ou lembra de uma exceção. A IA transcreve, identifica o processo provável e prepara uma análise completa — sem alterar nada antes da sua decisão.</p></div>
    <section className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <article className="h-fit rounded-sm bg-[#1C1C1A] p-6 text-white xl:sticky xl:top-24">
        <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-semibold text-[#8FA6FF]"><Mic className="size-4" />Insight rápido</div><Badge className="border-0 bg-white/10 text-white/70">voz ou texto</Badge></div>
        <button type="button" onClick={toggleRecording} disabled={saving} className={`mt-6 flex w-full items-center justify-center gap-3 rounded-2xl border px-5 py-5 font-semibold transition ${recording ? "border-[#E0BAB6] bg-[#1B3BD6] text-white" : "border-white/20 bg-white/[.08] text-white hover:bg-white/[.14]"}`}><span className={`grid size-11 place-items-center rounded-full ${recording ? "animate-pulse bg-[#FAFAF7] text-[#1B3BD6]" : "bg-[#1B3BD6] text-white"}`}>{recording ? <Pause className="size-5" /> : <Mic className="size-5" />}</span><span className="text-left"><span className="block">{recording ? "Parar gravação" : "Gravar áudio"}</span><span className="mt-0.5 block text-xs font-normal opacity-65">{recording ? formatTranscriptDuration(seconds) : "até 25 MB"}</span></span></button>
        {audioUrl && <div className="mt-4 rounded-xl border border-white/15 bg-white/[.06] p-3"><audio controls src={audioUrl} className="h-10 w-full" /><button type="button" onClick={removeAudio} className="mt-2 text-xs text-white/55 underline-offset-2 hover:text-white hover:underline">Descartar e gravar novamente</button></div>}
        <div className="my-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[.14em] text-white/35"><span className="h-px flex-1 bg-white/10" />contexto opcional<span className="h-px flex-1 bg-white/10" /></div>
        <Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Acrescente nomes, números ou detalhes importantes — ou escreva todo o insight aqui." className="min-h-36 resize-y border-white/15 bg-white/[.08] leading-6 text-white placeholder:text-white/35" />
        <div className="mt-3 flex items-center justify-between text-xs text-white/45"><span>{text.length}/8.000</span><span>nenhuma mudança automática</span></div>
        {error && <p role="alert" className="mt-3 text-sm text-[#E0BAB6]">{error}</p>}
        <Button onClick={submit} disabled={saving || recording || (!audio && text.trim().length < 5)} className="mt-5 w-full bg-[#1B3BD6] text-white hover:bg-[#1531AE]">{saving ? <Loader2 className="animate-spin" /> : <Sparkles />}{saving ? audio ? "Transcrevendo e analisando…" : "Analisando impacto…" : "Analisar este insight"}</Button>
      </article>
      <div className="space-y-4">{insights.length === 0 ? <div className="grid min-h-80 place-items-center rounded-sm border border-dashed bg-[#FAFAF7] text-center"><div><Lightbulb className="mx-auto size-8 text-[#9A5B00]" /><p className="mt-3 font-semibold">Nenhum insight ainda</p><p className="mt-1 max-w-sm text-sm leading-6 text-[#57574F]">Grave a primeira descoberta. O cartão de impacto aparecerá aqui.</p></div></div> : orderedInsights.slice(0, 20).map((item) => <InsightCard key={item.id} item={item} processes={processes} processName={processName(item.primaryProcessId)} onPilot={() => setDecisionTarget({ insight: item, action: "PILOT" })} onReject={() => setDecisionTarget({ insight: item, action: "REJECT" })} onMoreInfo={() => setDecisionTarget({ insight: item, action: "MORE_INFO" })} onRetry={() => retryAnalysis(item.id)} />)}</div>
    </section>
    {decisionTarget && <InsightDecisionDialog key={`${decisionTarget.insight.id}:${decisionTarget.action}`} target={decisionTarget} processes={processes} onClose={() => setDecisionTarget(null)} onSaved={async (message, suggestionId) => { setDecisionTarget(null); await onSaved(message, suggestionId); }} />}
  </div>;
}

function InsightCard({ item, processes, processName, onPilot, onReject, onMoreInfo, onRetry }: { item: InsightRow; processes: ProcessRow[]; processName: string; onPilot: () => void; onReject: () => void; onMoreInfo: () => void; onRetry: () => void }) {
  const analysis = item.analysis;
  const statusLabel = item.status === "AWAITING_DECISION" ? "Aguardando sua decisão" : item.status === "FORWARDED" ? "Aguardando configuração do teste" : item.status === "IN_TEST" ? "Em teste" : item.status === "APPROVED" ? "Aprovado" : item.status === "REVIEW_REQUIRED" ? "Precisa de mais contexto" : item.status === "FAILED" ? "Análise interrompida" : item.status === "REJECTED" ? "Rejeitado" : item.status.replaceAll("_", " ");
  const relatedNames = analysis?.relatedProcessIds?.map((id) => processes.find((process) => process.id === id)?.title).filter(Boolean) as string[] | undefined;
  return <article className="overflow-hidden rounded-sm border border-[#D7D6CF] bg-[#FAFAF7]">
    <div className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><Badge className={item.status === "AWAITING_DECISION" ? "border-0 bg-[#F8EEDD] text-[#9A5B00]" : ["FORWARDED", "IN_TEST", "APPROVED"].includes(item.status) ? "border-0 bg-[#E3F2EA] text-[#147A4E]" : "border-0 bg-[#E5E4DE] text-[#57574F]"}>{statusLabel}</Badge>{analysis && <Badge variant="outline">{analysis.routeStatus === "MATCHED" ? processName : analysis.routeStatus === "AMBIGUOUS" ? "Vínculo ambíguo" : "Possível novo processo"}</Badge>}</div>{item.confidence !== null && <span className="text-xs font-semibold text-[#57574F]">{item.confidence}% confiança</span>}</div>
      <h2 className="mt-4 font-serif text-2xl leading-tight text-[#1C1C1A]">{item.title}</h2>
      <p className="mt-3 text-sm leading-6 text-[#57574F]">{analysis?.summary || item.transcript}</p>
      {item.aiRun && <p className="mt-2 text-[11px] text-[#57574F]">Análise: {item.aiRun.provenance === "OPENAI" ? "OpenAI" : "motor local"} · {item.aiRun.model} · prompt P-05 v{item.aiRun.promptVersion}</p>}
      {item.sourceObjectKey && <div className="mt-4 rounded-xl bg-[#F0EFEA] p-3"><p className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#57574F]"><FileAudio className="size-4" />Áudio original preservado</p><audio controls preload="none" src={`/api/insights/${item.id}/audio`} className="h-10 w-full" /></div>}
      {analysis && <>
        <div className="mt-5 grid gap-3 md:grid-cols-2"><div className="rounded-xl bg-[#F0EFEA] p-4"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#57574F]">Como funciona hoje</p><p className="mt-2 text-sm leading-6 text-[#1C1C1A]">{analysis.currentVsProposed.current}</p></div><div className="rounded-xl bg-[#E3F2EA] p-4"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#1B3BD6]">Mudança proposta</p><p className="mt-2 text-sm leading-6 text-[#147A4E]">{analysis.currentVsProposed.proposed}</p></div></div>
        {relatedNames?.length ? <p className="mt-3 text-xs text-[#57574F]"><strong>Processos relacionados:</strong> {relatedNames.join(", ")}</p> : null}
        <Accordion type="single" collapsible className="mt-4 rounded-xl border px-4"><AccordionItem value="impact" className="border-0"><AccordionTrigger className="hover:no-underline"><span className="flex items-center gap-2 text-sm"><BrainCircuit className="size-4 text-[#1B3BD6]" />Ver análise de impacto completa</span></AccordionTrigger><AccordionContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2"><SwotBox title="Forças" values={analysis.swot.strengths} tone="green" /><SwotBox title="Fraquezas" values={analysis.swot.weaknesses} tone="amber" /><SwotBox title="Oportunidades" values={analysis.swot.opportunities} tone="blue" /><SwotBox title="Ameaças" values={analysis.swot.threats} tone="red" /></div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><InsightList title="Tempo" values={analysis.impactDimensions?.time ?? []} /><InsightList title="Custo" values={analysis.impactDimensions?.cost ?? []} /><InsightList title="Qualidade" values={analysis.impactDimensions?.quality ?? []} /><InsightList title="Risco" values={analysis.impactDimensions?.risk ?? []} /><InsightList title="Treinamento" values={analysis.impactDimensions?.training ?? []} /></div>
          <div className="grid gap-4 lg:grid-cols-3"><InsightList title="O que pode melhorar" values={analysis.expectedImprovements} /><InsightList title="O que pode piorar" values={analysis.possibleWorsening} /><InsightList title="Riscos e trade-offs" values={analysis.risksAndTradeoffs} /></div>
          <div className="grid gap-4 md:grid-cols-3"><InsightList title="Dependências afetadas" values={analysis.affectedDependencies ?? []} /><InsightList title="Novas dependências" values={analysis.newDependencies ?? []} /><InsightList title="Possíveis exceções" values={analysis.possibleExceptions ?? []} /></div>
          {analysis.evidence?.length ? <div><p className="text-xs font-bold uppercase tracking-[.1em] text-[#57574F]">Evidências do insight</p><div className="mt-2 space-y-2">{analysis.evidence.map((evidence, index) => <blockquote key={`${evidence.quote}:${index}`} className="rounded-xl border-l-4 border-[#9A5B00] bg-[#F8EEDD] p-3 text-sm text-[#1C1C1A]"><Quote className="mb-1 size-4 text-[#9A5B00]" />“{evidence.quote}”<footer className="mt-1 text-xs text-[#57574F]">{evidence.relevance}</footer></blockquote>)}</div></div> : null}
          <div className="grid gap-4 md:grid-cols-2"><InsightList title="Premissas da análise" values={analysis.assumptions} /><InsightList title="Perguntas em aberto" values={analysis.openQuestions} /></div>
          <div className="rounded-xl bg-[#1C1C1A] p-4 text-white"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#8FA6FF]">Recomendação da IA: {analysis.recommendation}</p><p className="mt-2 text-sm leading-6 text-white/70">{analysis.rationale}</p></div>
        </AccordionContent></AccordionItem></Accordion>
      </>}
      {item.status === "REJECTED" && item.decisionReason && <p className="mt-4 rounded-xl bg-[#F7EDEC] p-4 text-sm leading-6 text-[#A33A33]"><strong>Decisão do dono:</strong> {item.decisionReason}</p>}
      {item.status === "AWAITING_DECISION" && analysis && <div className="mt-5 grid gap-2 border-t pt-5 sm:grid-cols-3"><Button onClick={onPilot} className="bg-[#1B3BD6] hover:bg-[#1531AE]"><Play />Aprovar para teste</Button><Button onClick={onMoreInfo} variant="outline"><MessageSquareText />Acrescentar contexto</Button><Button onClick={onReject} variant="outline" className="border-[#E0BAB6] text-[#A33A33] hover:bg-[#F7EDEC]"><Archive />Rejeitar insight</Button></div>}
      {["FAILED", "REVIEW_REQUIRED"].includes(item.status) && <div className="mt-5 border-t pt-5"><Button onClick={onRetry} variant="outline"><RefreshCw />Tentar nova análise</Button></div>}
    </div>
  </article>;
}

function SwotBox({ title, values, tone }: { title: string; values: string[]; tone: "green" | "amber" | "blue" | "red" }) {
  const color = tone === "green" ? "bg-[#E3F2EA] text-[#147A4E]" : tone === "amber" ? "bg-[#F8EEDD] text-[#9A5B00]" : tone === "blue" ? "bg-[#E7EAFB] text-[#1B3BD6]" : "bg-[#F7EDEC] text-[#A33A33]";
  return <div className={`rounded-xl p-4 ${color}`}><p className="text-xs font-bold uppercase tracking-[.1em]">{title}</p><ul className="mt-2 space-y-1.5 text-xs leading-5">{values.length ? values.map((value) => <li key={value}>• {value}</li>) : <li>• Nenhum item identificado</li>}</ul></div>;
}

function InsightList({ title, values }: { title: string; values: string[] }) {
  return <div><p className="text-xs font-bold uppercase tracking-[.1em] text-[#57574F]">{title}</p><ul className="mt-2 space-y-2 text-sm leading-5 text-[#1C1C1A]">{values.length ? values.map((value) => <li key={value} className="flex gap-2"><span className="text-[#1B3BD6]">•</span><span>{value}</span></li>) : <li className="text-[#57574F]">Nenhum item identificado.</li>}</ul></div>;
}

function InsightDecisionDialog({ target, processes, onClose, onSaved }: { target: { insight: InsightRow; action: "PILOT" | "REJECT" | "MORE_INFO" }; processes: ProcessRow[]; onClose: () => void; onSaved: (message: string, suggestionId?: string) => Promise<void> }) {
  const safeMatch = target.insight.analysis?.routeStatus === "MATCHED";
  const suggestedProcessId = safeMatch ? target.insight.analysis?.primaryProcessId || target.insight.primaryProcessId || "" : "";
  const initialProcess = processes.find((row) => row.id === suggestedProcessId);
  const initialSteps = initialProcess ? readProcess(initialProcess).steps : [];
  const suggestedStep = target.insight.analysis?.affectedSteps.find((key) => initialSteps.some((step) => step.key === key));
  const [processId, setProcessId] = useState(initialProcess?.id || "");
  const [stepKey, setStepKey] = useState(suggestedStep || "");
  const [proposedText, setProposedText] = useState(target.insight.analysis?.currentVsProposed.proposed || "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedProcess = processes.find((row) => row.id === processId);
  const steps = selectedProcess ? readProcess(selectedProcess).steps : [];
  function changeProcess(nextId: string) { setProcessId(nextId); setStepKey(""); }
  async function save() {
    setSaving(true); setError("");
    try {
      const payload = target.action === "PILOT" ? { action: "PILOT", processId, stepKey, proposedText, reason } : target.action === "MORE_INFO" ? { action: "NEED_MORE_INFO", reason } : { action: "REJECT", reason };
      const response = await fetch(`/api/insights/${target.insight.id}/decision`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Não foi possível registrar a decisão.");
      if (target.action === "MORE_INFO") {
        const analyzed = await fetch(`/api/insights/${target.insight.id}/analyze`, { method: "POST" });
        const analysisResult = await analyzed.json(); if (!analyzed.ok) throw new Error(analysisResult.error || "O contexto foi preservado, mas a nova análise não terminou.");
      }
      await onSaved(target.action === "PILOT" ? "Insight aprovado. Configure agora a métrica e o prazo do teste." : target.action === "MORE_INFO" ? "Contexto acrescentado e análise refeita para sua decisão." : "Insight rejeitado e preservado em Decisões › Rejeitadas.", result.suggestionId);
    } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : "Não foi possível registrar a decisão."); } finally { setSaving(false); }
  }
  const valid = target.action === "PILOT" ? Boolean(processId && stepKey && proposedText.trim().length >= 10) : reason.trim().length >= (target.action === "MORE_INFO" ? 5 : 4);
  const title = target.action === "PILOT" ? "Confirmar vínculo antes do teste" : target.action === "MORE_INFO" ? "Acrescentar contexto ao insight" : "Rejeitar este insight";
  const description = target.action === "PILOT" ? "A IA sugere o vínculo, mas o dono confirma o processo, a etapa e o texto experimental. Em seguida você definirá métrica, baseline, meta e prazo." : target.action === "MORE_INFO" ? "Explique o que faltou, corrija uma premissa ou inclua uma exceção. A IA refará o cartão sem alterar o processo." : "A justificativa ficará preservada no backlog de decisões rejeitadas.";
  return <Dialog open onOpenChange={(open) => !open && !saving && onClose()}><DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle className="font-serif text-2xl">{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader><div className="space-y-5"><div className="rounded-xl bg-[#F0EFEA] p-4 text-sm leading-6 text-[#1C1C1A]"><strong>{target.insight.title}</strong><p className="mt-1">{target.insight.analysis?.summary}</p></div>{target.action === "PILOT" ? <div className="grid gap-4 sm:grid-cols-2">{!safeMatch && <p className="sm:col-span-2 rounded-xl border border-[#E0BAB6] bg-[#F7EDEC] p-4 text-sm text-[#A33A33]">A IA não encontrou um vínculo seguro. Escolha explicitamente o processo e a etapa; nenhuma opção foi pré-selecionada.</p>}<ReviewField label="Processo afetado"><Select value={processId} onValueChange={changeProcess}><SelectTrigger className="mt-2 w-full"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{processes.map((process) => <SelectItem key={process.id} value={process.id}>{process.title}</SelectItem>)}</SelectContent></Select></ReviewField><ReviewField label="Etapa afetada"><Select value={stepKey} onValueChange={setStepKey} disabled={!processId}><SelectTrigger className="mt-2 w-full"><SelectValue placeholder={processId ? "Selecione" : "Escolha o processo primeiro"} /></SelectTrigger><SelectContent>{steps.map((step) => <SelectItem key={step.key} value={step.key}>{step.title}</SelectItem>)}</SelectContent></Select></ReviewField><div className="sm:col-span-2"><ReviewField label="Texto experimental da etapa" hint="Revise com cuidado. Ele só poderá virar versão oficial depois do teste e de uma nova aprovação humana."><Textarea value={proposedText} onChange={(event) => setProposedText(event.target.value)} className="mt-2 min-h-40 resize-y" /></ReviewField></div><div className="sm:col-span-2"><ReviewField label="Observação da decisão (opcional)"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 min-h-24 resize-y" /></ReviewField></div></div> : <ReviewField label={target.action === "MORE_INFO" ? "Qual contexto a IA precisa considerar?" : "Por que este insight não deve seguir para teste?"}><Textarea value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 min-h-32 resize-y" /></ReviewField>}{error && <p role="alert" className="text-sm text-[#A33A33]">{error}</p>}</div><DialogFooter><Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button><Button onClick={save} disabled={!valid || saving} className={target.action === "PILOT" ? "bg-[#1B3BD6] hover:bg-[#1531AE]" : target.action === "MORE_INFO" ? "bg-[#1C1C1A]" : "bg-[#A33A33] hover:bg-[#A33A33]"}>{saving ? <Loader2 className="animate-spin" /> : target.action === "PILOT" ? <Play /> : target.action === "MORE_INFO" ? <Sparkles /> : <Archive />}{target.action === "PILOT" ? "Continuar para configurar teste" : target.action === "MORE_INFO" ? "Salvar e refazer análise" : "Rejeitar e arquivar"}</Button></DialogFooter></DialogContent></Dialog>;
}
