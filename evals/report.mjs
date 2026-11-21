// node evals/report.mjs <run.jsonl...>
// Joins the deterministic score with Claude Code's judgements (evals/runs/judge-claude-code.jsonl).
import { writeFileSync } from 'node:fs';

import { ABSTAIN, JUDGEMENTS, judgeItems } from './assessment.mjs';
import { gold, lines, score } from './score.mjs';

const files = process.argv.slice(2);
if (!files.length) throw Error('Supply the run JSONL files');
const byKey = new Map(lines(JUDGEMENTS).map((j) => [j.key, j]));
const rows = files.flatMap(lines);
const groups = Map.groupBy(rows, (r) => r.model + ' ' + r.mode);
const review = [],
  disagreements = [];
const ratio = (arr) =>
  arr.length
    ? arr.filter(Boolean).length +
      '/' +
      arr.length +
      ' (' +
      ((100 * arr.filter(Boolean).length) / arr.length).toFixed(1) +
      '%)'
    : '—';
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
    const m = { quotes: [], faithful: [], justified: [], unsupported: [], settling: [] };
    for (const { row, claim, key } of judgeItems(selected)) {
      const j = byKey.get(key);
      if (!j)
        throw Error(
          'Missing judgement for ' + row.id + ' round ' + row.round + ' — run /judge-evals',
        );
      m.quotes.push(...j.quotes);
      m.faithful.push(j.claimFaithful);
      m.justified.push(j.verdictJustified);
      if (j.quotes.length) m.unsupported.push(!j.unsupportedFact);
      if (claim.verdict === ABSTAIN) m.settling.push(j.namesSettlingDocument);
      if (split !== 'all') continue;
      const expected = gold.get(row.id).claims.map((c) => c.verdict);
      const failed =
        j.quotes.includes(false) ||
        !j.claimFaithful ||
        !j.verdictJustified ||
        j.unsupportedFact ||
        (claim.verdict === ABSTAIN && !j.namesSettlingDocument);
      review.push({ caseId: row.id, round: row.round, mode: row.mode, failed, ...j });
      if (expected.length === 1 && expected[0] !== j.preferredVerdict)
        disagreements.push({
          case: row.id,
          round: row.round,
          gold: expected[0],
          judge: j.preferredVerdict,
          system: claim.verdict,
          reason: j.reason,
        });
    }
    table[split] = {
      ...score(selected),
      'Judge: quote fills its role': ratio(m.quotes),
      'Judge: claim faithful to query': ratio(m.faithful),
      'Judge: verdict justified': ratio(m.justified),
      'Judge: explanation fully supported': ratio(m.unsupported),
      'Judge: settling document on abstention': ratio(m.settling),
    };
  }
  console.log(name);
  console.table(table);
  for (const [scenario, bucket] of Map.groupBy(group, (r) => gold.get(r.id).scenario))
    console.log(scenario, score(bucket)['Macro-F1']);
}
// Cases where the judge's own verdict differs from the gold label: either the system and the
// judge share a mistake, or the label is wrong. Both need a human look.
if (disagreements.length) {
  console.log('\nJudge vs gold label');
  console.table(disagreements.map(({ reason, ...d }) => d));
}
const passes = review.filter((x) => !x.failed).toSorted((a, b) => a.key.localeCompare(b.key));
const chosen = [
  ...review.filter((x) => x.failed),
  ...passes.slice(0, Math.ceil(passes.length / 5)),
];
writeFileSync('evals/runs/review.jsonl', chosen.map((x) => JSON.stringify(x)).join('\n') + '\n');
