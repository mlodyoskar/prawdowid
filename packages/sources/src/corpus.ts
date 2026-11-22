import { DatabaseSync } from 'node:sqlite';

import type { SourceType } from '@prawdowid/contracts';

import { splitIntoFragments } from './fragments.ts';
import { toFtsQuery } from './fts-query.ts';
import type { SourceHit, SourceResult } from './types.ts';

export type CorpusFragment = {
  /** Id fragmentu z pliku korpusu (np. `doc-0001-f03`). */
  id?: string;
  text: string;
};

export type CorpusDocument = {
  url: string;
  title: string;
  publisher: string;
  sourceType: SourceType;
  publishedAt: string | null;
  fetchedAt: string;
  /** Gotowe fragmenty. Gdy ich brak, treść z `content` dzielimy sami. */
  fragments?: readonly CorpusFragment[];
  content?: string;
  /** Id źródła z katalogu `data/sources.ts`. */
  sourceId?: string;
  /** Id dokumentu z pliku korpusu. Zmienia się między snapshotami: kluczem jest URL. */
  externalId?: string;
  institution?: string | null;
  updatedAt?: string | null;
  contentHash?: string | null;
  /** Ocena wystawiona przez redakcję fact-checkingową (dla dokumentów wtórnych). */
  rating?: string | null;
};

export type CorpusInfo = {
  documents: number;
  fragments: number;
  /** Wersja zaimportowanego snapshotu; `null`, gdy korpus nie pochodzi z importu. */
  version: string | null;
  importedAt: string | null;
};

export type Corpus = {
  search(query: string, options?: { limit?: number }): SourceResult;
  /** Kolejne fragmenty jednego dokumentu (po adresie), do doczytania całości. */
  fragments(url: string, options?: { limit?: number }): SourceResult;
  count(): number;
  info(): CorpusInfo;
  close(): void;
};

/** Zmiana schematu = nowy numer. Plik korpusu jest pochodną danych, więc buduje się go od nowa. */
const SCHEMA_VERSION = 3;

/** Z jednego dokumentu do wyniku trafiają najwyżej tyle fragmentów. */
const MAX_FRAGMENTS_PER_DOCUMENT = 2;
/** Zapas wierszy, z którego wybieramy po zastosowaniu limitu na dokument. */
const OVERFETCH = 6;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS documents (
  id           INTEGER PRIMARY KEY,
  url          TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  publisher    TEXT NOT NULL,
  domain       TEXT NOT NULL,
  source_type  TEXT NOT NULL CHECK (source_type IN ('primary', 'secondary')),
  published_at TEXT,
  fetched_at   TEXT NOT NULL,
  source_id    TEXT,
  external_id  TEXT,
  institution  TEXT,
  updated_at   TEXT,
  content_hash TEXT,
  rating       TEXT
);

CREATE TABLE IF NOT EXISTS fragments (
  id          INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id),
  position    INTEGER NOT NULL,
  external_id TEXT,
  text        TEXT NOT NULL,
  UNIQUE (document_id, position)
);

