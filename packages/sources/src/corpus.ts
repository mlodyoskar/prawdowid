import { DatabaseSync } from 'node:sqlite';

import type { SourceType } from '@prawdowid/contracts';

import { toFtsQuery } from './fts-query.ts';
import type { SourceHit, SourceResult } from './types.ts';

export type CorpusDocument = {
  url: string;
  title: string;
  publisher: string;
  sourceType: SourceType;
  publishedAt: string | null;
  fetchedAt: string;
  content: string;
  isMock?: boolean;
};

export type Corpus = {
  search(query: string, options?: { limit?: number }): SourceResult;
  count(): number;
  close(): void;
};

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
  content      TEXT NOT NULL,
  is_mock      INTEGER NOT NULL DEFAULT 0
);

CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  title, content,
  content = 'documents', content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
  INSERT INTO documents_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
END;
CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
END;
CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
  INSERT INTO documents_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
END;
`;

export function ensureSchema(db: DatabaseSync): void {
  db.exec(SCHEMA);
}

export function insertDocument(db: DatabaseSync, doc: CorpusDocument): void {
  db.prepare(
    `INSERT INTO documents (url, title, publisher, domain, source_type, published_at, fetched_at, content, is_mock)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET
       title = excluded.title, publisher = excluded.publisher, domain = excluded.domain,
       source_type = excluded.source_type, published_at = excluded.published_at,
       fetched_at = excluded.fetched_at, content = excluded.content, is_mock = excluded.is_mock`,
  ).run(
    doc.url,
    doc.title,
    doc.publisher,
    domainOf(doc.url),
    doc.sourceType,
    doc.publishedAt,
    doc.fetchedAt,
    doc.content,
    doc.isMock ? 1 : 0,
  );
}

type Row = {
  url: string;
  title: string;
  publisher: string;
  source_type: SourceType;
  published_at: string | null;
  fetched_at: string;
  is_mock: number;
  excerpt: string;
};

/** Otwiera korpus (SQLite FTS5). `:memory:` działa w testach. */
export function openCorpus(path: string): Corpus {
  const db = new DatabaseSync(path);
  ensureSchema(db);

  // Tytuł waży 5× więcej niż treść. snippet() wycina fragment treści wokół trafień.
  const searchStmt = db.prepare(`
    SELECT d.url, d.title, d.publisher, d.source_type, d.published_at, d.fetched_at, d.is_mock,
           snippet(documents_fts, 1, '«', '»', '…', 40) AS excerpt
    FROM documents_fts
    JOIN documents d ON d.id = documents_fts.rowid
    WHERE documents_fts MATCH ?
    ORDER BY bm25(documents_fts, 5.0, 1.0)
    LIMIT ?
  `);
  const countStmt = db.prepare('SELECT COUNT(*) AS n FROM documents');

  return {
    search(query, { limit = 8 } = {}) {
      const match = toFtsQuery(query);
      if (match === null) return { ok: true, items: [] };
      try {
        const rows = searchStmt.all(match, limit) as unknown as Row[];
        return { ok: true, items: rows.map(toHit) };
      } catch (err) {
        return {
          ok: false,
          reason: 'unavailable',
          message: `Błąd wyszukiwania w korpusie: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
    count() {
      return (countStmt.get() as { n: number }).n;
    },
    close() {
      db.close();
    },
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
    excerpt: row.excerpt,
    sourceType: row.source_type,
    ...(row.is_mock ? { isMock: true } : {}),
  };
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}
