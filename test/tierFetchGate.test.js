import test from 'node:test';
import assert from 'node:assert/strict';

import { createTierFetchGate } from '../src/utils/tierFetchGate.js';

/**
 * Thin stand-in for tierStore.fetchTierData's control flow: enter the gate,
 * park the request, and settle it when its response "arrives". It mirrors the
 * store's branches exactly so a sequence of user actions can be replayed here.
 */
const createScreen = () => {
  const gate = createTierFetchGate();
  const pending = new Map();
  let store = { fetchedKey: null, isLoading: false, error: null };

  const request = (key, { force = false } = {}) => {
    const { decision, requestId } = gate.enter({
      force, key, fetchedKey: store.fetchedKey, hasError: Boolean(store.error),
    });

    if (decision === 'join-inflight') return decision;
    if (decision === 'serve-cache') {
      if (store.isLoading) store = { ...store, isLoading: false };
      return decision;
    }

    store = { ...store, isLoading: true, error: null };
    pending.set(key, { requestId, key });
    return decision;
  };

  const land = (key, { fails = false } = {}) => {
    const req = pending.get(key);
    assert.ok(req, `no request in flight for ${key}`);
    pending.delete(key);
    try {
      if (!gate.isCurrent(req.requestId)) return; // stale -> discarded
      store = fails
        ? { ...store, isLoading: false, error: { status: 500 } }
        : { fetchedKey: key, isLoading: false, error: null };
    } finally {
      gate.settle(req.requestId);
    }
  };

  return { request, land, gate, state: () => store, inFlightCount: () => pending.size };
};

test('a cold scope fetches, and a settled one is served from cache', () => {
  const s = createScreen();
  assert.equal(s.request('u1:12:SP'), 'fetch');
  s.land('u1:12:SP');
  assert.equal(s.request('u1:12:SP'), 'serve-cache');
  assert.equal(s.state().isLoading, false);
});

test('an empty tier table still counts as settled and is not re-requested', () => {
  // fetchedKey is written on every successful settle, including one that
  // produced zero tiers. Gating on row count would re-request forever.
  const s = createScreen();
  s.request('u1:12:SP');
  s.land('u1:12:SP');
  assert.equal(s.request('u1:12:SP'), 'serve-cache');
});

test('a stored error defeats the cache so retry actually retries', () => {
  const s = createScreen();
  s.request('u1:12:SP');
  s.land('u1:12:SP', { fails: true });
  assert.equal(s.request('u1:12:SP'), 'fetch');
});

test('a different user id in the key defeats the cache', () => {
  const s = createScreen();
  s.request('u1:12:SP');
  s.land('u1:12:SP');
  assert.equal(s.request('u2:12:SP'), 'fetch');
});

test('the ☆12 -> slow ☆11 -> ☆12 round trip clears the spinner', () => {
  const s = createScreen();
  s.request('u1:12:SP');
  s.land('u1:12:SP');

  assert.equal(s.request('u1:11:SP'), 'fetch');   // slow, still in flight
  assert.equal(s.state().isLoading, true);

  assert.equal(s.request('u1:12:SP'), 'serve-cache');
  assert.equal(s.state().isLoading, false, 'the orphaned ☆11 spinner must be cleared here');

  s.land('u1:11:SP');                             // arrives stale, discarded
  assert.equal(s.state().fetchedKey, 'u1:12:SP');
  assert.equal(s.state().isLoading, false);
});

test('a scope whose request was superseded can still be loaded afterwards', () => {
  // Regression guard for the reported "tier table never loads" bug. The
  // in-flight slot used to be freed only while the request was still
  // current, so a superseded ☆11 leaked its slot forever and every later
  // ☆11 entry "joined" a request that no longer existed: no spinner, no
  // data, no request on the wire.
  const s = createScreen();
  s.request('u1:12:SP');
  s.land('u1:12:SP');

  s.request('u1:11:SP');            // becomes stale at the next line
  s.request('u1:12:SP');            // serve-cache, supersedes ☆11
  s.land('u1:11:SP');               // stale arrival

  assert.equal(s.request('u1:11:SP'), 'fetch', 'must start a real request, not join a dead one');
  assert.equal(s.inFlightCount(), 1);
  s.land('u1:11:SP');
  assert.equal(s.state().fetchedKey, 'u1:11:SP');
  assert.equal(s.state().isLoading, false);
});

test('rapid SP/DP flipping still lands on the last selection', () => {
  const s = createScreen();
  s.request('u1:12:SP');
  s.request('u1:12:DP');
  s.request('u1:12:SP');

  s.land('u1:12:DP');               // out of order, and stale
  s.land('u1:12:SP');

  assert.equal(s.state().fetchedKey, 'u1:12:SP');
  assert.equal(s.state().isLoading, false);
});

test('two screens entering the same scope share one request', () => {
  const s = createScreen();
  assert.equal(s.request('u1:12:SP'), 'fetch');
  assert.equal(s.request('u1:12:SP'), 'join-inflight');
  assert.equal(s.inFlightCount(), 1);
});

test('a forced refresh survives a same-scope re-entry', () => {
  // The CSV import case: force is in flight and any screen re-entering the
  // scope must ride along rather than cancel it.
  const s = createScreen();
  s.request('u1:12:SP');
  s.land('u1:12:SP');

  assert.equal(s.request('u1:12:SP', { force: true }), 'fetch');
  assert.equal(s.request('u1:12:SP'), 'join-inflight');

  s.land('u1:12:SP');
  assert.equal(s.state().fetchedKey, 'u1:12:SP');
  assert.equal(s.state().isLoading, false);
});

test('force never joins and never serves cache', () => {
  const s = createScreen();
  s.request('u1:12:SP');
  assert.equal(s.request('u1:12:SP', { force: true }), 'fetch');
});

test('identity change invalidates the request already on the wire', () => {
  const s = createScreen();
  s.request('u1:12:SP');
  s.gate.invalidateAll();           // what tierStore.reset() calls
  s.land('u1:12:SP');
  assert.equal(s.state().fetchedKey, null, "the previous user's response must not land");
});

test('after an identity change the new user can load the same scope', () => {
  const s = createScreen();
  s.request('u1:12:SP');
  s.gate.invalidateAll();
  s.land('u1:12:SP');

  assert.equal(s.request('u2:12:SP'), 'fetch');
  s.land('u2:12:SP');
  assert.equal(s.state().fetchedKey, 'u2:12:SP');
});
