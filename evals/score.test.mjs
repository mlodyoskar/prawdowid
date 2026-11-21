import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { gold, lines, score } from './score.mjs';
test('gold cases have replayable evidence, valid image inputs and same-split controls', () => {
  const docs = new Map(
    lines('data/corpus/snapshot.jsonl').map((d) => [
      d.url,
      d.fragmenty.map((f) => f.tekst).join(' '),
    ]),
  );
  for (const recording of Object.values(
    JSON.parse(readFileSync('evals/fixtures/factchecks.json', 'utf8')),
  ))
    for (const h of recording.items) docs.set(h.url, h.excerpt + ' ' + h.rating);
  assert.equal(gold.size, lines('evals/cases.jsonl').length);
  for (const c of gold.values()) {
    if (c.baseline) {
      const base = gold.get(c.baseline);
      assert.equal(base.heldOut, c.heldOut);
      assert.deepEqual(base.claims, c.claims);
    }
    if (c.image)
      assert.equal(
        readFileSync('evals/' + c.image)
          .subarray(1, 4)
          .toString(),
        'PNG',
      );
    for (const label of c.claims)
      if (label.url)
        assert.ok(docs.get(label.url)?.toLowerCase().includes(label.phrase.toLowerCase()), c.id);
  }
});
test('a missing claim is a false negative and an unrelated retrieved source earns no citation credit', () => {
  const [label] = gold.get('A1').claims;
  const row = {
    id: 'A1',
    channel: 'direct',
    round: 1,
    elapsedMs: 60,
    costUsd: null,
    response: { status: 'error' },
    metrics: {},
  };
  const ok = {
    ...row,
    round: 2,
    response: {
      status: 'ok',
      claims: [{ verdict: label.verdict, evidenceIds: [] }],
      evidence: [{ id: 'unrelated', url: label.url }],
    },
  };
  const result = score([row, ok]);
  assert.equal(result['Macro-F1'], '0.667');
  assert.match(result['Expected URL'], /^0\/2/);
  assert.match(result['Verified quote'], /^0\/1/);
});
