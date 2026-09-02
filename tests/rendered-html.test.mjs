import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("defines the product entry experience and production metadata", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(page, /Sua empresa, menos dependente de você/);
  assert.match(page, /Mapear minha operação/);
  assert.match(page, /chatGPTSignInPath/);
  assert.match(page, /PraxeLogo/);
  assert.match(layout, /Praxe — O jeito da casa, escrito e em dia/);
  assert.doesNotMatch(layout, /codex-preview/);
});

test("applies the Praxe design system without changing product routes", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const logo = await readFile(new URL("../components/praxe-logo.tsx", import.meta.url), "utf8");
  const product = await readFile(new URL("../components/product-app.tsx", import.meta.url), "utf8");
  assert.match(styles, /--px-caneta:\s*#1B3BD6/);
  assert.match(styles, /Public Sans/);
  assert.match(styles, /Archivo/);
  assert.match(styles, /JetBrains Mono/);
  assert.match(logo, />praxe</);
  assert.match(product, /\/api\/interviews/);
  assert.match(product, /\/api\/workspace/);
});

test("authenticated product starts from a real interview instead of seeded content", async () => {
  const product = await readFile(new URL("../components/product-app.tsx", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../lib/workspace.ts", import.meta.url), "utf8");
  assert.match(product, /Começar entrevista/);
  assert.match(product, /\/api\/interviews/);
  assert.match(product, /Aprovar e publicar versão 1/);
  assert.doesNotMatch(workspace, /seedWorkspace|demoProcesses|Empresa Aurora/);
  assert.doesNotMatch(product, /Fechamento de caixa|Onboarding de clientes|76% concluído/);
});

test("local development bypasses SIWC only for loopback hosts", async () => {
  const auth = await readFile(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8");
  assert.match(auth, /import\.meta\.env\.DEV/);
  assert.match(auth, /localhost\|127/);
  assert.match(auth, /localDevelopment:\s*true/);
  assert.match(auth, /localDevelopment:\s*false/);
});
