type ProcessStep = {
  key?: string;
  title?: string;
  body?: string;
  ownerRole?: string;
  evidence?: unknown;
};

type OperationalProcess = {
  title?: string;
  objective?: string;
  trigger?: string;
  ownerRole?: string;
  inputs?: string[];
  steps?: ProcessStep[];
  decisions?: string[];
  exceptions?: string[];
  outputs?: string[];
  risks?: string[];
  dependencies?: string[];
  evidence?: unknown;
};

const speakerPrefix = /^(?:(?:\[\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?\]|\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\s*)?((?:Speaker|Falante|Entrevistador(?:a)?|Dono|Dona|Consultor(?:a)?|Operador(?:a)?|Participante)\s*\d*|[A-ZÁÉÍÓÚÇ]{2,5})\s*:\s*/i;

function compact(value: string, max = 700) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  const clipped = normalized.slice(0, max - 1);
  const boundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, boundary > max * 0.65 ? boundary : clipped.length).trim()}…`;
}

export function cleanTranscriptMarkup(value: string) {
  let cleaned = value.trim()
    .replace(/^\s*(?:#{1,6}|>|[-*+]\s+)\s*/g, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^Etapa\s+\d+\s*:\s*/i, "")
    .trim();
  cleaned = cleaned.replace(speakerPrefix, "");
  cleaned = cleaned.replace(/^\[\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?\]\s*/, "");
  return compact(cleaned.replace(/^[:\-–—]\s*/, ""));
}

export function parseTranscriptSpeechLine(value: string) {
  const plain = value.trim().replace(/^\s*(?:#{1,6}|>|[-*+]\s+)\s*/g, "").replace(/\*\*|__/g, "").trim();
  const match = plain.match(speakerPrefix);
  if (!match) return { speaker: "Entrevista", text: cleanTranscriptMarkup(value) };
  return { speaker: compact(match[1], 80), text: compact(plain.slice(match[0].length), 900) };
}

export function hasTranscriptArtifacts(value: string) {
  return /\*\*|__|^\s*Etapa\s+\d+\s*:|\[\d{1,2}:\d{2}(?::\d{2})?|^(?:CB|RM|MD|Speaker\s*\d*|Dono|Operador(?:a)?)\s*:/i.test(value);
}

function actionTitle(text: string, processTitle: string) {
  const rules: Array<[RegExp, string]> = [
    [/matr[ií]cula.*(?:penhora|gravame)|(?:penhora|gravame).*matr[ií]cula/i, "Verificar pendências na matrícula do imóvel"],
    [/(?:receita federal|an[aá]lise do banco|pend[eê]ncia cadastral).*(?:comprador|cliente)|(?:comprador|cliente).*(?:receita federal|an[aá]lise do banco|pend[eê]ncia)/i, "Verificar pendências cadastrais do comprador"],
    [/planilha.*processos em andamento|processos em andamento.*planilha/i, "Atualizar planilha de processos em andamento"],
    [/venda.*[àa] vista|[àa] vista.*contrato/i, "Formalizar venda à vista"],
    [/agend(?:ar|amento).*escritura|escritura.*cart[oó]rio/i, "Agendar escritura no cartório"],
    [/contrato.*(?:compra|venda)|(?:compra|venda).*contrato/i, "Formalizar contrato de compra e venda"],
  ];
  for (const [pattern, title] of rules) if (pattern.test(text)) return title;

  const verbs: Array<[RegExp, string]> = [
    [/\b(?:confiro|confere|conferir|verifico|verifica|verificar|checo|checa|checar)\b/i, "Verificar"],
    [/\b(?:registro|registra|registrar|anoto|anota|anotar)\b/i, "Registrar"],
    [/\b(?:atualizo|atualiza|atualizar)\b/i, "Atualizar"],
    [/\b(?:envio|envia|enviar)\b/i, "Enviar"],
    [/\b(?:aprovo|aprova|aprovar)\b/i, "Aprovar"],
    [/\b(?:recebo|recebe|receber)\b/i, "Receber"],
    [/\b(?:solicito|solicita|solicitar)\b/i, "Solicitar"],
    [/\b(?:abro|abre|abrir)\b/i, "Abrir"],
    [/\b(?:agendo|agenda|agendar)\b/i, "Agendar"],
    [/\b(?:preparo|prepara|preparar)\b/i, "Preparar"],
    [/\b(?:analiso|analisa|analisar)\b/i, "Analisar"],
    [/\b(?:acompanho|acompanha|acompanhar)\b/i, "Acompanhar"],
    [/\b(?:valido|valida|validar)\b/i, "Validar"],
    [/\b(?:pago|paga|pagar)\b/i, "Pagar"],
    [/\b(?:entrego|entrega|entregar)\b/i, "Entregar"],
    [/\b(?:fecho|fecha|fechar)\b/i, "Fechar"],
  ];
  for (const [pattern, infinitive] of verbs) {
    const match = text.match(pattern);
    if (!match || match.index === undefined) continue;
    const remainder = text.slice(match.index + match[0].length).replace(/^[\s,:;\-–—]+/, "");
    return compact(`${infinitive}${remainder ? ` ${remainder}` : " a etapa"}`.replace(/\b(?:eu|a gente)\b\s*/gi, ""), 92).replace(/[.!?;:,]+$/, "");
  }
  return compact(`Validar ponto crítico de ${processTitle || "processo"}`, 92);
}

function isNarrative(text: string) {
  return /\b(ano passado|em janeiro|quase perdemos|perdemos|evaporou|descobrimos|aconteceu|problema|falha|atraso)\b/i.test(text);
}

export function operationalStepTitle(body: string, processTitle = "processo") {
  return actionTitle(cleanTranscriptMarkup(body), cleanTranscriptMarkup(processTitle));
}

function normalizeStepBody(value: string, processTitle: string) {
  const cleaned = cleanTranscriptMarkup(value);
  if (!cleaned) return `Detalhar com o responsável como executar ${processTitle.toLocaleLowerCase("pt-BR")}.`;
  if (isNarrative(cleaned)) return compact(`Valide com o responsável o procedimento necessário para tratar este ponto: ${cleaned}`, 700);
  return compact(cleaned, 700);
}

function normalizeList(values: string[] | undefined) {
  return values?.map((value) => cleanTranscriptMarkup(value)).filter(Boolean) ?? values;
}

export function normalizeOperationalProcess<T extends OperationalProcess>(process: T): T {
  const processTitle = cleanTranscriptMarkup(process.title || "Processo") || "Processo";
  const normalized = {
    ...process,
    title: processTitle,
    objective: process.objective ? cleanTranscriptMarkup(process.objective) : process.objective,
    trigger: process.trigger ? cleanTranscriptMarkup(process.trigger) : process.trigger,
    inputs: normalizeList(process.inputs),
    decisions: normalizeList(process.decisions),
    exceptions: normalizeList(process.exceptions),
    outputs: normalizeList(process.outputs),
    risks: normalizeList(process.risks),
    dependencies: normalizeList(process.dependencies),
    steps: process.steps?.map((step) => {
      const rawBody = step.body || step.title || "";
      const body = normalizeStepBody(rawBody, processTitle);
      const cleanTitle = cleanTranscriptMarkup(step.title || "");
      const titleIsRaw = hasTranscriptArtifacts(step.title || "") || cleanTitle.length > 100 || cleanTitle.toLocaleLowerCase("pt-BR") === cleanTranscriptMarkup(rawBody).toLocaleLowerCase("pt-BR") || isNarrative(cleanTitle);
      return { ...step, title: titleIsRaw || !cleanTitle ? operationalStepTitle(rawBody, processTitle) : compact(cleanTitle, 120), body, evidence: step.evidence };
    }),
    evidence: process.evidence,
  };
  return normalized as T;
}
