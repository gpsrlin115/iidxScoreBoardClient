import test from 'node:test';
import assert from 'node:assert/strict';

import { isTierDataUsable } from '../src/utils/tierScopeKey.js';

test('a matching key is usable', () => {
  assert.equal(isTierDataUsable('u1:12:SP', 'u1:12:SP', 12), true);
});

test('a mismatched key (e.g. after switching SP -> DP) is not usable', () => {
  // Regression guard: this used to be missing entirely, so a scope switch
  // could show the OLD scope's tier-clear percentage next to the NEW
  // scope's stat numbers until the new fetch happened to land.
  assert.equal(isTierDataUsable('u1:12:SP', 'u1:12:DP', 12), false);
});

test('a different level is not usable', () => {
  assert.equal(isTierDataUsable('u1:11:SP', 'u1:12:SP', 12), false);
});

test('never-fetched (null fetchedKey) is not usable', () => {
  assert.equal(isTierDataUsable(null, 'u1:12:SP', 12), false);
});

test('a failed fetch (fetchedKey left at the OLD scope) is not usable for the new one', () => {
  // tierStore deliberately leaves fetchedKey untouched on error so a failed
  // scope isn't memoized as fetched. That means fetchedKey keeps pointing at
  // whatever scope loaded last -- which must read as "not this scope",
  // not as leftover-but-valid data for the scope that just failed.
  assert.equal(isTierDataUsable('u1:11:SP', 'u1:12:SP', 12), false);
});

test('"all levels" (level === \'\') is always usable, matching or not', () => {
  // Scores.jsx never calls fetchTierData for this case, so fetchedKey can
  // never legitimately equal an all-levels key. Gating here would zero out
  // the tier badge column permanently instead of the existing best-effort
  // behaviour (whatever numeric scope loaded last).
  assert.equal(isTierDataUsable('u1:12:SP', 'u1::SP', ''), true);
  assert.equal(isTierDataUsable(null, 'u1::SP', ''), true);
});
