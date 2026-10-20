import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { createServer } from 'vite';

let dom, vite, useScores, auth, scope, scoresStore, scoresApi, refresh, root, container;
let calls;
const result = (id) => ({ content: [{ id, bestScore: id }], totalElements: 1 });

function Probe() {
  const current = useScores();
  return createElement('div', { 'data-loading': String(current.isLoading) },
    current.scores.map((score) => score.id).join(','));
}

before(async () => {
  dom = new JSDOM('<body></body>', { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vite = await createServer({ server: { middlewareMode: true, hmr: false } });
  ({ default: useScores } = await vite.ssrLoadModule('/src/hooks/useScores.js'));
  ({ useAuthStore: auth } = await vite.ssrLoadModule('/src/store/authStore.js'));
  ({ useScopeStore: scope } = await vite.ssrLoadModule('/src/store/scopeStore.js'));
  ({ useScoresStore: scoresStore } = await vite.ssrLoadModule('/src/store/scoresStore.js'));
  ({ scoresApi } = await vite.ssrLoadModule('/src/api/scores.js'));
  ({ refreshCollectedScores: refresh } = await vite.ssrLoadModule('/src/store/collectionRefresh.js'));
});

beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  auth.setState({ user: { id: 1 }, isLoading: false });
  scope.setState({ level: 12, playStyle: 'SP' });
  scoresStore.getState().resetFilters();
  calls = 0;
  scoresApi.getScores = async () => { calls += 1; return result(1); };
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

const mount = () => act(async () => root.render(createElement(Probe)));

test('collection refresh reloads mounted scores only for the current user', async () => {
  await mount();
  assert.equal(container.textContent, '1');
  await act(async () => refresh(2));
  assert.equal(calls, 1);
  scoresApi.getScores = async () => { calls += 1; return result(2); };
  await act(async () => refresh(1));
  assert.equal(calls, 2);
  assert.equal(container.textContent, '2');
  assert.equal(container.firstChild.getAttribute('data-loading'), 'false');
});

for (const trigger of ['collection', 'scope']) {
  test(`late scores cannot overwrite the newer ${trigger} result`, async () => {
    let resolveStale;
    const stale = new Promise((resolve) => { resolveStale = resolve; });
    scoresApi.getScores = () => stale;
    await mount();
    scoresApi.getScores = async () => result(2);
    await act(async () => {
      if (trigger === 'collection') refresh(1);
      else scope.getState().setPlayStyle('DP');
    });
    assert.equal(container.textContent, '2');
    await act(async () => resolveStale(result(1)));
    assert.equal(container.textContent, '2');
    assert.equal(container.firstChild.getAttribute('data-loading'), 'false');
  });
}
