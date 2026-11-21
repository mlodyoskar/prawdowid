import assert from 'node:assert/strict';
import test from 'node:test';

import { judgeItem, validateJudgement } from './assessment.mjs';

const row = {
  id: 'A2',
  response: {
    evidence: [{ id: 'doc_1', url: 'https://example.invalid/gis' }],
  },
};
const claim = {
  claim: 'GIS ostrzegł przed kubkiem z porcelany.',
  verdict: 'fałszywe',
  explanation: 'GIS pisze o melaminie.',
  evidenceUse: [{ id: 'doc_1', stance: 'refutes', quote: 'kubka z melaminy' }],
};
const valid = {
  claimFaithful: true,
  quotes: [true],
  verdictJustified: true,
  preferredVerdict: 'fałszywe',
  unsupportedFact: false,
  namesSettlingDocument: null,
  reason: 'Melamine passage refutes porcelain.',
};

test('judge payload carries the query and cited URLs but no case id or gold label', () => {
  const { key, payload } = judgeItem(row, claim);
  assert.match(key, /^[0-9a-f]{16}$/);
  assert.equal(payload.citations[0].url, 'https://example.invalid/gis');
  assert.ok(payload.query.length > 0);
  const text = JSON.stringify(payload);
  assert.ok(!text.includes('A2'));
  assert.ok(!('claims' in payload) && !('gold' in payload));
});

test('a complete judgement passes validation', () => {
  assert.deepEqual(validateJudgement(valid, judgeItem(row, claim).payload), []);
});

test('validation rejects wrong quote count, unknown verdicts and misplaced settling flags', () => {
  const { payload } = judgeItem(row, claim);
  assert.ok(validateJudgement({ ...valid, quotes: [] }, payload).length);
  assert.ok(validateJudgement({ ...valid, preferredVerdict: 'prawda' }, payload).length);
  assert.ok(validateJudgement({ ...valid, namesSettlingDocument: true }, payload).length);
  const abstained = judgeItem(row, { ...claim, verdict: 'brak wystarczających dowodów' }).payload;
  assert.ok(validateJudgement(valid, abstained).length);
  assert.deepEqual(validateJudgement({ ...valid, namesSettlingDocument: false }, abstained), []);
});
