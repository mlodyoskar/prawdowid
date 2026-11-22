import {
  ESCALATION_MESSAGE,
  type CaseEscalation,
  type CheckResponse,
  type ClaimResult,
  type ErrorCode,
  type Evidence,
  type Verdict,
} from '@prawdowid/contracts';

import { WHATSAPP_TEXT_LIMIT } from './graph.ts';

/** Werdykt zawsze jako znak + słowo (jak w WWW): sam kolor/emoji nie wystarcza. */
const VERDICT_LABEL: Record<Verdict, string> = {
  potwierdzone: '✅ POTWIERDZONE',
  fałszywe: '❌ FAŁSZYWE',
  'wprowadzające w błąd': '⚠️ WPROWADZAJĄCE W BŁĄD',
  'brak wystarczających dowodów': '❔ BRAK WYSTARCZAJĄCYCH DOWODÓW',
  'nie podlega weryfikacji': '⊘ NIE PODLEGA WERYFIKACJI',
};

const ERROR_TITLE: Record<ErrorCode, string> = {
  llm_unavailable: 'Usługa jest chwilowo niedostępna.',
  missing_config: 'Usługa nie jest skonfigurowana.',
  timeout: 'Sprawdzanie trwało zbyt długo.',
  internal: 'Sprawdzanie zostało przerwane.',
  sources_unavailable: 'Źródła są chwilowo niedostępne.',
};

const NOT_A_VERDICT = 'To nie jest werdykt.';

/** Źródła-podstawy na twierdzenie w wiadomości. Więcej mieści się w limicie znaków rzadko. */
const MAX_SOURCES_PER_CLAIM = 3;

const dateFmt = new Intl.DateTimeFormat('pl-PL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Warsaw',
});

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : dateFmt.format(d);
}

