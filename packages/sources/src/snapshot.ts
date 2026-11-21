import type { DatabaseSync } from 'node:sqlite';

import type { SourceType } from '@prawdowid/contracts';
import { z } from 'zod';

import { insertDocument, setCorpusMeta, type CorpusDocument } from './corpus.ts';
import { MAX_FRAGMENT_CHARS } from './fragments.ts';

/**
 * Import snapshotu korpusu (JSONL, jeden dokument w wierszu) przygotowanego przez scraper.
 * Cały plik przechodzi walidację przed zapisem: jeden zły wiersz zatrzymuje import,
 * żeby korpus nigdy nie był po cichu niepełny.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, 'oczekiwana data w formacie RRRR-MM-DD')
  .refine((value) => Number.isFinite(Date.parse(value)), 'nieprawidłowa data');

const httpUrl = z.string().refine((value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, 'oczekiwany adres http(s)');

/** Klasa źródła ze snapshotu → typ źródła w systemie. Nieznana klasa zatrzymuje import. */
const SOURCE_CLASS: Record<string, SourceType> = {
  urzedowe: 'primary',
  pierwotne: 'primary',
  wtorne: 'secondary',
};

/** Pola, z których korzystamy. Pozostałe pola wiersza są ignorowane. */
const SnapshotRow = z.object({
  id: z.string().min(1),
  zrodlo_id: z.string().min(1),
  url: httpUrl,
  tytul: z.string().trim().min(1),
  wydawca: z.string().trim().min(1),
  instytucja: z.string().nullish(),
  klasa_zrodla: z.string(),
  data_publikacji: isoDate.nullable(),
  data_aktualizacji: isoDate.nullish(),
  data_pobrania: isoDate,
  hash_tresci: z.string().nullish(),
  wersja_korpusu: z.string().min(1),
  fragmenty: z
    .array(z.object({ id: z.string().min(1), tekst: z.string().trim().min(1) }))
    .min(1, 'dokument bez fragmentów'),
  ocena_zrodla: z.string().nullish(),
});

/** Źródło z katalogu (`data/sources.ts`), z którego wolno importować dokumenty. */
export type SnapshotSource = { licence: string };

export type ImportReport = {
  version: string;
  documents: number;
  fragments: number;
  bySource: Record<string, number>;
  withoutPublicationDate: number;
};

export class SnapshotError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`Snapshot korpusu ma błędy (${problems.length}):\n${problems.join('\n')}`);
    this.problems = problems;
  }
}

/** Sprawdza cały plik i zamienia wiersze na dokumenty korpusu. Rzuca `SnapshotError` z listą błędów. */
export function parseSnapshot(
  jsonl: string,
  sources: ReadonlyMap<string, SnapshotSource>,
): { version: string; documents: CorpusDocument[] } {
  const problems: string[] = [];
  const documents: CorpusDocument[] = [];
  const versions = new Set<string>();
  const seenUrls = new Map<string, number>();
  const seenIds = new Map<string, number>();

  for (const [index, line] of jsonl.split('\n').entries()) {
    if (line.trim() === '') continue;
    const lineNo = index + 1;
    const fail = (message: string) => problems.push(`wiersz ${lineNo}: ${message}`);

    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      fail('to nie jest poprawny JSON');
      continue;
    }
    const parsed = SnapshotRow.safeParse(json);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) fail(`${issue.path.join('.')}: ${issue.message}`);
      continue;
    }
    const row = parsed.data;

    const sourceType = SOURCE_CLASS[row.klasa_zrodla];
    if (!sourceType) {
      fail(
        `nieznana klasa_zrodla „${row.klasa_zrodla}” (znane: ${Object.keys(SOURCE_CLASS).join(', ')})`,
      );
    }
    if (!sources.has(row.zrodlo_id)) {
      fail(`zrodlo_id „${row.zrodlo_id}” nie ma w katalogu data/sources.ts (pole corpusId)`);
    }
    const tooLong = row.fragmenty.find((f) => f.tekst.length > MAX_FRAGMENT_CHARS);
    if (tooLong) {
      fail(
        `fragment ${tooLong.id} ma ${tooLong.tekst.length} znaków (limit ${MAX_FRAGMENT_CHARS})`,
      );
    }
    const sameUrl = seenUrls.get(row.url);
    if (sameUrl !== undefined) fail(`ten sam url co w wierszu ${sameUrl}`);
    seenUrls.set(row.url, lineNo);
    const sameId = seenIds.get(row.id);
    if (sameId !== undefined) fail(`to samo id co w wierszu ${sameId}`);
    seenIds.set(row.id, lineNo);
    versions.add(row.wersja_korpusu);
    if (!sourceType) continue;

    documents.push({
      url: row.url,
      title: row.tytul,
      publisher: row.wydawca,
      sourceType,
      publishedAt: row.data_publikacji,
      fetchedAt: row.data_pobrania,
      fragments: row.fragmenty.map((f) => ({ id: f.id, text: f.tekst })),
      sourceId: row.zrodlo_id,
      externalId: row.id,
      institution: row.instytucja ?? null,
      updatedAt: row.data_aktualizacji ?? null,
      contentHash: row.hash_tresci ?? null,
      rating: row.ocena_zrodla?.trim() || null,
    });
  }

  if (documents.length === 0 && problems.length === 0) problems.push('plik nie zawiera dokumentów');
  if (versions.size > 1) {
    problems.push(`kilka wersji korpusu w jednym pliku: ${[...versions].join(', ')}`);
  }
  if (problems.length > 0) throw new SnapshotError(problems);

  return { version: [...versions][0] ?? 'unknown', documents };
}

/** Waliduje snapshot i zapisuje go do bazy w jednej transakcji. */
export function importSnapshot(
  db: DatabaseSync,
  jsonl: string,
  options: { sources: ReadonlyMap<string, SnapshotSource>; importedAt: Date },
): ImportReport {
  const { version, documents } = parseSnapshot(jsonl, options.sources);

  db.exec('BEGIN');
  try {
    for (const doc of documents) insertDocument(db, doc);
    setCorpusMeta(db, { version, importedAt: options.importedAt.toISOString() });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const bySource: Record<string, number> = {};
  for (const doc of documents) {
    const id = doc.sourceId ?? 'unknown';
    bySource[id] = (bySource[id] ?? 0) + 1;
  }
  return {
    version,
    documents: documents.length,
    fragments: documents.reduce((sum, doc) => sum + (doc.fragments?.length ?? 0), 0),
    bySource,
    withoutPublicationDate: documents.filter((doc) => doc.publishedAt === null).length,
  };
}
