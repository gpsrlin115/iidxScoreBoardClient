import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { JSDOM } from 'jsdom';
import { createElement, act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createServer } from 'vite';

let dom, vite, root, useScores, auth, scope, filters, api, refresh, current, requests, seriesRequests;
let getScoresTransport, getSeriesTransport;
const oldFlag = process.env.VITE_ENABLE_SCORE_BROWSER_V2;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const result = (id, totalElements = 1) => ({ content: [{ id }], totalElements });
function Probe() {
  const value = useScores();
  useEffect(() => { current = value; }, [value]);
  return createElement('div', null, value.scores.length);
}

before(async () => {
  process.env.VITE_ENABLE_SCORE_BROWSER_V2 = '1';
  dom = new JSDOM('<body></body>', { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  ({ default: useScores } = await vite.ssrLoadModule('/src/hooks/useScores.js'));
  ({ useAuthStore: auth } = await vite.ssrLoadModule('/src/store/authStore.js'));
  ({ useScopeStore: scope } = await vite.ssrLoadModule('/src/store/scopeStore.js'));
  ({ useScoresStore: filters } = await vite.ssrLoadModule('/src/store/scoresStore.js'));
  ({ scoresApi: api } = await vite.ssrLoadModule('/src/api/scores.js'));
  getScoresTransport = api.getScores;
  getSeriesTransport = api.getSeries;
  ({ refreshCollectedScores: refresh } = await vite.ssrLoadModule('/src/store/collectionRefresh.js'));
});
beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  auth.setState({ user: { id: 1 }, isLoading: false });
  scope.setState({ level: 12, playStyle: 'SP' });
  filters.getState().resetFilters();
  requests = [];
  seriesRequests = [];
  api.getScores = async (params, options) => { requests.push({ params, ...options }); return result(1); };
  api.getSeries = async (...args) => { seriesRequests.push(args); return []; };
  const container = document.createElement('div');
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
  if (oldFlag === undefined) delete process.env.VITE_ENABLE_SCORE_BROWSER_V2;
  else process.env.VITE_ENABLE_SCORE_BROWSER_V2 = oldFlag;
});
const mount = () => act(async () => root.render(createElement(Probe)));
const change = (patch) => act(async () => filters.getState().setFilter(patch));
const wait = (ms) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

test('all levels are independent from tier scope and each SP/DP request uses server filters', async () => {
  await mount();
  assert.equal(filters.getState().level, '');
  assert.equal(current.effectiveLevel, '');
  assert.equal(requests[0].params.size, 24);
  assert.equal(requests[0].params.sort, 'ex');
  for (const playStyle of ['SP', 'DP']) {
    await act(async () => scope.getState().setPlayStyle(playStyle));
    for (const level of ['', 1, 9, 10, 11, 12]) {
      await change({ level, series: '33', chart: 'HYPER', clear: 'FULLCOMBO_CLEAR', sort: 'series_asc' });
      assert.deepEqual(requests.at(-1).params, {
        level, playStyle, series: '33', chartType: 'HYPER', clearType: 'FULL_COMBO',
        q: '', sort: 'series_asc', page: 0, size: 24,
      });
    }
  }
  const count = requests.length;
  await act(async () => scope.getState().setLevel(10));
  assert.equal(requests.length, count);
});

test('search trims and debounces 300ms while preserving other server conditions', async () => {
  await mount();
  await change({ q: ' a ' });
  await wait(160);
  await change({ q: '  artist  ' });
  await wait(160);
  assert.equal(requests.length, 1);
  await wait(170);
  assert.equal(requests.length, 2);
  assert.equal(requests.at(-1).params.q, 'artist');
  await change({ q: 'artist' });
  await wait(320);
  assert.equal(requests.length, 2);
});

test('pagination reaches records beyond 1000 and trusts server order and count', async () => {
  api.getScores = async (params) => {
    requests.push({ params });
    return { totalElements: 1025, content: Array.from({ length: Math.min(24, 1025 - params.page * 24) },
      (_, index) => ({ id: params.page * 24 + index, bestScore: index })) };
  };
  await mount();
  assert.equal(current.totalElements, 1025);
  while (current.hasMore) await act(async () => current.loadMore());
  assert.equal(current.scores.length, 1025);
  assert.equal(current.scores.at(-1).id, 1024);
  assert.equal(requests.length, 43);
  assert.deepEqual(current.scores.slice(0, 3).map((row) => row.id), [0, 1, 2]);
  await act(async () => current.loadMore());
  assert.equal(requests.length, 43);
  await change({ q: 'beyond1000', series: '33', sort: 'series_desc' });
  await wait(320);
  assert.equal(requests.at(-1).params.q, 'beyond1000');
  assert.equal(requests.at(-1).params.page, 0);
});

test('double load-more is guarded and failed pages retry without losing the first page', async () => {
  await mount();
  api.getScores = async () => result(1, 48);
  await act(async () => current.refetch());
  const pending = deferred();
  let appendCalls = 0;
  api.getScores = (params) => { appendCalls += 1; requests.push({ params }); return pending.promise; };
  await act(async () => { current.loadMore(); current.loadMore(); });
  assert.equal(appendCalls, 1);
  assert.equal(current.isLoadingMore, true);
  await act(async () => pending.reject(new Error('retry page')));
  assert.equal(current.scores[0].id, 1);
  assert.equal(current.hasMore, true);
  assert.ok(current.loadMoreError);
  api.getScores = async (params) => { requests.push({ params }); return result(2, 48); };
  await act(async () => current.loadMore());
  assert.deepEqual(current.scores.map((row) => row.id), [1, 2]);
  assert.equal(current.loadMoreError, null);
  assert.equal(current.hasMore, false);
  assert.deepEqual(requests.slice(-2).map((item) => item.params.page), [1, 1]);
});

