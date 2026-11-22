import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CheckResponse } from '@prawdowid/contracts';

import { csvField, exportFile, toCsv, toJson, toStix, type OkResult } from './export.ts';

// Dane testowe: zmyślony wynik, tylko do sprawdzenia kształtu plików.
const RESULT = CheckResponse.parse({
  status: 'ok',
  checkId: 'chk-1',
  createdAt: '2026-11-20T10:00:00.000Z',
  durationMs: 1200,
  summary: 'Jedno twierdzenie jest fałszywe.',
  warnings: ['Materiał archiwalny.'],
  claims: [
    {
      claim: 'Most "Północny" zamknięto w 2025 r.',
      verdict: 'fałszywe',
      confidence: 'wysoka',
      explanation: 'Źródło podaje inną datę.',
      evidenceIds: ['e1', 'e2'],
      limitations: '',
      evidenceUse: [{ id: 'e1', stance: 'refutes', quote: 'Most zamknięto w 2023 r.' }],
      unknowns: ['Nie wiadomo, kiedy most otworzą.'],
    },
    {
      claim: 'Coś bez dowodów',
      verdict: 'brak wystarczających dowodów',
      confidence: 'niska',
      explanation: 'Nie znaleziono źródeł.',
      evidenceIds: [],
      limitations: 'Rozstrzygnąłby to komunikat urzędu.',
    },
  ],
  evidence: [
    {
      id: 'e1',
      kind: 'corpus',
      title: 'Zamknięcie mostu',
      publisher: 'Urząd Miasta',
      url: 'https://example.test/most',
      publishedAt: '2023-05-01',
      fetchedAt: null,
      excerpt: 'Most zamknięto w 2023 r. z powodu remontu.',
    },
    {
      id: 'e2',
      kind: 'factcheck',
      title: '=HYPERLINK("x")',
      publisher: 'Fact-checker',
      url: 'https://example.test/fc',
      publishedAt: null,
      fetchedAt: null,
      excerpt: 'Ocena',
      rating: 'Fałsz',
    },
  ],
}) as OkResult;

function csvRows(csv: string): string[] {
  assert.ok(csv.startsWith('﻿'));
  return csv.slice(1).trimEnd().split('\r\n');
}

test('csvField quotes values and neutralises spreadsheet formulas', () => {
  assert.equal(csvField('a "b", c'), '"a ""b"", c"');
  assert.equal(csvField('=1+1'), `"'=1+1"`);
  assert.equal(csvField('-5'), `"'-5"`);
  assert.equal(csvField('zwykły tekst'), '"zwykły tekst"');
});

test('CSV has one row per claim–evidence pair and a row for claims without evidence', () => {
  const rows = csvRows(toCsv(RESULT));
  assert.equal(rows.length, 4);
  assert.match(rows[0] ?? '', /^"nr_sprawdzenia","data_sprawdzenia"/);
  assert.match(rows[1] ?? '', /"obala","Most zamknięto w 2023 r\.","Zamknięcie mostu"/);
  assert.match(rows[1] ?? '', /"Most ""Północny"" zamknięto w 2025 r\."/);
  // Bez evidenceUse cytatem jest fragment źródła, a rola zostaje pusta.
  assert.match(
    rows[2] ?? '',
    /"","Ocena","'=HYPERLINK\(""x""\)","Fact-checker","","https:\/\/example\.test\/fc","fact-check","Fałsz"/,
  );
  assert.match(
    rows[3] ?? '',
    /"brak wystarczających dowodów".*"Rozstrzygnąłby to komunikat urzędu\.","nie"(,""){8}$/,
  );
});

test('JSON keeps the full result and export metadata', () => {
  const doc = JSON.parse(
    toJson(RESULT, {
      now: new Date('2026-11-22T12:00:00Z'),
      resultUrl: 'https://w.test/?check=chk-1',
    }),
  );
  assert.equal(doc.format, 'prawdowid-check');
  assert.equal(doc.exportedAt, '2026-11-22T12:00:00.000Z');
  assert.equal(doc.resultUrl, 'https://w.test/?check=chk-1');
  assert.deepEqual(CheckResponse.parse(doc.result), RESULT);
});

test('STIX bundle has a report, one note per claim and evidence as external references', () => {
  let n = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const bundle = JSON.parse(toStix(RESULT, { uuid, now: new Date('2026-11-22T12:00:00Z') }));

  assert.equal(bundle.type, 'bundle');
  assert.match(bundle.id, /^bundle--/);
  const byType = (t: string) => bundle.objects.filter((o: { type: string }) => o.type === t);
  const [identity] = byType('identity');
  const [report] = byType('report');
  const notes = byType('note');

  assert.equal(notes.length, 2);
  for (const o of bundle.objects) {
    assert.equal(o.spec_version, '2.1');
    assert.match(o.id, new RegExp(`^${o.type}--[0-9a-f-]{36}$`));
  }
  assert.deepEqual(
    report.object_refs,
    notes.map((x: { id: string }) => x.id),
  );
  assert.equal(report.created_by_ref, identity.id);
  assert.equal(report.published, '2026-11-20T10:00:00.000Z');
  assert.match(report.description, /Materiał archiwalny/);

  const [first, second] = notes;
  assert.deepEqual(first.object_refs, [report.id]);
  assert.deepEqual(first.labels, ['werdykt: fałszywe', 'pewność: wysoka']);
  assert.equal(first.external_references.length, 2);
  assert.equal(first.external_references[0].url, 'https://example.test/most');
  assert.match(first.external_references[0].description, /Rola: obala/);
  assert.match(first.external_references[0].description, /Data publikacji: 2023-05-01/);
  assert.match(first.content, /Czego nie ustalono:\n- Nie wiadomo/);
  assert.equal(second.external_references, undefined);
});

test('exportFile names files by check id', () => {
  assert.equal(exportFile('csv', RESULT).filename, 'prawdowid-chk-1.csv');
  assert.equal(exportFile('json', RESULT).filename, 'prawdowid-chk-1.json');
  assert.equal(exportFile('stix', RESULT).filename, 'prawdowid-chk-1.stix.json');
});
