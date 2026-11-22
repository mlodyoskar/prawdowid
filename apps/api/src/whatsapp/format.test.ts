import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ESCALATION_MESSAGE,
  resultUrl,
  type CheckResponse,
  type ClaimResult,
  type ErrorCode,
  type Evidence,
} from '@prawdowid/contracts';

import { formatReply } from './format.ts';
import { WHATSAPP_TEXT_LIMIT } from './graph.ts';

const ORIGIN = 'https://prawdowid.example';
const meta = { checkId: 'abc', createdAt: 't', durationMs: 1 };
const VERDICT_MARKS = ['POTWIERDZONE', 'FAŁSZYWE', 'WPROWADZAJĄCE W BŁĄD', 'BRAK WYSTARCZAJĄCYCH'];

const evidence = (over: Partial<Evidence> = {}): Evidence => ({
  id: 'e1',
  kind: 'corpus',
  title: 'Komunikat MON',
  publisher: 'MON',
  url: 'https://www.gov.pl/web/obrona-narodowa/x',
  publishedAt: '2026-11-01T10:00:00Z',
  fetchedAt: null,
  excerpt: 'MON nie planuje przywrócenia poboru.',
  ...over,
});

const claim = (over: Partial<ClaimResult> = {}): ClaimResult => ({
  claim: 'Od grudnia wraca obowiązkowy pobór',
  verdict: 'fałszywe',
  confidence: 'wysoka',
  explanation: 'Ministerstwo zaprzecza.',
  evidenceIds: ['e1'],
  limitations: '',
  evidenceUse: [{ id: 'e1', stance: 'refutes', quote: 'MON nie planuje przywrócenia poboru.' }],
  ...over,
});

const ok = (over: Partial<Extract<CheckResponse, { status: 'ok' }>> = {}): CheckResponse => ({
  ...meta,
  status: 'ok',
  summary: 'Podsumowanie',
  claims: [claim()],
  evidence: [evidence()],
  warnings: [],
  ...over,
});

test('zaczyna się od werdyktu, ma cytat, źródło i kończy linkiem do pełnego wyniku', () => {
  const text = formatReply(ok(), ORIGIN);
  assert.ok(text.startsWith('❌ FAŁSZYWE · siła podstawy: wysoka'));
  assert.ok(text.includes('„MON nie planuje przywrócenia poboru.”'));
  assert.ok(text.includes('Komunikat MON (MON, 01.11.2026)'));
  assert.ok(text.includes('https://www.gov.pl/web/obrona-narodowa/x'));
  assert.ok(text.endsWith(`${ORIGIN}/w/abc`));
});

test('statusy techniczne: „To nie jest werdykt” i żadnej etykiety werdyktu', () => {
  const codes: ErrorCode[] = [
    'llm_unavailable',
    'missing_config',
    'timeout',
    'internal',
    'sources_unavailable',
  ];
  const responses: CheckResponse[] = [
    ...codes.map((code) => ({
      ...meta,
      status: 'error' as const,
      code,
      message: 'Błąd dostępu do API.',
    })),
    { ...meta, status: 'needs_clarification', message: 'Napisz, co dokładnie sprawdzić.' },
    { ...meta, status: 'out_of_scope', message: 'To opinia.' },
  ];
  for (const r of responses) {
    const text = formatReply(r, ORIGIN);
    assert.ok(text.includes('To nie jest werdykt.'), r.status);
    for (const mark of VERDICT_MARKS) assert.ok(!text.includes(mark), `${r.status}: ${mark}`);
  }
});

test('adres spoza http(s) nie jest wypisywany jako link', () => {
  const text = formatReply(ok({ evidence: [evidence({ url: 'javascript:alert(1)' })] }), ORIGIN);
  assert.ok(!text.includes('javascript:'));
});

test('brak dowodów: uczciwe wstrzymanie się i ostrzeżenie przed udostępnianiem', () => {
  const text = formatReply(
    ok({
      claims: [
        claim({
          verdict: 'brak wystarczających dowodów',
          evidenceIds: [],
          evidenceUse: [],
          unknowns: ['Treść uchwały'],
        }),
      ],
      evidence: [],
    }),
    ORIGIN,
  );
  assert.ok(text.startsWith('❔ BRAK WYSTARCZAJĄCYCH DOWODÓW'));
  assert.ok(text.includes('Nie ustaliliśmy: Treść uchwały'));
  assert.ok(text.includes('Nie udostępniaj tej informacji dalej jako pewnej.'));
});

test('ostrzeżenia (np. materiał archiwalny) i niesprawdzone twierdzenia są widoczne', () => {
  const text = formatReply(
    ok({
      warnings: ['Materiał archiwalny: „X” (2019-05-01). Może być nieaktualny.'],
      unchecked: [{ claim: 'Drugie twierdzenie', reason: 'awaria' }],
    }),
    ORIGIN,
  );
  assert.ok(text.includes('Materiał archiwalny'));
  assert.ok(text.includes('„Drugie twierdzenie”'));
});