test('filter and style races abort requests and ignore late first or appended pages', async () => {
  await mount();
  const old = deferred();
  api.getScores = (params, options) => { requests.push({ params, ...options }); return old.promise; };
  await act(async () => current.refetch());
  const oldSignal = requests.at(-1).signal;
  api.getScores = async () => result(20, 48);
  await change({ level: 9 });
  assert.equal(oldSignal.aborted, true);
  await act(async () => old.resolve(result(10)));
  assert.deepEqual(current.scores.map((row) => row.id), [20]);
  const append = deferred();
  let appendSignal;
  api.getScores = (params, { signal }) => { appendSignal = signal; return append.promise; };
  await act(async () => { current.loadMore(); });
  api.getScores = async () => result(30);
  await act(async () => scope.getState().setPlayStyle('DP'));
  assert.equal(appendSignal.aborted, true);
  await act(async () => append.resolve(result(21, 48)));
  assert.deepEqual(current.scores.map((row) => row.id), [30]);
});

test('account changes reset filters, cancel requests and exclude the previous account search', async () => {
  await mount();
  await change({ q: 'old account', level: 11, series: '33', sort: 'date' });
  await wait(320);
  const old = deferred();
  let oldSignal;
  api.getScores = (params, { signal }) => { oldSignal = signal; return old.promise; };
  await act(async () => current.refetch());
  const newAccount = deferred();
  api.getScores = (params) => { requests.push({ params }); return newAccount.promise; };
  await act(async () => auth.getState().setUser({ id: 2 }));
  assert.equal(oldSignal.aborted, true);
  assert.equal(current.scores.length, 0);
  assert.equal(current.effectiveLevel, '');
  assert.equal(filters.getState().series, '');
  assert.equal(requests.at(-1).params.q, '');
  assert.equal(requests.at(-1).params.sort, 'ex');
  await act(async () => old.resolve(result(10)));
  assert.equal(current.scores.length, 0);
  await act(async () => newAccount.resolve(result(22)));
  assert.equal(current.scores[0].id, 22);
  await act(async () => auth.getState().logout());
  assert.equal(current.scores.length, 0);
  assert.equal(current.isLoading, false);
});

test('series sort uses server order, retains unknown values and refreshes by current user/style', async () => {
  api.getSeries = async (...args) => { seriesRequests.push(args); return [
    { value: 'future', label: 'Future', order: null },
    { value: '1', label: 'First', order: 1 },
    { value: '33', label: 'Latest', order: 33 },
  ]; };
  await mount();
  assert.deepEqual(current.seriesOptions.map((item) => item.value), ['33', '1', 'future']);
  await change({ level: 1, series: '33' });
  assert.equal(seriesRequests.length, 1);
  await act(async () => refresh(2));
  assert.equal(seriesRequests.length, 1);
  await act(async () => refresh(1));
  assert.equal(seriesRequests.length, 2);
  await act(async () => scope.getState().setPlayStyle('DP'));
  assert.equal(seriesRequests.at(-1)[0], 'DP');
  api.getSeries = async () => { throw new Error('series unavailable'); };
  await act(async () => current.refetchSeries());
  assert.ok(current.seriesError);
  assert.equal(current.scores.length, 1);
  api.getSeries = async () => [];
  await act(async () => current.refetchSeries());
  assert.equal(current.seriesError, null);
});

test('unmount cancels both list and series requests without applying their late results', async () => {
  const pending = deferred();
  let listSignal, seriesSignal;
  api.getScores = (params, { signal }) => { listSignal = signal; return pending.promise; };
  api.getSeries = (style, { signal }) => { seriesSignal = signal; return pending.promise; };
  await mount();
  await act(async () => root.unmount());
  root = null;
  assert.equal(listSignal.aborted, true);
  assert.equal(seriesSignal.aborted, true);
  await act(async () => pending.resolve(result(10)));
});

test('initial failure clears on retry and does not enable load more', async () => {
  api.getScores = async () => { throw new Error('list unavailable'); };
  await mount();
  assert.ok(current.error);
  assert.equal(current.isLoading, false);
  assert.equal(current.hasMore, false);
  api.getScores = async () => result(19);
  await act(async () => current.refetch());
  assert.equal(current.error, null);
  assert.equal(current.scores[0].id, 19);
});

test('late series responses cannot replace options from a new style', async () => {
  const old = deferred();
  let oldSignal;
  api.getSeries = (style, { signal }) => { oldSignal = signal; return old.promise; };
  await mount();
  api.getSeries = async () => [{ value: 'DP', label: 'DP series', order: 1 }];
  await act(async () => scope.getState().setPlayStyle('DP'));
  assert.equal(oldSignal.aborted, true);
  await act(async () => old.resolve([{ value: 'SP', label: 'SP series', order: 9 }]));
  assert.equal(current.seriesOptions[0].value, 'DP');
});

test('API removes all-level empty parameters and forwards cancellation for both endpoints', async () => {
  const { default: client } = await vite.ssrLoadModule('/src/api/client.js');
  const saved = client.get;
  const calls = [];
  client.get = async (...args) => { calls.push(args); return { data: [] }; };
  try {
    const controller = new AbortController();
    await getScoresTransport({ level: '', series: '', q: '', page: 0, size: 24, sort: 'ex' }, { signal: controller.signal, timeout: 700 });
    await getSeriesTransport('DP', { signal: controller.signal });
    assert.deepEqual(calls[0], ['/scores', { params: { page: 0, size: 24, sort: 'ex' }, signal: controller.signal, timeout: 700 }]);
    assert.deepEqual(calls[1], ['/scores/series', { params: { playStyle: 'DP' }, signal: controller.signal }]);
  } finally {
    client.get = saved;
  }
});