function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function resultUrl(webOrigin: string, checkId: string): string {
  return `${webOrigin.replace(/\/+$/, '')}/?check=${encodeURIComponent(checkId)}`;
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

function evidenceBlock(e: Evidence, quote: string | undefined): string {
  const meta = [e.publisher, formatDate(e.publishedAt)].filter(Boolean).join(', ');
  const lines = [`Źródło: ${truncate(e.title, 160)}${meta ? ` (${meta})` : ''}`];
  if (e.rating) lines.push(`Ocena fact-checkera: ${e.rating}`);
  if (quote) lines.push(`„${truncate(quote, 300)}”`);
  if (isWebUrl(e.url)) lines.push(e.url);
  return lines.join('\n');
}

function claimBlock(
  claim: ClaimResult,
  byId: Map<string, Evidence>,
  index: number,
  total: number,
): string {
  const strength =
    claim.verdict === 'nie podlega weryfikacji' ? '' : ` · siła podstawy: ${claim.confidence}`;
  const lines = [
    `${total > 1 ? `${index + 1}/${total} ` : ''}${VERDICT_LABEL[claim.verdict]}${strength}`,
    `Twierdzenie: ${truncate(claim.claim, 300)}`,
    truncate(claim.explanation, 600),
  ];
  if (claim.discrepancy) {
    lines.push('Źródła podają rozbieżne informacje. Nie rozstrzygamy, które ma rację.');
  }
  const unknowns = claim.unknowns ?? [];
  if (unknowns.length > 0) lines.push(`Nie ustaliliśmy: ${truncate(unknowns.join('; '), 300)}`);

  const evidence = claim.evidenceIds.flatMap((id) => byId.get(id) ?? []);
  const useOf = (e: Evidence) => claim.evidenceUse?.find((u) => u.id === e.id);
  // Te same publikacje, na których WWW opiera werdykt, w tej samej kolejności. Materiały
  // kontekstowe i inne materiały na ten temat zostają w pełnym wyniku. Materiał kontekstowy
  // nie udaje źródła rozstrzygnięcia: bez podstawy mówimy wprost, że nic tego nie rozstrzyga.
  const basis = evidence.filter((e) => useOf(e)?.stance !== 'context');
  const shown = basis.slice(0, MAX_SOURCES_PER_CLAIM);
  for (const e of shown) lines.push('', evidenceBlock(e, useOf(e)?.quote));
  const rest = evidence.length - shown.length + (claim.relatedIds?.length ?? 0);
  if (shown.length === 0 && claim.verdict !== 'nie podlega weryfikacji') {
    lines.push('Żadne ze znalezionych źródeł tego nie rozstrzyga.');
  }
  if (rest > 0) lines.push(`Pozostałe materiały (${rest}) w pełnym wyniku.`);
  if (claim.verdict === 'brak wystarczających dowodów') {
    lines.push('Nie udostępniaj tej informacji dalej jako pewnej.');
  }
  return lines.join('\n');
}

/**
 * Odpowiedź WhatsApp z wyniku sprawdzenia. Treść merytoryczna (werdykt, twierdzenie,
 * dowody) jest ta sama co w WWW; tylko skrócona i z linkiem do pełnego wyniku na końcu.
 * Status inny niż `ok` nigdy nie wygląda jak werdykt. `escalation` (sprawa oznaczona do
 * weryfikacji) dodaje ten sam komunikat co w WWW; nigdy nie mówi o przekazaniu.
 */
export function formatReply(
  response: CheckResponse,
  webOrigin: string,
  escalation?: CaseEscalation,
): string {
  const footer = `Pełny wynik i wszystkie źródła:\n${resultUrl(webOrigin, response.checkId)}`;

  switch (response.status) {
    case 'needs_clarification':
      return `Doprecyzuj, co chcesz sprawdzić. ${NOT_A_VERDICT}\n\n${response.message}`;
    case 'out_of_scope':
      return `Tego nie sprawdzamy. ${NOT_A_VERDICT}\n\n${response.message}`;
    case 'error':
      return `Nie udało się sprawdzić. ${NOT_A_VERDICT}\n${ERROR_TITLE[response.code]}\n\n${response.message}\n\nSpróbuj ponownie za chwilę.`;
    case 'ok':
      break;
  }

  const byId = new Map(response.evidence.map((e) => [e.id, e]));
  const total = response.claims.length;
  const head =
    total === 0
      ? `Nie znaleźliśmy twierdzeń do sprawdzenia.\n${truncate(response.summary, 600)}`
      : null;

  const tail: string[] = [];
  if (response.unchecked && response.unchecked.length > 0) {
    tail.push(
      `Tego nie udało się sprawdzić (źródła niedostępne, ${NOT_A_VERDICT.toLowerCase()}): ${truncate(
        response.unchecked.map((u) => `„${u.claim}”`).join(', '),
        400,
      )}`,
    );
  }
  if (escalation) tail.push(ESCALATION_MESSAGE[escalation.reason]);
  if (response.warnings.length > 0) {
    tail.push(`Zwróć uwagę:\n${response.warnings.map((w) => `• ${truncate(w, 300)}`).join('\n')}`);
  }

  const sep = '\n\n';
  const parts: string[] = head ? [head] : [];
  const fixedLength = [...tail, footer].join(sep).length + sep.length * 2;
  let omitted = 0;
  for (const [i, claim] of response.claims.entries()) {
    const block = claimBlock(claim, byId, i, total);
    const next = [...parts, block].join(sep).length;
    if (next + fixedLength > WHATSAPP_TEXT_LIMIT - 80) {
      omitted = total - i;
      break;
    }
    parts.push(block);
  }
  if (omitted > 0) parts.push(`Kolejne twierdzenia (${omitted}) w pełnym wyniku.`);

  const text = [...parts, ...tail, footer].join(sep);
  // Ostatnia linia zabezpieczenia: ostrzeżenia też mogą być długie.
  return text.length <= WHATSAPP_TEXT_LIMIT
    ? text
    : `${text.slice(0, WHATSAPP_TEXT_LIMIT - footer.length - 4).trimEnd()}…${sep}${footer}`;
}
