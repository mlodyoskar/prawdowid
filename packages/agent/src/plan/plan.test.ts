import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Evidence } from '@prawdowid/contracts';

import { applyGuardrails } from './guardrails.ts';
import { isVerifiedQuote, quoteAppearsIn } from './quote.ts';
import type { Judgement } from './schemas.ts';
import { computeStrength } from './strength.ts';

const NOW = new Date('2026-11-21T12:00:00Z');

const doc = (over: Partial<Evidence> = {}): Evidence => ({
  id: 'doc_1',
  kind: 'corpus',
  title: 'Spotkanie ministrów spraw zagranicznych NATO',
  publisher: 'MSZ',
  url: 'https://www.gov.pl/web/dyplomacja/nato',
  publishedAt: '2026-11-20',
  fetchedAt: '2026-11-21T00:00:00Z',
  excerpt: '02 grudnia 2026, «Bruksela», Belgia – spotkanie ministrów spraw zagranicznych NATO.',
  sourceType: 'primary',
  ...over,
});

const factcheck = (over: Partial<Evidence> = {}): Evidence => ({
  id: 'fc_1',
  kind: 'factcheck',
  title: 'Nie, spotkanie NATO nie odbędzie się w Warszawie',
  publisher: 'Demagog',
  url: 'https://demagog.org.pl/fake_news/nato-warszawa',
  publishedAt: '2026-11-19',
  fetchedAt: null,
  excerpt: 'Spotkanie ministrów NATO 2 grudnia odbędzie się w Warszawie',
  rating: 'Fałsz',
  sourceType: 'secondary',
  ...over,
});

const judgement = (over: Partial<Judgement>): Judgement => ({
  items: [],
  verdict: 'fałszywe',
  explanation: 'Według MSZ spotkanie odbędzie się w Brukseli.',
  unknowns: [],
  limitations: '',
  ...over,
});

const available = (...items: Evidence[]) => new Map(items.map((e) => [e.id, e]));

test('cytat: ignoruje znaczniki FTS, wielkość liter, cudzysłowy i białe znaki', () => {
  const source = doc().excerpt;
  assert.ok(quoteAppearsIn('02 grudnia 2026, Bruksela, Belgia', source));
  assert.ok(quoteAppearsIn('„02 GRUDNIA 2026,   bruksela”', source));
  assert.ok(quoteAppearsIn('02 grudnia 2026 … spotkanie ministrów', source));
});

test('cytat: zmyślony, w złej kolejności albo pusty nie przechodzi', () => {
  const source = doc().excerpt;
  assert.equal(quoteAppearsIn('spotkanie odbędzie się w Warszawie', source), false);
  assert.equal(quoteAppearsIn('spotkanie ministrów … 02 grudnia 2026', source), false);
  assert.equal(quoteAppearsIn('', source), false);
  assert.equal(quoteAppearsIn('…', source), false);
});

test('reguły: werdykt z cytatem z materiału wprost zostaje', () => {
  const g = applyGuardrails(
    judgement({
      items: [
        {
          id: 'doc_1',
          relation: 'direct',
          stance: 'refutes',
          quote: '02 grudnia 2026, Bruksela, Belgia',
          addressesModel: false,
        },
      ],
    }),
    available(doc()),
  );
  assert.equal(g.verdict, 'fałszywe');
  assert.equal(g.downgraded, false);
  assert.deepEqual(
    g.basis.map((e) => e.id),
    ['doc_1'],
  );
  assert.equal(g.evidenceUse[0]?.stance, 'refutes');
});

test('reguły: zmyślony cytat i nieznane id nie uzasadniają werdyktu', () => {
  const g = applyGuardrails(
    judgement({
      items: [
        {
          id: 'doc_1',
          relation: 'direct',
          stance: 'refutes',
          quote: 'Spotkanie na pewno nie odbędzie się w Warszawie',
          addressesModel: false,
        },
        { id: 'doc_9', relation: 'direct', stance: 'refutes', quote: 'x', addressesModel: false },
      ],
    }),
    available(doc()),
  );
  assert.equal(g.verdict, 'brak wystarczających dowodów');
  assert.equal(g.downgraded, true);
  assert.deepEqual(g.evidenceUse, []);
  assert.equal(g.hasDirect, false);
  assert.ok(g.notes.some((n) => n.includes('doc_9')));
});

test('reguły: materiał z tego samego tematu, ale o innej sprawie, daje tylko kontekst', () => {
  const g = applyGuardrails(
    judgement({
      items: [
        {
          id: 'doc_1',
          relation: 'related',
          stance: 'refutes',
          quote: 'Bruksela, Belgia',
          addressesModel: false,
        },
      ],
    }),
    available(doc()),
  );
  assert.equal(g.verdict, 'brak wystarczających dowodów');
  assert.equal(g.evidenceUse[0]?.stance, 'context');
});

