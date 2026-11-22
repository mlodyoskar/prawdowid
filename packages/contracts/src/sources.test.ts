import assert from 'node:assert/strict';
import { test } from 'node:test';

import { countSources, groupBySource, sourceQuotes, type Evidence } from './index.ts';

const ev = (id: string, url: string, title = 'Ostrzeżenie GIS: kubek'): Evidence => ({
  id,
  kind: 'corpus',
  title,
  publisher: 'GIS',
  url,
  publishedAt: null,
  fetchedAt: null,
  excerpt: `fragment ${id}`,
});

test('grupuje fragmenty jednej strony, kontekst na końcu, kotwica RSO to osobny dokument', () => {
  const evidence = [
    ev('c', 'https://x.pl/inny'),
    ev('a', 'https://x.pl/kubek'),
    ev('b', 'https://x.pl/kubek/'),
    ev('r1', 'https://rso.pl/#rso-1'),
    ev('r2', 'https://rso.pl/#rso-2'),
  ];
  const groups = groupBySource(evidence, [
    { id: 'c', stance: 'context', quote: '' },
    { id: 'a', stance: 'supports', quote: '' },
    { id: 'b', stance: 'context', quote: '' },
  ]);
  assert.deepEqual(
    groups.map((g) => g.fragments.map((f) => f.evidence.id)),
    [['a', 'b'], ['r1'], ['r2'], ['c']],
  );
  assert.deepEqual(groups[0]?.stances, ['supports', 'context']);
  assert.equal(groups[0]?.basis, true, 'kontekst nie osłabia podstawy');
  assert.equal(groups.at(-1)?.basis, false);
  assert.equal(countSources(evidence), 4);
});

test('różne role fragmentów zostają widoczne', () => {
  const [g] = groupBySource(
    [ev('a', 'https://x.pl/k'), ev('b', 'https://x.pl/k')],
    [
      { id: 'a', stance: 'supports', quote: '' },
      { id: 'b', stance: 'refutes', quote: '' },
    ],
  );
  assert.deepEqual(g?.stances, ['refutes', 'supports']);
});

test('cytaty: bez tytułu, bez powtórzeń, dłuższy zastępuje krótszy', () => {
  const [g] = groupBySource(
    [ev('a', 'https://x.pl/k'), ev('b', 'https://x.pl/k'), ev('c', 'https://x.pl/k')],
    [
      { id: 'a', stance: 'supports', quote: 'Ostrzeżenie GIS: kubek.' },
      { id: 'b', stance: 'supports', quote: 'migracja formaldehydu' },
      {
        id: 'c',
        stance: 'supports',
        quote: 'stwierdzono migrację formaldehydu, migracja formaldehydu z kubka',
      },
    ],
  );
  assert.ok(g);
  assert.deepEqual(
    sourceQuotes(g).map((q) => q.text),
    ['stwierdzono migrację formaldehydu, migracja formaldehydu z kubka'],
  );
  assert.deepEqual(
    sourceQuotes(groupBySource([ev('x', 'https://y.pl')])[0]!, (f) => f.evidence.excerpt).map(
      (q) => q.text,
    ),
    ['fragment x'],
    'bez cytatu sędziego: fragment ze źródła',
  );
});

test('cytat-dowód przed cytatem kontekstowym z tej samej strony', () => {
  const [g] = groupBySource(
    [ev('a', 'https://x.pl/k'), ev('b', 'https://x.pl/k')],
    [
      { id: 'a', stance: 'context', quote: 'tło sprawy' },
      { id: 'b', stance: 'refutes', quote: 'GIS nie wydał takiego ostrzeżenia' },
    ],
  );
  assert.ok(g);
  assert.deepEqual(
    sourceQuotes(g).map((q) => q.text),
    ['GIS nie wydał takiego ostrzeżenia', 'tło sprawy'],
  );
});
