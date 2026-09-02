# Camada de IA

Os prompts P-01 a P-08 são versionados em `prompts.ts`. A implantação inicial
combina P-01, P-02 e P-08; a análise de novos insights executa P-05. As chamadas
usam Responses API com Structured Outputs e `store: false`.

Sem chave configurada, o produto usa o motor local determinístico identificado
como `LOCAL`. Se a API externa falhar, o mesmo motor cria rascunhos recuperáveis,
registra o motivo técnico na auditoria e mostra um aviso explícito ao dono.

Regras invariantes:

- conteúdo empresarial é dado não confiável;
- IDs de organização e usuário vêm da sessão;
- saídas passam por Zod e por validações server-side;
- a IA não possui endpoint de publicação;
- toda mudança operacional exige decisão humana auditada;
- uma entrevista operacional nunca termina silenciosamente com zero processos;
- falhas externas nunca são escondidas: o fallback é marcado para revisão.