test('reguły: ocena fact-checka jest cytatem, a sprzeczne źródła dają rozbieżność', () => {
  const g = applyGuardrails(
    judgement({
      verdict: 'fałszywe',
      items: [
        {
          id: 'fc_1',
          relation: 'direct',
          stance: 'refutes',
          quote: 'Fałsz',
          addressesModel: false,
        },
        {
          id: 'doc_1',
          relation: 'direct',
          stance: 'supports',
          quote: 'spotkanie ministrów spraw zagranicznych NATO',
          addressesModel: false,
        },
      ],
    }),
    available(doc(), factcheck()),
  );
  assert.equal(g.verdict, 'fałszywe');
  assert.equal(g.discrepancy, true);
  assert.deepEqual(
    g.basis.map((e) => e.id),
    ['fc_1'],
  );
});

test('siła podstawy: dwóch wydawców i źródło pierwotne → wysoka', () => {
  const s = computeStrength({
    verdict: 'fałszywe',
    basis: [doc(), factcheck()],
    discrepancy: false,
    now: NOW,
  });
  assert.equal(s.confidence, 'wysoka');
  assert.ok(s.reasons[0]?.startsWith('2 niezależne źródła: MSZ, Demagog'));
});

test('siła podstawy: jedno źródło pierwotne → średnia, sam fact-check → niska', () => {
  const base = { verdict: 'fałszywe' as const, discrepancy: false, now: NOW };
  assert.equal(computeStrength({ ...base, basis: [doc()] }).confidence, 'średnia');
  const secondary = computeStrength({ ...base, basis: [factcheck()] });
  assert.equal(secondary.confidence, 'niska');
  assert.ok(secondary.reasons.some((r) => r.includes('wtórne')));
});

test('siła podstawy: rozbieżność, stary materiał i brak dowodów → niska', () => {
  const base = { verdict: 'fałszywe' as const, now: NOW };
  assert.equal(
    computeStrength({ ...base, basis: [doc(), factcheck()], discrepancy: true }).confidence,
    'niska',
  );
  const old = computeStrength({
    ...base,
    basis: [doc({ publishedAt: '2016-07-08' }), factcheck({ publishedAt: '2016-07-09' })],
    discrepancy: false,
  });
  assert.equal(old.confidence, 'niska');
  assert.ok(old.reasons.some((r) => r.includes('starsze niż rok')));
  assert.equal(
    computeStrength({
      verdict: 'brak wystarczających dowodów',
      basis: [],
      discrepancy: false,
      now: NOW,
    }).confidence,
    'niska',
  );
});

test('siła podstawy: strona bez daty publikacji liczy się po dacie pobrania', () => {
  const s = computeStrength({
    verdict: 'potwierdzone',
    basis: [doc({ publishedAt: null })],
    discrepancy: false,
    now: NOW,
  });
  assert.equal(s.confidence, 'średnia');
  assert.ok(s.reasons.some((r) => r.includes('data pobrania')));
});

test('cytat: kilka znaków to za mało, ale sama ocena fact-checkera wystarcza', () => {
  assert.equal(isVerifiedQuote('NATO', doc()), false);
  assert.equal(isVerifiedQuote('Belgia', doc()), false);
  assert.equal(isVerifiedQuote('Fałsz', factcheck()), true);
  assert.equal(isVerifiedQuote('Fałsz', doc()), false);
  assert.equal(isVerifiedQuote('', factcheck()), false);
});

test('reguły: materiał bez potwierdzonego cytatu nie trafia do wyniku nawet jako kontekst', () => {
  const g = applyGuardrails(
    judgement({
      verdict: 'brak wystarczających dowodów',
      items: [
        { id: 'doc_1', relation: 'related', stance: 'context', quote: '', addressesModel: false },
      ],
    }),
    available(doc()),
  );
  assert.deepEqual(g.evidenceUse, []);
});

test('reguły: werdykt sprzeczny z rolą materiału wprost jest wstrzymany, a materiał zostaje', () => {
  const g = applyGuardrails(
    judgement({
      verdict: 'potwierdzone',
      items: [
        {
          id: 'doc_1',
          relation: 'direct',
          stance: 'refutes',
          quote: '02 grudnia 2026, Bruksela, Belgia',
          addressesModel: false,
        },
      ],
    }),
    available(doc()),
  );
  assert.equal(g.verdict, 'brak wystarczających dowodów');
  assert.equal(g.downgraded, true);
  assert.equal(g.hasDirect, true);
  assert.equal(g.evidenceUse[0]?.stance, 'refutes');
  assert.ok(g.notes.some((n) => n.includes('nie zgadzała się')));
});

