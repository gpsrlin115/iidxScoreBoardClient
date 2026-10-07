import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

import { classifyRivalError } from '../src/utils/rivalCrawler.js';

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

// Synthetic values; they only need to be recognisable inside a serialised error.
const ATTEMPT_ID = '3f2a9c1e-8b4d-4e6f-9a1b-2c3d4e5f6a7b';
const IIDX_ID = '4321-8765';
const REGISTRATION_PATH = '/crawler/iidx/bookmarklet/me';

test('registration calls send exactly the contract bodies with credentials and CSRF', async () => {
  const calls = [];
  client.defaults.adapter = async (config) => {
    calls.push(config);
    return { status: config.method === 'delete' ? 204 : 200, data: config.method === 'delete' ? undefined : { status: 'PENDING' },
      headers: {}, config };
  };
  const stray = { attemptId: 'stray-attempt', iidxId: '0000-0000', extra: true };
  const controller = new AbortController();
  await api.startRegistration();
  await api.getRegistration();
  await api.completeRegistration(ATTEMPT_ID, IIDX_ID, { signal: controller.signal, ...stray });
  await api.cancelRegistration(ATTEMPT_ID, { signal: controller.signal, ...stray });
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((config) => [config.method, config.url]), [
    ['post', REGISTRATION_PATH],
    ['get', REGISTRATION_PATH],
    ['post', `${REGISTRATION_PATH}/complete`],
    ['delete', REGISTRATION_PATH],
  ]);
  for (const config of calls) {
    assert.equal(config.withCredentials, true);
    assert.equal(config.headers.get('X-XSRF-TOKEN'), 'fixture csrf');
  }
  assert.equal(calls[0].data, undefined, 'start has no body');
  assert.equal(calls[1].data, undefined, 'GET has no body');
  const complete = JSON.parse(calls[2].data);
  assert.deepEqual(complete, { attemptId: ATTEMPT_ID, iidxId: IIDX_ID });
  assert.equal(Object.keys(complete).length, 2);
  const cancel = JSON.parse(calls[3].data);
  assert.deepEqual(cancel, { attemptId: ATTEMPT_ID });
  assert.equal(Object.keys(cancel).length, 1);
  assert.match(calls[2].headers.get('Content-Type'), /application\/json/);
  assert.match(calls[3].headers.get('Content-Type'), /application\/json/);
  assert.equal(calls[2].signal, controller.signal, 'caller options reach axios but never the body');
});

const registrationCalls = [
  ['startRegistration', () => api.startRegistration()],
  ['getRegistration', () => api.getRegistration()],
  ['completeRegistration', () => api.completeRegistration(ATTEMPT_ID, IIDX_ID)],
  ['cancelRegistration', () => api.cancelRegistration(ATTEMPT_ID)],
];

test('a failed registration request rejects without the request config, attemptId, or IIDX ID', async () => {
  client.defaults.adapter = async (config) => {
    const error = new Error('fixture conflict');
    error.config = config;
    error.request = { path: config.url, body: config.data };
    error.response = { status: 409, data: { code: 'REGISTRATION_SUPERSEDED', message: 'fixture' }, headers: {}, config };
    throw error;
  };
  for (const [name, run] of registrationCalls) {
    await assert.rejects(run(), (error) => {
      assert.equal(error.config, undefined, name);
      assert.equal(error.request, undefined, name);
      assert.equal(error.response.config, undefined, name);
      assert.equal(error.response.status, 409, name);
      assert.equal(error.response.data.code, 'REGISTRATION_SUPERSEDED', name);
      const serialised = JSON.stringify(error);
      assert.ok(!serialised.includes(ATTEMPT_ID), `${name} leaked the attemptId`);
      assert.ok(!serialised.includes(IIDX_ID), `${name} leaked the IIDX ID`);
      return true;
    });
  }
});

test('a registration request that gets no response rejects without config and reads as a lost response', async () => {
  client.defaults.adapter = async (config) => {
    const error = new Error('Network Error');
    error.code = 'ERR_NETWORK';
    error.config = config;
    error.request = { body: config.data };
    throw error;
  };
  for (const [name, run] of registrationCalls) {
    await assert.rejects(run(), (error) => {
      assert.equal(error.config, undefined, name);
      assert.equal(error.request, undefined, name);
      assert.equal(error.response, undefined, name);
      assert.equal(error.code, 'ERR_NETWORK', name);
      assert.ok(!JSON.stringify(error).includes(ATTEMPT_ID), name);
      assert.equal(classifyRivalError(error, 'complete').responseLost, true, name);
      return true;
    });
  }
});

test('a 401 inside the bookmarklet popup clears the user without redirecting to the login page', async () => {
  const { handleSessionExpired } = await vite.ssrLoadModule('/src/api/sessionExpiry.js');
  const { setNavigator } = await vite.ssrLoadModule('/src/utils/navigation.js');
  const previousWindow = globalThis.window;
  const navigations = [];
  setNavigator((to) => navigations.push(to));
  try {
    globalThis.window = { location: { pathname: '/crawler/iidx-link' } };
    auth.getState().setUser({ id: 9 });
    handleSessionExpired('/crawler/iidx/bookmarklet/me', 'SITE_LOGIN_REQUIRED');
    assert.equal(auth.getState().user, null);
    assert.deepEqual(navigations, [], 'the popup keeps its own sign-in notice');

    // Control: the same 401 on the import screen still goes to /login.
    globalThis.window = { location: { pathname: '/import/csv' } };
    auth.getState().setUser({ id: 9 });
    handleSessionExpired('/crawler/iidx/bookmarklet/me', 'SITE_LOGIN_REQUIRED');
    assert.equal(auth.getState().user, null);
    assert.deepEqual(navigations, ['/login']);
  } finally {
    setNavigator(null);
    globalThis.window = previousWindow;
  }
});
