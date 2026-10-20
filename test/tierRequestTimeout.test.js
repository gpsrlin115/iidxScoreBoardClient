import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { once } from 'node:events';
import axios from 'axios';
import { createServer } from 'vite';

let vite, server, client, store, auth, tierApi, scoresApi;
let hangStage, heldResponse, arrival, requests;
let accelerate = true;
const payload = [{ title: 'Fixture', difficulty: 'ANOTHER', tier: 'A', category: 'CLEAR' }];
const send = (response, body) => {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
};

before(async () => {
  globalThis.document = { cookie: '' };
  server = createHttpServer((request, response) => {
    const stage = request.url.startsWith('/tiers/') ? 'tiers' : 'scores';
    if (stage === hangStage) {
      heldResponse = response;
      arrival?.();
      return;
    }
    send(response, stage === 'tiers' ? payload : { content: [] });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  vite = await createServer({ server: { middlewareMode: true, hmr: false } });
  ({ default: client } = await vite.ssrLoadModule('/src/api/client.js'));
  ({ default: store } = await vite.ssrLoadModule('/src/store/tierStore.js'));
  ({ useAuthStore: auth } = await vite.ssrLoadModule('/src/store/authStore.js'));
  ({ tierApi } = await vite.ssrLoadModule('/src/api/tiers.js'));
  ({ scoresApi } = await vite.ssrLoadModule('/src/api/scores.js'));
  client.defaults.baseURL = `http://127.0.0.1:${server.address().port}`;
  const transport = axios.getAdapter('http');
  client.defaults.adapter = (config) => {
    requests.push({ url: config.url, timeout: config.timeout, params: config.params });
    // Assert the production budget before shortening the real HTTP timeout.
    if (accelerate) assert.equal(config.timeout, 10_000);
    return transport({ ...config, timeout: accelerate ? 500 : config.timeout, proxy: false });
  };
});

beforeEach(() => {
  store.getState().reset();
  auth.getState().setUser({ id: 'first' });
  hangStage = null;
  heldResponse = null;
  arrival = null;
  requests = [];
  accelerate = true;
});

after(async () => {
  await vite?.close();
  server?.closeAllConnections();
  await new Promise((resolve) => server?.close(resolve));
  delete globalThis.document;
});

const fetch = (level = 12, style = 'SP', options) => store.getState().fetchTierData(level, style, options);
const state = () => store.getState();
const waitForRequest = () => new Promise((resolve) => { arrival = resolve; });

for (const stage of ['tiers', 'scores']) {
  test(`${stage} timeout clears loading, leaves no success cache, and releases the slot for retry`, async (t) => {
    t.mock.method(console, 'error', () => {});
    hangStage = stage;
    await fetch();
    assert.equal(state().isLoading, false);
    assert.equal(state().fetchedKey, null);
    assert.equal(state().error.code, 'ECONNABORTED');
    assert.equal(state().error.retryable, true);
    assert.match(state().error.message, /시간이 초과/);
    assert.equal(requests.length, stage === 'tiers' ? 1 : 2);
    hangStage = null;
    await fetch(12, 'SP', { force: true });
    assert.equal(state().error, null);
    assert.equal(state().fetchedKey, 'first:12:SP');
    assert.equal(state().isLoading, false);
    assert.equal(state().enrichedTierData[0].songs[0].title, 'Fixture');
    assert.equal(requests.length, stage === 'tiers' ? 3 : 4);
  });
}

test('same-scope cached rows survive a forced refresh timeout and are usable on retry', async (t) => {
  t.mock.method(console, 'error', () => {});
  await fetch();
  const cached = state().enrichedTierData;
  hangStage = 'scores';
  await fetch(12, 'SP', { force: true });
  assert.equal(state().fetchedKey, 'first:12:SP');
  assert.equal(state().enrichedTierData, cached);
  assert.equal(state().error.code, 'ECONNABORTED');
  hangStage = null;
  await fetch(12, 'SP', { force: true });
  assert.equal(state().error, null);
  assert.equal(state().fetchedKey, 'first:12:SP');
});

test('an old scope timeout does not erase a newer successful scope', async (t) => {
  t.mock.method(console, 'error', () => {});
  hangStage = 'tiers';
  const arrived = waitForRequest();
  const oldRequest = fetch(12, 'SP');
  await arrived;
  hangStage = null;
  await fetch(11, 'DP');
  await oldRequest;
  assert.equal(state().fetchedKey, 'first:11:DP');
  assert.equal(state().error, null);
  assert.equal(state().isLoading, false);
});

test('reset rejects a late response from the previous user', async () => {
  hangStage = 'tiers';
  const arrived = waitForRequest();
  const oldRequest = fetch();
  await arrived;
  const staleResponse = heldResponse;
  store.getState().reset();
  auth.getState().setUser({ id: 'second' });
  hangStage = null;
  await fetch();
  send(staleResponse, payload);
  await oldRequest;
  assert.equal(state().fetchedKey, 'second:12:SP');
  assert.equal(state().error, null);
  assert.equal(state().isLoading, false);
  assert.equal(requests.length, 3);
});

test('optional API timeout preserves existing calls and score parameter filtering', async () => {
  accelerate = false;
  await tierApi.getTierData(12, 'SP');
  await scoresApi.getScores({ level: 12, playStyle: '', clearType: null });
  assert.equal(requests[0].timeout, 0);
  assert.equal(requests[1].timeout, 0);
  assert.deepEqual(requests[1].params, { level: 12 });
  await tierApi.getTierData(11, 'DP', { timeout: 1234 });
  await scoresApi.getScores({}, { timeout: 2345 });
  assert.equal(requests[2].timeout, 1234);
  assert.equal(requests[3].timeout, 2345);
});