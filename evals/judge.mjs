// Claude Code is the judge. This script only prepares its work and checks what it hands back:
//   node evals/judge.mjs export <run.jsonl...> [--batch-size 25]
//     writes evals/judge/pending.json (all unjudged claims) and self-contained batch-NN.json files,
//     each with only the documents its claims cite, so one fresh subagent can judge one batch
//   node evals/judge.mjs import <answers.jsonl> --model <judge model id>
//   node evals/judge.mjs status <run.jsonl...>
// The rubric is in .claude/skills/judge-evals/rubric.md. Run the judging with `/judge-evals`.
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { parseArgs } from 'node:util';

import { JUDGEMENTS, documentsFor, judgeItems, validateJudgement } from './assessment.mjs';
import { lines } from './score.mjs';

const PENDING = 'evals/judge/pending.json';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: 'string' },
    'batch-size': { type: 'string', default: '25' },
  },
});
const [command, ...files] = positionals;
const judged = new Set(existsSync(JUDGEMENTS) ? lines(JUDGEMENTS).map((j) => j.key) : []);

function unjudged(paths) {
  if (!paths.length) throw Error('Supply run JSONL files');
  const rows = paths.flatMap(lines),
    seen = new Set(),
    items = [];
  for (const item of judgeItems(rows))
    if (!judged.has(item.key) && !seen.has(item.key)) {
      seen.add(item.key);
      items.push(item);
    }
  return { rows, items };
}

if (command === 'export') {
  const { rows, items } = unjudged(files);
  const size = Number(values['batch-size']);
  if (!Number.isSafeInteger(size) || size < 1) throw Error('Invalid --batch-size');
  rmSync('evals/judge', { recursive: true, force: true });
  mkdirSync('evals/judge', { recursive: true });
  // Repeats of one query land in the same batch, so one judge applies one standard to them.
  items.sort((a, b) => a.payload.query.localeCompare(b.payload.query));
  const pack = (part) =>
    JSON.stringify(
      {
        documents: documentsFor(part, rows),
        items: part.map(({ key, payload }) => ({ key, ...payload })),
      },
      null,
      1,
    ) + '\n';
  writeFileSync(PENDING, pack(items));
  const batches = Math.ceil(items.length / size);
  for (let i = 0; i < batches; i++)
    writeFileSync(
      'evals/judge/batch-' + String(i + 1).padStart(2, '0') + '.json',
      pack(items.slice(i * size, (i + 1) * size)),
    );
  console.log(items.length + ' claims to judge in ' + batches + ' batches → evals/judge/');
} else if (command === 'import') {
  if (!values.model) throw Error('Pass --model with the judging model id, e.g. claude-opus-5-5');
  const [answers] = files;
  if (!answers) throw Error('Supply the answers JSONL file');
  const pending = new Map(
    JSON.parse(readFileSync(PENDING, 'utf8')).items.map(({ key, ...payload }) => [key, payload]),
  );
  const accepted = [],
    errors = [];
  for (const j of lines(answers)) {
    const payload = pending.get(j.key);
    if (!payload) errors.push(j.key + ': not in ' + PENDING);
    else if (judged.has(j.key)) errors.push(j.key + ': already judged');
    else {
      const problems = validateJudgement(j, payload);
      if (problems.length) errors.push(j.key + ': ' + problems.join('; '));
      else {
        judged.add(j.key);
        accepted.push({
          key: j.key,
          judge: 'claude-code',
          model: values.model,
          judgedAt: new Date().toISOString(),
          claimFaithful: j.claimFaithful,
          quotes: j.quotes,
          verdictJustified: j.verdictJustified,
          preferredVerdict: j.preferredVerdict,
          unsupportedFact: j.unsupportedFact,
          namesSettlingDocument: j.namesSettlingDocument,
          reason: j.reason,
          payload,
        });
      }
    }
  }
  // All or nothing: a half-imported batch would be easy to miss.
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  if (accepted.length)
    appendFileSync(JUDGEMENTS, accepted.map((x) => JSON.stringify(x)).join('\n') + '\n');
  console.log('Stored ' + accepted.length + ' judgements in ' + JUDGEMENTS);
} else if (command === 'status') {
  const { items } = unjudged(files);
  console.log(items.length ? items.length + ' claims still unjudged' : 'All claims judged');
} else throw Error('Usage: node evals/judge.mjs export|import|status …');
