# Praxe

> **O jeito da casa, escrito e em dia.**

Aplicação full-stack que transforma a entrevista com o dono de um pequeno
negócio em um diagnóstico operacional, uma biblioteca de processos e um ciclo
contínuo de melhoria.

Este repositório é a versão pública, de escopo reduzido, do projeto construído
no hackathon Praxis (agosto de 2026). Contém o código funcional da aplicação.
A documentação de produto e os artefatos de operação ficam fora do escopo
público.

## Identidade visual

A interface segue o sistema de marca Praxe: Archivo em títulos, Public Sans na
interface, JetBrains Mono em dados, base osso e grafite, azul-caneta para ações
e verde, âmbar e vermelho reservados aos estados reais do produto.

## O fluxo funcional

1. O dono entra com ChatGPT e encontra uma conta vazia, sem dados fictícios.
2. Cola a transcrição, envia TXT/MD/SRT/VTT, envia um áudio ou grava a entrevista no navegador.
3. O sistema preserva a fonte, extrai evidências e produz:
   - resumo executivo;
   - Founder Dependency Score calculado por regra versionada;
   - riscos, prioridades e plano de 90 dias;
   - processos em rascunho com etapas, decisões, exceções e responsáveis.
4. O dono corrige o diagnóstico e os processos em rascunho, mantendo as evidências originais bloqueadas, e publica a versão 1.
5. Operadores sugerem melhorias; dono ou responsável testa, esclarece, rejeita
   ou aprova. A aprovação cria nova versão e mantém a anterior na auditoria.

## Camadas implementadas

- Sign in with ChatGPT e workspace isolado por organização;
- entrevista por texto, upload de transcrição, gravação ou upload de áudio;
- leitura segura de TXT, MD, SRT e VTT, com prévia editável, participantes,
  duração e timestamps preservados;
- armazenamento privado do arquivo original no R2 para rastreabilidade;
- transcrição ao vivo no navegador compatível;
- armazenamento privado de áudio no R2;
- análise com saída estruturada e validação Zod;
- motor local auditável quando não existe credencial externa;
- prompts P-01, P-02 e P-08 conectados à análise inicial;
- recuperação explícita quando a IA externa falha, sem entregar zero processos;
- nova tentativa para análises falhas, incompletas ou interrompidas;
- report interativo com evidências da entrevista;
- Founder Dependency Score determinístico;
- processos em rascunho e gate humano de publicação;
- revisão editável antes da aprovação, incluindo criação, exclusão e reordenação de etapas, com correções auditadas e sem publicação automática;
- biblioteca de processos, versões e trilha de auditoria;
- insights posteriores com análise SWOT e recomendação;
- sugestões por passo, piloto, esclarecimento, rejeição e aprovação;
- nova versão imutável quando uma sugestão é aprovada.

## Modos de análise

- `AI_PROVIDER=openai`: OpenAI Responses API, Structured Outputs, `store: false`
  e transcrição por `gpt-transcribe`.
- `AI_PROVIDER=local`: motor determinístico baseado em evidências, identificado
  claramente na interface. Funciona sem credenciais e não se apresenta como IA.

Nenhum processo é publicado automaticamente em qualquer modo.

## Stack

- React 19, Next.js 16, Vinext e TypeScript;
- Tailwind CSS e shadcn/ui;
- Cloudflare D1 com Drizzle ORM;
- Cloudflare R2 para fontes privadas;
- Sign in with ChatGPT;
- OpenAI Responses API e Audio Transcriptions, configuráveis por ambiente;
- Zod e JSON Schema estrito.

## Executar localmente

Requisitos: Node.js 22.13 ou superior.

```bash
git clone https://github.com/rogeriochinen/praxe.git
cd praxe
cp .env.example .env
npm ci
npm run dev
```

Com `AI_PROVIDER=local` (padrão do `.env.example`) a aplicação roda sem nenhuma
credencial. A autenticação completa e os bindings D1/R2 são fornecidos pelo
ambiente do ChatGPT Sites. Localmente é possível validar build, componentes e
contratos; em `localhost` o login usa um usuário de desenvolvimento.

Os scripts `install:ci` e `build` foram escritos para o runtime Linux do Sites
(`flock`, `/proc`, GNU `timeout`). No macOS, use `npm ci` diretamente e rode os
testes com `node --test tests/*.test.mjs`.

## Qualidade

```bash
npm run lint
node --test tests/*.test.mjs
```

Os testes verificam ausência de seed demo, saída estruturada, `store: false`,
criação de rascunhos, gate humano, versionamento e score determinístico.

## Deploy no ChatGPT Sites

`.openai/hosting.json` declara os bindings `DB` (D1) e `BUCKET` (R2). O campo
`project_id` é um placeholder: o control plane do Sites atribui o valor real ao
publicar.

## Licença

Ainda não definida. Sem licença explícita, o código fica disponível apenas para
leitura e avaliação; uso, cópia e redistribuição não estão autorizados.
