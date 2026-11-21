import assert from 'node:assert/strict';
import { test } from 'node:test';

import { estimateCostUsd } from './cost.ts';

const price = { inputPerMTok: 1, outputPerMTok: 5 };

test('liczy koszt z tokenów wejścia i wyjścia', () => {
  const usage = { inputTokens: 10_000, outputTokens: 2_000, totalTokens: 12_000 };
  assert.equal(estimateCostUsd(usage, price), 0.02);
});

test('brak cennika lub tokenów oznacza nieznany koszt, nie zero', () => {
  const usage = { inputTokens: 10_000, outputTokens: 2_000, totalTokens: 12_000 };
  assert.equal(estimateCostUsd(usage, null), undefined);
  assert.equal(estimateCostUsd(null, price), undefined);
  const empty = { inputTokens: undefined, outputTokens: undefined, totalTokens: undefined };
  assert.equal(estimateCostUsd(empty, price), undefined);
});
