import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  plugins: [{
    name: "cloudflare-workers-test",
    resolveId(source) { return source === "cloudflare:workers" ? "\0cloudflare:workers" : null; },
    load(id) { return id === "\0cloudflare:workers" ? "export const env = { AI_PROVIDER: 'local' };" : null; },
  }],
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await vite.ssrLoadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});

test("founder dependency score is deterministic and bounded", async () => {
  const { calculateFounderDependency } = await vite.ssrLoadModule("/lib/implementation/contracts.ts");
  const low = calculateFounderDependency({ founderApprovals: 0, founderOnlyKnowledge: 0, undocumentedExceptions: 0, manualHandoffs: 0, missingBackupOwners: 0 });
  const high = calculateFounderDependency({ founderApprovals: 20, founderOnlyKnowledge: 20, undocumentedExceptions: 20, manualHandoffs: 20, missingBackupOwners: 20 });
  assert.equal(low.score, 0);
  assert.equal(high.score, 100);
  assert.equal(high.version, "founder-dependency-v1");
});

test("local evidence engine always maps operational routines into process drafts", async () => {
  const { analyzeImplementationLocally } = await vite.ssrLoadModule("/lib/implementation/engine.ts");
  const analysis = analyzeImplementationLocally(`[00:00] Dono: O cliente novo chega pelo WhatsApp e eu preparo a proposta comercial.
[00:12] Dono: Depois que o contrato é aprovado, a equipe recebe o briefing e abre o projeto.
[00:25] Operadora: Eu produzo a primeira arte, envio para revisão e aguardo a aprovação do cliente.
[00:39] Dono: Se o cliente pedir alteração, eu decido o novo prazo e autorizo a entrega final.`, "Graphix");

  assert.ok(analysis.processes.length >= 2);
  assert.ok(analysis.processes.every((process) => process.steps.length >= 1));
  assert.ok(analysis.processes.every((process) => process.evidence.length >= 1));
  assert.ok(analysis.processes.some((process) => /vendas|clientes/i.test(process.title)));
  assert.ok(analysis.processes.some((process) => /projetos|entregáveis/i.test(process.title)));
});

test("turns Markdown interview excerpts into operational steps without altering evidence", async () => {
  const { normalizeOperationalProcess, parseTranscriptSpeechLine } = await vite.ssrLoadModule("/lib/implementation/operational-text.ts");
  const raw = "**[00:08:43] CB:** Ano passado quase perdemos uma venda porque a matrícula tinha uma penhora e ninguém tinha visto.";
  const parsed = parseTranscriptSpeechLine(raw);
  assert.equal(parsed.speaker, "CB");
  assert.doesNotMatch(parsed.text, /\*\*|\[00:08:43\]|CB:/);

  const evidence = { quote: raw, speaker: "CB" };
  const normalized = normalizeOperationalProcess({
    title: "Venda e escritura",
    steps: [{ key: "s1", title: `Etapa 1: ${raw}`, body: raw, ownerRole: "Executor", evidence: [evidence] }],
    evidence: [evidence],
  });
  assert.equal(normalized.steps[0].title, "Verificar pendências na matrícula do imóvel");
  assert.doesNotMatch(normalized.steps[0].body, /\*\*|\[00:08:43\]|CB:/);
  assert.match(normalized.steps[0].body, /^Valide com o responsável/);
  assert.equal(normalized.steps[0].evidence[0].quote, raw);
  assert.equal(normalized.evidence[0].quote, raw);
});

test("founder absence findings are process-specific and preserve literal evidence", async () => {
  const { strengthenFounderAbsenceFindings } = await vite.ssrLoadModule("/lib/implementation/founder-absence.ts");
  const evidence = { quote: "Eu aprovo cada orçamento antes de a equipe começar o serviço.", speaker: "Dono" };
  const analysis = {
    companyName: "Morada",
    companyContext: "Empresa com operação recorrente e decisões ainda concentradas no dono.",
    executiveSummary: "A entrevista indica rotinas repetíveis que precisam de responsáveis substitutos e critérios claros.",
    founderDependencySignals: { founderApprovals: 8, founderOnlyKnowledge: 5, undocumentedExceptions: 2, manualHandoffs: 3, missingBackupOwners: 7 },
    findings: [
      { title: "Achado operacional 1", detail: evidence.quote, severity: "HIGH", evidence: [evidence] },
    ],
    processes: [{
      title: "Aprovação de orçamentos", area: "Comercial", objective: "Aprovar propostas antes do início do serviço.", trigger: "Orçamento preparado.", ownerRole: "Dono / aprovador",
      inputs: [], steps: [{ key: "s1", title: "Aprovar orçamento", body: evidence.quote, ownerRole: "Dono / aprovador", evidence: [evidence] }],
      decisions: ["O dono decide se o orçamento pode seguir."], exceptions: [], outputs: ["Orçamento aprovado"], risks: [], dependencies: [], automationReadiness: 30, evidence: [evidence],
    }],
    priorities: [{ title: "Definir alçada", whyNow: "A aprovação depende do dono.", horizon: "7_DAYS", expectedOutcome: "Substituto e limite definidos." }],
    roadmap: [{ period: "AGORA", actions: ["Definir substituto"] }], automationOpportunities: [], openQuestions: [],
  };
  const strengthened = strengthenFounderAbsenceFindings(analysis);
  assert.equal(strengthened.founderAbsenceVersion, "founder-absence-v2");
  assert.match(strengthened.findings[0].title, /Aprovações de Aprovação de orçamentos/);
  assert.match(strengthened.findings[0].detail, /substituto|alçada/i);
  assert.equal(strengthened.findings[0].evidence[0].quote, evidence.quote);
});

test("normalizes SRT timestamps and detects interview speakers", async () => {
  const { parseTranscriptText } = await vite.ssrLoadModule("/lib/transcripts/parser.ts");
  const parsed = parseTranscriptText(`1
00:00:01,250 --> 00:00:04,700
Speaker 1: Quando chega um cliente, eu aprovo o cadastro.

2
00:00:05,000 --> 00:00:09,900
Entrevistador: Quem consegue fazer isso quando você viaja?`, "entrevista.srt");

  assert.equal(parsed.format, "SRT");
  assert.equal(parsed.cueCount, 2);
  assert.equal(parsed.durationSeconds, 10);
  assert.deepEqual(parsed.speakers, ["Speaker 1", "Entrevistador"]);
  assert.match(parsed.normalizedText, /\[00:01\] Speaker 1:/);
  assert.match(parsed.normalizedText, /\[00:05\] Entrevistador:/);
});

test("rejects unsupported or malformed transcript files", async () => {
  const { parseTranscriptText } = await vite.ssrLoadModule("/lib/transcripts/parser.ts");
  assert.throws(() => parseTranscriptText("conteúdo", "entrevista.pdf"), /TXT, MD, SRT ou VTT/);
  assert.throws(() => parseTranscriptText("sem timestamps", "entrevista.vtt"), /legendas válidas/);
});

test("does not mistake one-off Markdown labels for interview speakers", async () => {
  const { parseTranscriptText } = await vite.ssrLoadModule("/lib/transcripts/parser.ts");
  const parsed = parseTranscriptText("Last login: today\nfatal: not a repository\nfatal: retry failed\nremote: receiving\nremote: resolving\nDono: Eu aprovo compras.\nDono: Depois confiro o pagamento.", "notas.md");
  assert.deepEqual(parsed.speakers, ["Dono"]);
});