test('długi wynik mieści się w limicie WhatsApp i nadal kończy się linkiem', () => {
  const long = 'Bardzo długie wyjaśnienie. '.repeat(200);
  const text = formatReply(
    ok({
      claims: Array.from({ length: 8 }, (_, i) =>
        claim({ claim: `Twierdzenie ${i} ${long}`, explanation: long }),
      ),
      warnings: Array.from({ length: 10 }, () => long),
    }),
    ORIGIN,
  );
  assert.ok(text.length <= WHATSAPP_TEXT_LIMIT, String(text.length));
  assert.ok(text.endsWith(`${ORIGIN}/w/abc`));
});

test('pokazuje każdą publikację-podstawę werdyktu jak WWW, kontekst zostawia w pełnym wyniku', () => {
  const text = formatReply(
    ok({
      claims: [
        claim({
          evidenceIds: ['ctx', 'e1', 'e2'],
          evidenceUse: [
            { id: 'ctx', stance: 'context', quote: 'Inna sprawa.' },
            { id: 'e1', stance: 'refutes', quote: 'MON nie planuje przywrócenia poboru.' },
            { id: 'e2', stance: 'refutes', quote: 'Pobór nie wraca.' },
          ],
        }),
      ],
      evidence: [
        evidence({ id: 'ctx', url: 'https://www.gov.pl/kontekst', title: 'Inna sprawa' }),
        evidence(),
        evidence({ id: 'e2', url: 'https://www.gov.pl/drugi', excerpt: 'Pobór nie wraca.' }),
      ],
    }),
    ORIGIN,
  );
  assert.ok(text.includes('https://www.gov.pl/web/obrona-narodowa/x'));
  assert.ok(text.includes('https://www.gov.pl/drugi'));
  assert.ok(!text.includes('https://www.gov.pl/kontekst'));
  assert.ok(text.includes('Pozostałe źródła (1) w pełnym wyniku.'));
});

test('bez podstawy werdyktu pokazuje pierwszy materiał', () => {
  const text = formatReply(
    ok({
      claims: [
        claim({
          verdict: 'brak wystarczających dowodów',
          evidenceUse: [
            { id: 'e1', stance: 'context', quote: 'MON nie planuje przywrócenia poboru.' },
          ],
        }),
      ],
    }),
    ORIGIN,
  );
  assert.ok(text.includes('https://www.gov.pl/web/obrona-narodowa/x'));
});

test('sprawa oznaczona do weryfikacji: ten sam komunikat co w WWW, bez „przekazano”', () => {
  const plain = formatReply(ok(), ORIGIN);
  assert.ok(!plain.includes('moderatora'));
  for (const reason of ['repeat_no_evidence', 'high_risk', 'injection'] as const) {
    const text = formatReply(ok(), ORIGIN, {
      caseId: 'k1',
      reason,
      state: 'review_recommended',
    });
    assert.ok(text.includes(ESCALATION_MESSAGE[reason]));
    assert.ok(!/przekaz/i.test(text), 'nie twierdzimy, że sprawę przekazano');
    assert.ok(text.trimEnd().endsWith(resultUrl(ORIGIN, 'abc')), 'link na końcu');
  }
});

test('fragmenty tej samej strony to jedno źródło, bez cytatu równego tytułowi', () => {
  const page = 'https://www.gov.pl/web/gis/kubek';
  const text = formatReply(
    ok({
      claims: [
        claim({
          verdict: 'potwierdzone',
          evidenceIds: ['e1', 'e2', 'e3'],
          unknowns: ['Skala wycofania.', 'Wyniki badań.'],
          evidenceUse: [
            { id: 'e1', stance: 'supports', quote: 'Komunikat MON' },
            { id: 'e2', stance: 'supports', quote: 'stwierdzono migrację formaldehydu' },
            { id: 'e3', stance: 'context', quote: 'inny komunikat' },
          ],
        }),
      ],
      evidence: [
        evidence({ id: 'e1', url: page }),
        evidence({ id: 'e2', url: page }),
        evidence({ id: 'e3', url: 'https://www.gov.pl/web/gis/inny', title: 'Inny' }),
      ],
    }),
    ORIGIN,
  );
  assert.equal(text.split('Źródło: Komunikat MON').length - 1, 1, 'strona raz');
  assert.equal(text.split(page).length - 1, 1, 'link raz');
  assert.ok(text.includes('„stwierdzono migrację formaldehydu”'));
  assert.ok(!text.includes('„Komunikat MON”'), 'cytat = tytuł pominięty');
  assert.ok(text.includes('Pozostałe źródła (1) w pełnym wyniku.'));
  assert.ok(text.includes('Nie ustaliliśmy: Skala wycofania; Wyniki badań'), 'bez „.;”');
});