-- Wyszukiwanie po fragmentach. Tytuł dokumentu jest powtórzony przy każdym fragmencie,
-- żeby pytanie o temat z tytułu trafiało też we fragmenty ze środka dokumentu.
CREATE VIRTUAL TABLE IF NOT EXISTS fragments_fts USING fts5(
  title, text,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export class CorpusSchemaError extends Error {}

export function ensureSchema(db: DatabaseSync): void {
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
  const existing = db
    .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'documents'")
    .get() as { n: number };
  if (existing.n > 0 && version !== SCHEMA_VERSION) {
    throw new CorpusSchemaError(
      'Plik korpusu ma stary format. Zbuduj go od nowa: pnpm --filter @prawdowid/sources seed',
    );
  }
  db.exec(SCHEMA);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

/** Wstawia dokument z fragmentami. Dokument o tym samym URL jest zastępowany w całości. */
export function insertDocument(db: DatabaseSync, doc: CorpusDocument): void {
  const given: readonly CorpusFragment[] =
    doc.fragments ?? splitIntoFragments(doc.content ?? '').map((text) => ({ text }));
  const fragments = given
    .map((f) => ({ id: f.id, text: f.text.trim() }))
    .filter((f) => f.text !== '');
  if (fragments.length === 0) throw new Error(`Dokument bez treści: ${doc.url}`);

  const previous = db.prepare('SELECT id FROM documents WHERE url = ?').get(doc.url) as
    | { id: number }
    | undefined;
  if (previous) {
    db.prepare(
      'DELETE FROM fragments_fts WHERE rowid IN (SELECT id FROM fragments WHERE document_id = ?)',
    ).run(previous.id);
    db.prepare('DELETE FROM fragments WHERE document_id = ?').run(previous.id);
    db.prepare('DELETE FROM documents WHERE id = ?').run(previous.id);
  }

  const { lastInsertRowid: documentId } = db
    .prepare(
      `INSERT INTO documents (url, title, publisher, domain, source_type, published_at, fetched_at,
                              source_id, external_id, institution, updated_at, content_hash, rating)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      doc.url,
      doc.title,
      doc.publisher,
      domainOf(doc.url),
      doc.sourceType,
      doc.publishedAt,
      doc.fetchedAt,
      doc.sourceId ?? null,
      doc.externalId ?? null,
      doc.institution ?? null,
      doc.updatedAt ?? null,
      doc.contentHash ?? null,
      doc.rating ?? null,
    );

  const insertFragment = db.prepare(
    'INSERT INTO fragments (document_id, position, external_id, text) VALUES (?, ?, ?, ?)',
  );
  const insertFts = db.prepare('INSERT INTO fragments_fts (rowid, title, text) VALUES (?, ?, ?)');
  fragments.forEach((fragment, position) => {
    const { lastInsertRowid: fragmentId } = insertFragment.run(
      documentId,
      position,
      fragment.id ?? null,
      fragment.text,
    );
    insertFts.run(fragmentId, doc.title, fragment.text);
  });
}

export function setCorpusMeta(db: DatabaseSync, meta: { version: string; importedAt: string }) {
  const upsert = db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  upsert.run('corpus_version', meta.version);
  upsert.run('imported_at', meta.importedAt);
}

type Row = {
  url: string;
  title: string;
  publisher: string;
  source_type: SourceType;
  published_at: string | null;
  fetched_at: string;
  rating: string | null;
  document_id: number;
  position: number;
  fragment_id: string | null;
  text: string;
};

/** Otwiera korpus (SQLite FTS5). `:memory:` działa w testach. */
export function openCorpus(path: string): Corpus {
  const db = new DatabaseSync(path);
  ensureSchema(db);

  // Wynikiem jest cały fragment (nie wycinek wokół trafienia): na tej samej treści kod sprawdza
  // potem cytaty. Tytuł i treść fragmentu ważą tyle samo (wagi do strojenia na zestawie testowym).
  const searchStmt = db.prepare(`
    SELECT d.url, d.title, d.publisher, d.source_type, d.published_at, d.fetched_at, d.rating,
           f.document_id, f.position, f.external_id AS fragment_id, f.text
    FROM fragments_fts
    JOIN fragments f ON f.id = fragments_fts.rowid
    JOIN documents d ON d.id = f.document_id
    WHERE fragments_fts MATCH ?
    ORDER BY bm25(fragments_fts, 1.0, 1.0)
    LIMIT ?
  `);
  const fragmentsStmt = db.prepare(`
    SELECT d.url, d.title, d.publisher, d.source_type, d.published_at, d.fetched_at, d.rating,
           f.document_id, f.position, f.external_id AS fragment_id, f.text
    FROM documents d
    JOIN fragments f ON f.document_id = d.id
    WHERE d.url = ?
    ORDER BY f.position
    LIMIT ?
  `);
  const countStmt = db.prepare('SELECT COUNT(*) AS n FROM documents');
  const fragmentCountStmt = db.prepare('SELECT COUNT(*) AS n FROM fragments');
  const metaStmt = db.prepare('SELECT value FROM meta WHERE key = ?');
  const meta = (key: string) => (metaStmt.get(key) as { value: string } | undefined)?.value ?? null;

  return {
    search(query, { limit = 8 } = {}) {
      const match = toFtsQuery(query);
      if (match === null) return { ok: true, items: [] };
      try {
        const rows = searchStmt.all(match, limit * OVERFETCH) as unknown as Row[];
        const perDocument = new Map<number, number>();
        const items: SourceHit[] = [];
        for (const row of rows) {
          const taken = perDocument.get(row.document_id) ?? 0;
          if (taken >= MAX_FRAGMENTS_PER_DOCUMENT) continue;
          perDocument.set(row.document_id, taken + 1);
          items.push(toHit(row));
          if (items.length >= limit) break;
        }
        return { ok: true, items };
      } catch (err) {
        return unavailable(err);
      }
    },
    fragments(url, { limit = 12 } = {}) {
      try {
        const rows = fragmentsStmt.all(url, limit) as unknown as Row[];
        return { ok: true, items: rows.map(toHit) };
      } catch (err) {
        return unavailable(err);
      }
    },
    count() {
      return (countStmt.get() as { n: number }).n;
    },
    info() {
      return {
        documents: (countStmt.get() as { n: number }).n,
        fragments: (fragmentCountStmt.get() as { n: number }).n,
        version: meta('corpus_version'),
        importedAt: meta('imported_at'),
      };
    },
    close() {
      db.close();
    },
  };
}

function unavailable(err: unknown): SourceResult {
  return {
    ok: false,
    reason: 'unavailable',
    message: `Błąd wyszukiwania w korpusie: ${err instanceof Error ? err.message : String(err)}`,
  };
}

function toHit(row: Row): SourceHit {
  return {
    kind: 'corpus',
    title: row.title,
    publisher: row.publisher,
    url: row.url,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    excerpt: row.text,
    fragmentId: row.fragment_id ?? `f${String(row.position + 1).padStart(2, '0')}`,
    sourceType: row.source_type,
    ...(row.rating ? { rating: row.rating } : {}),
  };
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}
