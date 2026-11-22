import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { gold, lines } from './score.mjs';

export const VERDICTS = [
  'potwierdzone',
  'fałszywe',
  'wprowadzające w błąd',
  'brak wystarczających dowodów',
  'nie podlega weryfikacji',
];
export const ABSTAIN = 'brak wystarczających dowodów';
export const JUDGEMENTS = 'evals/runs/judge-claude-code.jsonl';

let library;
/** Full source text the judge reads: corpus snapshot, recorded Fact Check hits, URL fixtures. */
function sources() {
  if (library) return library;
  library = new Map(
    lines('data/corpus/snapshot.jsonl').map((d) => [
      d.url,
      {
        title: d.tytul,
        publisher: d.wydawca,
        publishedAt: d.data_publikacji,
        text: d.fragmenty.map((f) => f.tekst).join('\n'),
      },
    ]),
  );
  for (const recording of Object.values(
    JSON.parse(readFileSync('evals/fixtures/factchecks.json', 'utf8')),
  ))
    for (const h of recording.items)
      library.set(h.url, {
        title: h.title,
        publisher: h.publisher,
        publishedAt: h.publishedAt,
        text: h.excerpt + '\nOcena redakcji: ' + h.rating,
      });
  return library;
}

/**
 * One judge item per claim of a direct check. The payload carries the user's query, but neither
 * the case id nor its gold label, so the judge stays blind to the expected answer.
 */
export function judgeItem(row, claim) {
  const evidence = new Map((row.response.evidence ?? []).map((e) => [e.id, e]));
  const c = gold.get(row.id);
  const payload = {
    query: c.text,
    ...(c.image ? { image: 'evals/' + c.image } : {}),
    claim: claim.claim,
    verdict: claim.verdict,
    explanation: claim.explanation ?? '',
    limitations: claim.limitations ?? '',
    unknowns: claim.unknowns ?? [],
    citations: (claim.evidenceUse ?? []).map((u) => {
      const e = evidence.get(u.id);
      return { role: u.stance, quote: u.quote, url: e?.url ?? null };
    }),
  };
  const key = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
  return { key, payload };
}

export function* judgeItems(rows) {
  for (const row of rows.filter((r) => r.channel === 'direct'))
    for (const claim of row.response.claims ?? []) yield { row, claim, ...judgeItem(row, claim) };
}

/** Documents cited by the given items, read once per export instead of once per citation. */
export function documentsFor(items, rows) {
  const lib = sources(),
    docs = {};
  const fallback = new Map(rows.flatMap((r) => (r.response.evidence ?? []).map((e) => [e.url, e])));
  for (const { payload } of items)
    for (const { url } of payload.citations) {
      if (!url || docs[url]) continue;
      const e = fallback.get(url);
      docs[url] = lib.get(url) ?? {
        title: e?.title ?? null,
        publisher: e?.publisher ?? null,
        publishedAt: e?.publishedAt ?? null,
        text: (e?.excerpt ?? '') + (e?.rating ? '\nOcena redakcji: ' + e.rating : ''),
      };
    }
  return docs;
}

/** Returns a list of problems; an empty list means the judgement can be stored. */
export function validateJudgement(j, payload) {
  const problems = [];
  const bool = (k) => typeof j[k] === 'boolean' || problems.push(k + ' must be boolean');
  bool('claimFaithful');
  bool('verdictJustified');
  bool('unsupportedFact');
  if (!VERDICTS.includes(j.preferredVerdict)) problems.push('preferredVerdict is not a Verdict');
  if (payload.verdict === ABSTAIN) bool('namesSettlingDocument');
  else if (j.namesSettlingDocument !== null)
    problems.push('namesSettlingDocument must be null unless the verdict abstains');
  if (
    !Array.isArray(j.quotes) ||
    j.quotes.length !== payload.citations.length ||
    !j.quotes.every((q) => typeof q === 'boolean')
  )
    problems.push('quotes must hold one boolean per citation (' + payload.citations.length + ')');
  if (typeof j.reason !== 'string' || !j.reason.trim()) problems.push('reason is required');
  return problems;
}
