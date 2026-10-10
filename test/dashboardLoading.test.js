import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const rawTiers = { A: [{ title: 'Review Song', difficulty: 'ANOTHER' }] };
const timeout = () => Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
let dom, vite, Dashboard, auth, scope, tiers, tierApi, scoresApi, root, container;
let statsCalls, refreshCollectedScores;

before(async () => {
  dom = new JSDOM('<body></body>', { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vite = await createServer({ server: { middlewareMode: true, hmr: false } });
  ({ default: Dashboard } = await vite.ssrLoadModule('/src/pages/Dashboard.jsx'));
  ({ useAuthStore: auth } = await vite.ssrLoadModule('/src/store/authStore.js'));
  ({ useScopeStore: scope } = await vite.ssrLoadModule('/src/store/scopeStore.js'));
  ({ default: tiers } = await vite.ssrLoadModule('/src/store/tierStore.js'));
  ({ tierApi } = await vite.ssrLoadModule('/src/api/tiers.js'));
  ({ scoresApi } = await vite.ssrLoadModule('/src/api/scores.js'));
  ({ refreshCollectedScores } = await vite.ssrLoadModule('/src/store/collectionRefresh.js'));
  await vite.ssrLoadModule('/src/store/sessionReset.js');
});

beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  tiers.getState().reset();
  auth.setState({ user: { id: 1 }, isLoading: false });
  scope.setState({ level: 12, playStyle: 'SP' });
  statsCalls = 0;
  scoresApi.getScores = async ({ size }) => {
    if (size !== 1000) statsCalls += 1;
    return { content: [], totalElements: 123 };
  };
  tierApi.getTierData = async () => rawTiers;
  container = document.createElement('div');
  document.body.replaceChildren(container);
  root = createRoot(container);
});

