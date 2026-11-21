import { writeFileSync } from 'node:fs';

import { assessment } from './assessment.mjs';
import { gold, lines, score } from './score.mjs';

const [judgeFile, ...files] = process.argv.slice(2);
if (!files.length) throw Error('Supply judge file followed by the run JSONL files');
const judges = lines(judgeFile);
const byKey = new Map(judges.map((x) => [x.key, x]));
const model = judges[0].model;
const rows = files.flatMap(lines);
const groups = Map.groupBy(rows, (r) => r.model + ' ' + r.mode);
const review = [];
const ratio = (arr) => (arr.length ? arr.filter(Boolean).length + '/' + arr.length : '—');
for (const [name, group] of groups) {
  const ids = new Set(group.map((r) => [r.id, r.round, r.channel].join('/')));
  if (ids.size !== group.length) throw Error('Duplicate check in ' + name);
  const table = {};
  for (const [split, selected] of [
    ['all', group],
    ['dev', group.filter((r) => !r.heldOut)],
    ['held-out', group.filter((r) => r.heldOut)],
  ]) {
    if (!selected.length) continue;
    const quotes = [],
      unsupported = [],
      settling = [],
      unsupportedWithQuotes = [];
    for (const r of selected.filter((row) => row.channel === 'direct')) {
      for (const c of r.response.claims ?? []) {
        const { key } = assessment(c, model),
          j = byKey.get(key);
        if (!j) throw Error('Missing judgment for ' + r.response.checkId);
        const abstained = c.verdict === 'brak wystarczających dowodów';
        quotes.push(...j.quoteCorrect);
        unsupported.push(j.addsUnsupportedFact);
        if (j.payload.quotes.length) unsupportedWithQuotes.push(j.addsUnsupportedFact);
        if (abstained) settling.push(j.namesSettlingDocument);
        if (split === 'all')
          review.push({
            key,
            caseId: r.id,
            round: r.round,
            mode: r.mode,
            failed:
              j.quoteCorrect.includes(false) ||
              j.addsUnsupportedFact ||
              (abstained && !j.namesSettlingDocument),
            ...j,
          });
      }
    }
    table[split] = {
      ...score(selected),
      'Judged quotes correct': ratio(quotes),
      'Unsupported explanation (quotes available)': ratio(unsupportedWithQuotes),
      'Unsupported explanation (all)': ratio(unsupported),
      'Settling document on abstention': ratio(settling),
    };
  }
  console.log(name);
  console.table(table);
  for (const [scenario, bucket] of Map.groupBy(group, (r) => gold.get(r.id).scenario))
    console.log(scenario, score(bucket)['Macro-F1']);
}
const passes = review.filter((x) => !x.failed).toSorted((a, b) => a.key.localeCompare(b.key));
const chosen = [
  ...review.filter((x) => x.failed),
  ...passes.slice(0, Math.ceil(passes.length / 5)),
];
writeFileSync('evals/runs/review.jsonl', chosen.map((x) => JSON.stringify(x)).join('\n') + '\n');
