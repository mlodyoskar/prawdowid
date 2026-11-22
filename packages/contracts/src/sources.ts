import type { Evidence, EvidenceUse, Stance } from './index.ts';

/** One fragment of a source page, with the role and quote the judge gave it (plan mode). */
export type SourceFragment = { evidence: Evidence; use?: EvidenceUse };

/**
 * One publication behind a claim. Search returns several fragments of the same page as
 * separate evidence; users see them as one source with several quotes.
 */
export type SourceGroup = {
  /** The first fragment: its title, publisher, dates and link describe the whole page. */
  evidence: Evidence;
  fragments: SourceFragment[];
  /** Roles of the fragments, strongest first (`refutes`, `supports`, `context`). */
  stances: Stance[];
  /** False when every fragment only adds context: the verdict does not rest on this page. */
  basis: boolean;
};

const STANCE_ORDER: readonly Stance[] = ['refutes', 'supports', 'context'];

function sourceKey(e: Evidence): string {
  // A fragment anchor names a different notice on the same page (RSO: #rso-23521414), so it stays.
  const url = e.url.trim().replace(/\/+(?=$|#)/, '');
  return url ? `url:${url}` : `id:${e.id}`;
}

const normalize = (text: string) =>
  text
    .toLocaleLowerCase('pl')
    .replace(/[«»„”"'’.,:;!?()–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Quotes worth showing for a source: the judge's quote, else `fallback(fragment)`. Fragments
 * the verdict rests on come before context-only ones, so a single quote (WhatsApp) is evidence.
 * Drops a quote that only repeats the page title or another quote, since it shows nothing new.
 */
export function sourceQuotes(
  group: SourceGroup,
  fallback: (fragment: SourceFragment) => string | undefined = () => undefined,
): { text: string; fragment: SourceFragment }[] {
  const title = normalize(group.evidence.title);
  const out: { text: string; fragment: SourceFragment; key: string }[] = [];
  const isContext = (f: SourceFragment) => f.use?.stance === 'context';
  const ordered = [
    ...group.fragments.filter((f) => !isContext(f)),
    ...group.fragments.filter(isContext),
  ];
  for (const fragment of ordered) {
    const text = (fragment.use?.quote || fallback(fragment) || '').trim();
    const key = normalize(text);
    if (!key || key === title) continue;
    if (out.some((q) => q.key.includes(key))) continue;
    // A longer quote replaces the shorter ones it contains, in the place of the first of them.
    const at = out.findIndex((q) => key.includes(q.key));
    const entry = { text, fragment, key };
    if (at < 0) out.push(entry);
    else
      out.splice(
        0,
        out.length,
        ...out.slice(0, at),
        entry,
        ...out.slice(at + 1).filter((q) => !key.includes(q.key)),
      );
  }
  return out.map(({ text, fragment }) => ({ text, fragment }));
}

/**
 * Groups a claim's evidence by publication (same link), keeping the order in which each
 * page first appears, with the pages the verdict rests on before context-only pages. Both
 * channels use it, so the web and WhatsApp lead with the same publication.
 */
export function groupBySource(
  evidence: readonly Evidence[],
  uses?: readonly EvidenceUse[],
): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  for (const e of evidence) {
    const use = uses?.find((u) => u.id === e.id);
    const key = sourceKey(e);
    const group = groups.get(key);
    const fragment: SourceFragment = use ? { evidence: e, use } : { evidence: e };
    if (group) group.fragments.push(fragment);
    else groups.set(key, { evidence: e, fragments: [fragment], stances: [], basis: true });
  }
  const all = [...groups.values()];
  for (const g of all) {
    const stances = new Set(g.fragments.flatMap((f) => (f.use ? [f.use.stance] : [])));
    g.basis = stances.size === 0 || [...stances].some((s) => s !== 'context');
    g.stances = STANCE_ORDER.filter((s) => stances.has(s));
  }
  return [...all.filter((g) => g.basis), ...all.filter((g) => !g.basis)];
}

/** Number of distinct publications in a list of evidence. */
export function countSources(evidence: readonly Evidence[]): number {
  return new Set(evidence.map(sourceKey)).size;
}