after(async () => {
  if (root) await act(async () => root.unmount());
  await vite?.close();
  dom?.window.close();
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const mount = () => act(async () => {
  root.render(createElement(MemoryRouter, null, createElement(Dashboard)));
});
const text = () => container.textContent;
const retry = () => act(async () => {
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent === '다시 시도');
  assert.ok(button);
  button.click();
});

test('initial render waits for tiers and retains the existing successful layout', async () => {
  const pending = deferred();
  tierApi.getTierData = () => pending.promise;
  await mount();
  assert.equal(text(), 'Loading...');
  await act(async () => pending.resolve(rawTiers));
  assert.match(text(), /play count123/);
  assert.match(text(), /서열표 1단, 총 1곡/);
  assert.ok(text().indexOf('tier table progress') < text().indexOf('클리어 분포'));
  assert.ok(text().indexOf('클리어 분포') < text().indexOf('최고 기록'));
});

test('statistics errors surface immediately while tiers are still pending', async () => {
  tierApi.getTierData = () => new Promise(() => {});
  scoresApi.getScores = async () => {
    throw Object.assign(new Error('failed'), { response: { status: 500 } });
  };
  await mount();
  assert.match(text(), /HTTP 500/);
  assert.match(text(), /다시 시도/);
  assert.doesNotMatch(text(), /Loading/);
});

for (const stage of ['tiers', 'scores']) {
  test(`${stage} timeout shows partial content and retry does not hide statistics`, async () => {
    const pending = deferred();
    if (stage === 'tiers') tierApi.getTierData = () => pending.promise;
    else {
      const original = scoresApi.getScores;
      scoresApi.getScores = (params) => params.size === 1000 ? pending.promise : original(params);
    }
    await mount();
    await act(async () => pending.reject(timeout()));
    assert.match(text(), /play count123/);
    assert.match(text(), /요청 시간이 초과/);
    assert.doesNotMatch(text(), /cleared ·|서열표 0단/);
    assert.equal(tiers.getState().fetchedKey, null);
    const calls = statsCalls;
    const retried = deferred();
    tierApi.getTierData = () => retried.promise;
    scoresApi.getScores = async ({ size }) => {
      if (size !== 1000) statsCalls += 1;
      return { content: [], totalElements: 123 };
    };
    await retry();
    assert.match(text(), /play count123/);
    assert.match(text(), /서열표를 불러오는 중/);
    await act(async () => retried.resolve(rawTiers));
    assert.match(text(), /서열표 1단, 총 1곡/);
    assert.doesNotMatch(text(), /요청 시간이 초과/);
    assert.equal(statsCalls, calls);
  });
}

test('cached current-scope tiers survive refresh failure alongside the error', async () => {
  await mount();
  tierApi.getTierData = async () => { throw timeout(); };
  await act(async () => tiers.getState().fetchTierData(12, 'SP', { force: true }));
  assert.match(text(), /서열표 1단, 총 1곡/);
  assert.match(text(), /요청 시간이 초과/);
  assert.match(text(), /play count123/);
});

test('403 tier failure has no retry action and an empty success is not an error', async () => {
  tierApi.getTierData = async () => {
    throw Object.assign(new Error('forbidden'), { response: { status: 403 } });
  };
  await mount();
  assert.match(text(), /HTTP 403/);
  assert.doesNotMatch(text(), /다시 시도|cleared ·/);
  tierApi.getTierData = async () => ({});
  await act(async () => tiers.getState().fetchTierData(12, 'SP', { force: true }));
  assert.match(text(), /서열표 0단, 총 0곡/);
  assert.equal(container.querySelector('[role="alert"]'), null);
});

test('late responses cannot restore a previous scope or user', async () => {
  const oldScope = deferred();
  tierApi.getTierData = (_level, style) => style === 'SP' ? oldScope.promise : Promise.resolve(rawTiers);
  await mount();
  await act(async () => scope.getState().setPlayStyle('DP'));
  assert.match(text(), /☆12 DP/);
  await act(async () => oldScope.resolve({ OLD: [] }));
  assert.equal(tiers.getState().fetchedKey, '1:12:DP');
  assert.match(text(), /서열표 1단/);
  const oldUser = deferred();
  tierApi.getTierData = () => oldUser.promise;
  await act(async () => { tiers.getState().fetchTierData(12, 'DP', { force: true }); });
  tierApi.getTierData = async () => ({});
  await act(async () => auth.getState().setUser({ id: 2 }));
  await act(async () => oldUser.resolve(rawTiers));
  assert.equal(tiers.getState().fetchedKey, '2:12:DP');
  assert.match(text(), /서열표 0단/);
});


test('collection refresh reloads statistics and tiers and ignores another user', async () => {
  let tierCalls = 0;
  tierApi.getTierData = async () => { tierCalls += 1; return rawTiers; };
  await mount();
  const initialStats = statsCalls;
  const initialTiers = tierCalls;
  await act(async () => refreshCollectedScores(2));
  assert.equal(statsCalls, initialStats);
  assert.equal(tierCalls, initialTiers);
  scoresApi.getScores = async ({ size }) => {
    if (size !== 1000) statsCalls += 1;
    return { content: [], totalElements: 456 };
  };
  await act(async () => refreshCollectedScores(1));
  assert.equal(statsCalls, initialStats + 6);
  assert.equal(tierCalls, initialTiers + 1);
  assert.match(text(), /play count456/);
  assert.equal(tiers.getState().fetchedKey, '1:12:SP');
});

for (const trigger of ['collection', 'scope', 'user']) {
  test(`late statistics cannot overwrite a newer ${trigger} result`, async () => {
    const stale = deferred();
    scoresApi.getScores = ({ size }) => size === 1000
      ? Promise.resolve({ content: [], totalElements: 0 }) : stale.promise;
    await mount();
    scoresApi.getScores = async () => ({ content: [], totalElements: 456 });
    await act(async () => {
      if (trigger === 'collection') refreshCollectedScores(1);
      if (trigger === 'scope') scope.getState().setPlayStyle('DP');
      if (trigger === 'user') auth.getState().setUser({ id: 2 });
    });
    assert.match(text(), /play count456/);
    await act(async () => stale.resolve({ content: [], totalElements: 999 }));
    assert.match(text(), /play count456/);
    assert.doesNotMatch(text(), /play count999/);
  });
}
