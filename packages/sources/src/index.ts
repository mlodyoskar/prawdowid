export type { SourceFailureReason, SourceHit, SourceResult } from './types.ts';
export { searchFactChecks, type FactCheckQuery, type FactCheckDeps } from './factcheck.ts';
export {
  openCorpus,
  ensureSchema,
  insertDocument,
  type Corpus,
  type CorpusDocument,
} from './corpus.ts';
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
