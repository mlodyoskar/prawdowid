import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FixedWindowLimiter, hashClientKey } from './rate-limit.ts';

test('okno się resetuje i stare wpisy są czyszczone', () => {
  let now = 0;
  const limiter = new FixedWindowLimiter({ limit: 2, windowMs: 1000, now: () => now });
  assert.equal(limiter.hit('a').allowed, true);
  assert.equal(limiter.hit('a').allowed, true);
  const third = limiter.hit('a');
  assert.ok(!third.allowed && third.retryAfterSec === 1);
  now = 1001;
  assert.equal(limiter.hit('b').allowed, true); // sprzątanie usuwa wygasły wpis „a”
  assert.equal(limiter.size, 1);
  assert.equal(limiter.hit('a').allowed, true);
});

test('hashClientKey nie zdradza IP', () => {
  assert.match(hashClientKey('1.2.3.4'), /^[0-9a-f]{12}$/);
  assert.notEqual(hashClientKey('1.2.3.4'), hashClientKey('1.2.3.5'));
});
