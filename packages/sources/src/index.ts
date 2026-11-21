export type { SourceFailureReason, SourceHit, SourceResult } from './types.ts';
export { searchFactChecks, type FactCheckQuery, type FactCheckDeps } from './factcheck.ts';
export {
  openCorpus,
  ensureSchema,
  insertDocument,
  setCorpusMeta,
  CorpusSchemaError,
  type Corpus,
  type CorpusDocument,
  type CorpusFragment,
  type CorpusInfo,
} from './corpus.ts';
export { splitIntoFragments, MAX_FRAGMENT_CHARS } from './fragments.ts';
export {
  importSnapshot,
  parseSnapshot,
  SnapshotError,
  type ImportReport,
  type SnapshotSource,
} from './snapshot.ts';
export { toFtsQuery } from './fts-query.ts';
export {
  extractUrls,
  fetchPage,
  isPrivateAddress,
  parseHtml,
  type FetchPageDeps,
  type PageFailureReason,
  type PageResult,
} from './fetch-url.ts';