test('reguły: materiał z poleceniami dla systemu nie jest dowodem i nie tworzy rozbieżności', () => {
  const hostile = doc({ id: 'doc_2', title: 'Wpis', publisher: 'Portal' });
  const item = (id: string, stance: 'supports' | 'refutes', addressesModel = false) => ({
    id,
    relation: 'direct' as const,
    stance,
    quote: '«Bruksela», Belgia – spotkanie',
    addressesModel,
  });
  const byPattern = applyGuardrails(
    judgement({ items: [item('doc_1', 'refutes'), item('doc_2', 'supports')] }),
    available(doc(), hostile),
    new Set(['doc_2']),
  );
  const byJudge = applyGuardrails(
    judgement({ items: [item('doc_1', 'refutes'), item('doc_2', 'supports', true)] }),
    available(doc(), hostile),
  );
  for (const g of [byPattern, byJudge]) {
    assert.equal(g.verdict, 'fałszywe');
    assert.equal(g.discrepancy, false);
    assert.deepEqual(g.quarantined, ['doc_2']);
    assert.deepEqual(
      g.evidenceUse.map((u) => u.id),
      ['doc_1'],
    );
    // Znaczniki trafień wyszukiwarki nie trafiają do cytatu.
    assert.equal(g.evidenceUse[0]?.quote, 'Bruksela, Belgia – spotkanie');
  }
});

test('siła podstawy: materiały są, ale nie rozstrzygają → przesłanka mówi to wprost', () => {
  const s = computeStrength({
    verdict: 'brak wystarczających dowodów',
    basis: [],
    discrepancy: false,
    hasDirect: true,
    now: NOW,
  });
  assert.deepEqual(s.reasons, ['Materiały dotyczące twierdzenia nie pozwalają go rozstrzygnąć.']);
});

test('reguły: materiałów tylko z tego samego tematu trafia do wyniku najwyżej dwa', () => {
  const docs = [1, 2, 3, 4].map((n) => doc({ id: `doc_${n}`, url: `https://www.gov.pl/${n}` }));
  const g = applyGuardrails(
    judgement({
      verdict: 'brak wystarczających dowodów',
      items: docs.map((d) => ({
        id: d.id,
        relation: 'related' as const,
        stance: 'context' as const,
        quote: 'spotkanie ministrów spraw zagranicznych NATO',
        addressesModel: false,
      })),
    }),
    available(...docs),
  );
  assert.deepEqual(
    g.evidenceUse.map((u) => u.id),
    ['doc_1', 'doc_2'],
  );
});

test('reguły: z jednego dokumentu zostają fragmenty rozstrzygające albo jeden fragment kontekstu', () => {
  const fragment = (id: string, excerpt: string, url = 'https://www.gov.pl/web/rcb/seminarium') =>
    doc({ id, url, excerpt, fragmentId: id });
  const evidence = available(
    fragment('doc_1', 'Rusza VIII Seminarium Cyberbezpieczeństwa w Warszawie.'),
    fragment('doc_2', 'W seminarium weźmie udział około 300 przedstawicieli administracji.'),
    fragment('doc_3', 'W programie przewidziano wystąpienia przedstawicieli ministerstw.'),
    fragment('doc_4', 'Narada służbowa trwała dwa dni.', 'https://www.gov.pl/web/kgpsp/narada'),
    fragment(
      'doc_5',
      'W naradzie udział wzięli komendanci.',
      'https://www.gov.pl/web/kgpsp/narada',
    ),
  );
  const item = (id: string, stance: 'refutes' | 'context', quote: string) => ({
    id,
    relation: 'direct' as const,
    stance,
    quote,
    addressesModel: false,
  });
  const guarded = applyGuardrails(
    judgement({
      items: [
        item('doc_1', 'context', 'Rusza VIII Seminarium Cyberbezpieczeństwa'),
        item('doc_2', 'refutes', 'weźmie udział około 300 przedstawicieli'),
        item('doc_3', 'context', 'przewidziano wystąpienia przedstawicieli ministerstw'),
        item('doc_4', 'context', 'Narada służbowa trwała dwa dni'),
        item('doc_5', 'context', 'W naradzie udział wzięli komendanci'),
      ],
    }),
    evidence,
  );
  assert.equal(guarded.verdict, 'fałszywe');
  assert.deepEqual(
    guarded.evidenceUse.map((u) => u.id),
    ['doc_2', 'doc_4'],
  );
});
