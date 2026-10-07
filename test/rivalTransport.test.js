import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let vite;
let api;
let client;
let auth;
let tiers;
let revision;
let invalidate;
let previousDocument;
const captured = [];

before(async () => {
  previousDocument = globalThis.document;
  globalThis.document = { cookie: 'XSRF-TOKEN=fixture%20csrf' };
  vite = await createServer({ server: { middlewareMode: true, hmr: false } });
  ({ default: client } = await vite.ssrLoadModule('/src/api/client.js'));
  ({ rivalCrawlerApi: api } = await vite.ssrLoadModule('/src/api/rivalCrawler.js'));
  ({ useAuthStore: auth } = await vite.ssrLoadModule('/src/store/authStore.js'));
  ({ default: tiers } = await vite.ssrLoadModule('/src/store/tierStore.js'));
  ({ useScoreRefreshStore: revision } = await vite.ssrLoadModule('/src/store/scoreRefreshStore.js'));
  ({ refreshCollectedScores: invalidate } = await vite.ssrLoadModule('/src/store/collectionRefresh.js'));
});
after(async () => {
  globalThis.document = previousDocument;
  await vite?.close();
});

test('real API adapter reuses credentials and CSRF for verification, bodyless enqueue, and DELETEs', async () => {
  client.defaults.adapter = async (config) => {
    captured.push(config);
    return { status: config.method === 'delete' && config.url.endsWith('iidx/me') ? 204 : 200,
      data: config.method === 'delete' ? undefined : { verified: true }, headers: {}, config };
  };
  await api.verify('synthetic-test-cookie');
  await api.enqueue();
  await api.cancel();
  assert.equal(await api.unlink(), undefined);
  assert.equal(captured.length, 4);
  for (const config of captured) {
    assert.equal(config.withCredentials, true);
    assert.equal(config.headers.get('X-XSRF-TOKEN'), 'fixture csrf');
    assert.ok(['/crawler/iidx/me', '/crawler/rival/jobs/me'].includes(config.url));
  }
  assert.deepEqual(JSON.parse(captured[0].data), { eagateCookie: 'synthetic-test-cookie' });
  assert.equal(captured[1].data, undefined);
  assert.equal(captured[2].data, undefined);
  assert.equal(captured[3].data, undefined);
});

test('502 verification leaves site auth intact and strips request credentials from the rejection', async () => {
  auth.getState().setUser({ id: 1 });
  client.defaults.adapter = async (config) => {
    const error = new Error('fixture upstream failure');
    error.config = config;
    error.response = { status: 502, data: { error: 'UPSTREAM_FAILURE', message: 'fixture' }, headers: {}, config };
    throw error;
  };
  await assert.rejects(api.verify('synthetic-test-cookie'), (error) => {
    assert.equal(error.config, undefined);
    assert.equal(error.request, undefined);
    assert.equal(error.response.config, undefined);
    assert.equal(error.appError, undefined);
    assert.ok(!JSON.stringify(error).includes('synthetic-test-cookie'));
    return true;
  });
  assert.equal(auth.getState().user.id, 1);
});

test('terminal cache invalidation clears actual joined records and signals score queries only for the owner', () => {
  auth.getState().setUser({ id: 1 });
  const originalScore = { bestMissCount: 7, lastMissCount: null };
  tiers.setState({ userScores: [originalScore], fetchedKey: '1:12:SP', enrichedTierData: [{ songs: [originalScore] }] });
  const beforeRevision = revision.getState().revision;
  invalidate(1);
  assert.equal(tiers.getState().fetchedKey, null);
  assert.deepEqual(tiers.getState().userScores, []);
  assert.equal(revision.getState().revision, beforeRevision + 1);
  assert.equal(originalScore.bestMissCount, 7);
  assert.equal(originalScore.lastMissCount, null);
  auth.getState().setUser({ id: 2 });
  invalidate(1);
  assert.equal(revision.getState().revision, beforeRevision + 1);
});
