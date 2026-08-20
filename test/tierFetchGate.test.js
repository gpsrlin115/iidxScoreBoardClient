import test from 'node:test';
import assert from 'node:assert/strict';

import { decideTierFetch } from '../src/utils/tierFetchGate.js';

const gate = (overrides) => decideTierFetch({
  requestedKey: '7:12:SP',
  fetchedKey: null,
  inFlightKey: null,
  ...overrides,
});

test('a cold scope goes to the network', () => {
  assert.equal(gate({}), 'fetch');
});

test('a settled scope is served from cache', () => {
  assert.equal(gate({ fetchedKey: '7:12:SP' }), 'serve-cache');
});

test('an empty tier table is still "settled" and is not re-requested', () => {
  // fetchedKey is written on every successful settle, including one that
  // produced zero tiers. Gating on row count instead would loop forever.
  assert.equal(gate({ fetchedKey: '7:12:SP' }), 'serve-cache');
});

test('a different scope than the cached one goes to the network', () => {
  assert.equal(gate({ fetchedKey: '7:11:SP' }), 'fetch');
});

test('a stored error defeats the cache so retry actually retries', () => {
  assert.equal(gate({ fetchedKey: '7:12:SP', hasError: true }), 'fetch');
});

test('re-entering a scope already in flight rides along', () => {
  // Regression guard: this used to bump the request counter, which killed
  // the in-flight request. When that request was a CSV import's forced
  // refresh, the newly imported clear lamps never landed.
  assert.equal(gate({ inFlightKey: '7:12:SP' }), 'join-inflight');
});

test('force always hits the network, even over an in-flight or cached scope', () => {
  assert.equal(gate({ force: true, inFlightKey: '7:12:SP' }), 'fetch');
  assert.equal(gate({ force: true, fetchedKey: '7:12:SP' }), 'fetch');
});

test('a request in flight for a DIFFERENT scope does not block this one', () => {
  assert.equal(gate({ inFlightKey: '7:11:SP' }), 'fetch');
});

test('the ☆12 -> slow ☆11 -> ☆12 round trip ends on the cache path', () => {
  // Step 3 of the race: ☆11 is still in flight, ☆12 is cached. The caller
  // must both invalidate ☆11 and clear the spinner ☆11 turned on -- which
  // is exactly what 'serve-cache' signals.
  assert.equal(gate({ fetchedKey: '7:12:SP', inFlightKey: '7:11:SP' }), 'serve-cache');
});

test('a different user id in the key defeats the cache', () => {
  assert.equal(gate({ fetchedKey: '8:12:SP' }), 'fetch');
});
