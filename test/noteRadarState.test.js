import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSummary } from '../src/features/noteRadar/model.js';
import { createNoteRadarStore } from '../src/features/noteRadar/resourceStore.js';
import { createRequestGuard } from '../src/features/noteRadar/requestGuard.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const summary = (current = 100, extra = {}) => normalizeSummary({
  importedAt: '2026-10-18T00:00:00Z', catalog: { available: true },
  categories: [{ category: 'NOTES', current, complete: true }, { category: 'CHORD', current: 90, complete: true }], ...extra,
});
const recommendations = (chartId, targetExScore = 1500) => ({ recommendations: [{ chartId, title: `Song ${chartId}`, noteCount: 1000, targetExScore }], exploration: [] });
const makeApi = (overrides = {}) => ({
  getSummary: async () => summary(), getGoals: async () => [],
  getRecommendations: async () => recommendations(1), ...overrides,
});

test('summary is usable while independent previews and goals are still pending', async () => {
  const notes = deferred(), chord = deferred(), goals = deferred();
  const store = createNoteRadarStore(makeApi({
    getGoals: () => goals.promise,
    getRecommendations: (category) => category === 'NOTES' ? notes.promise : chord.promise,
  }), 'alice');
  const loading = store.reload();
  await flush();
  assert.equal(store.getSnapshot().summary.categories[0].current, 100);
  assert.equal(store.getSnapshot().loading, false);
  assert.equal(store.getSnapshot().goalsLoading, true);
  assert.equal(store.getSnapshot().previews.NOTES.loading, true);
  chord.reject({ response: { status: 503 } });
  notes.resolve(recommendations(12));
  await flush();
  assert.equal(store.getSnapshot().previews.NOTES.data.recommendations[0].chartId, 12);
  assert.match(store.getSnapshot().previews.CHORD.error, /서버/);
  assert.equal(store.getSnapshot().summary.categories[0].current, 100);
  goals.resolve([{ id: 10, chartId: 12 }]);
  await loading;
  assert.equal(store.getSnapshot().goals[0].id, 10);
});

test('summary requests ignore stale successes and failures even when abort is ignored', async () => {
  const first = deferred(), second = deferred(), third = deferred();
  const pending = [first, second, third];
  const store = createNoteRadarStore(makeApi({ getSummary: () => pending.shift().promise }), 'alice');
  const one = store.reload(), two = store.reload();
  second.resolve(summary(120));
  await two;
  first.resolve(summary(30));
  await one;
  assert.equal(store.getSnapshot().summary.categories[0].current, 120);
  const three = store.reload();
  third.reject({ response: { status: 500 } });
  await three;
  assert.equal(store.getSnapshot().summary.categories[0].current, 120);
  assert.match(store.getSnapshot().error, /서버/);
});

test('account changes clear visible data and reject all previous-account results', async () => {
  const oldSummary = deferred(), oldGoals = deferred(), newSummary = deferred();
  let summaryCalls = 0, goalsCalls = 0;
  const store = createNoteRadarStore(makeApi({
    getSummary: () => ++summaryCalls === 1 ? oldSummary.promise : newSummary.promise,
    getGoals: () => ++goalsCalls === 1 ? oldGoals.promise : Promise.resolve([{ id: 22 }]),
  }), 'alice');
  const alice = store.reload();
  store.setIdentity('bob');
  assert.equal(store.getSnapshot().summary, null);
  assert.deepEqual(store.getSnapshot().goals, []);
  const bob = store.reload();
  newSummary.resolve(summary(140));
  await bob;
  oldSummary.resolve(summary(10)); oldGoals.resolve([{ id: 11 }]);
  await alice; await flush();
  assert.equal(store.getSnapshot().owner, 'bob');
  assert.equal(store.getSnapshot().summary.categories[0].current, 140);
  assert.equal(store.getSnapshot().goals[0].id, 22);
});

test('EX refresh reloads recommendations and goals without updating official current values', async () => {
  let summaryCalls = 0, previewCalls = 0, goalsCalls = 0;
  const store = createNoteRadarStore(makeApi({
    getSummary: async () => { summaryCalls += 1; return summary(130); },
    getRecommendations: async () => { previewCalls += 1; return recommendations(previewCalls); },
    getGoals: async () => { goalsCalls += 1; return []; },
  }), 'alice');
  await store.reload();
  const revision = store.getSnapshot().revision;
  await store.refreshScores();
  assert.equal(summaryCalls, 1);
  assert.equal(goalsCalls, 2);
  assert.equal(previewCalls, 4);
  assert.equal(store.getSnapshot().summary.categories[0].current, 130);
  assert.ok(store.getSnapshot().revision > revision);
});

test('stale preview and goals requests cannot replace newer results or repopulate scoped details', async () => {
  const oldPreview = deferred(), oldGoals = deferred();
  let previewCalls = 0, goalsCalls = 0;
  const store = createNoteRadarStore(makeApi({
    getRecommendations: (category) => {
      if (category !== 'NOTES') return Promise.resolve(recommendations(2));
      return ++previewCalls === 1 ? oldPreview.promise : Promise.resolve(recommendations(20));
    },
    getGoals: () => ++goalsCalls === 1 ? oldGoals.promise : Promise.resolve([{ id: 2 }]),
  }), 'alice');
  const initial = store.reload();
  await flush();
  await store.refreshScores();
  oldPreview.resolve(recommendations(10)); oldGoals.resolve([{ id: 1 }]);
  await initial; await flush();
  assert.equal(store.getSnapshot().previews.NOTES.data.recommendations[0].chartId, 20);
  assert.equal(store.getSnapshot().goals[0].id, 2);
  assert.equal(store.getChartDetail(10, 'NOTES'), null);
  assert.equal(store.getChartDetail(20, 'NOTES').noteCount, 1000);
});

test('incomplete categories and unavailable catalog never issue recommendation requests', async () => {
  let calls = 0;
  const store = createNoteRadarStore(makeApi({
    getSummary: async () => summary(100, { catalog: { available: false } }),
    getRecommendations: async () => { calls += 1; return recommendations(1); },
  }), 'alice');
  await store.reload();
  assert.equal(calls, 0);
  assert.equal(store.getSnapshot().previews.NOTES.blocked, true);
  assert.equal(store.getSnapshot().summary.categories[0].current, 100);
});

test('recommendation detail cache is category and revision scoped and never fabricated from a goal', async () => {
  const store = createNoteRadarStore(makeApi(), 'alice');
  await store.reload();
  const revision = store.getSnapshot().revision;
  store.rememberRecommendations('PEAK', recommendations(23), revision);
  assert.equal(store.getChartDetail(23, 'PEAK').targetExScore, 1500);
  assert.equal(store.getChartDetail(23, 'NOTES'), null);
  await store.refreshScores();
  store.rememberRecommendations('PEAK', recommendations(23), revision);
  assert.equal(store.getChartDetail(23, 'PEAK'), null);
  assert.equal(store.getChartDetail(999, 'PEAK'), null);
});

test('goals failure is independent and retry preserves an existing saved list', async () => {
  let fail = false;
  const store = createNoteRadarStore(makeApi({ getGoals: async () => {
    if (fail) throw { response: { status: 500 } };
    return [{ id: 5, chartId: 1 }];
  } }), 'alice');
  await store.reload(); fail = true;
  assert.equal(await store.reloadGoals(), false);
  assert.equal(store.getSnapshot().goals[0].id, 5);
  assert.match(store.getSnapshot().goalsError, /서버/);
  assert.equal(store.getSnapshot().error, '');
});

test('request guard invalidates only its request key and invalidates all on identity changes', () => {
  const guard = createRequestGuard();
  const first = guard.begin('category'), goals = guard.begin('goals');
  const second = guard.begin('category');
  assert.equal(first.signal.aborted, true);
  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
  assert.equal(guard.isCurrent(goals), true);
  guard.invalidateAll();
  assert.equal(guard.isCurrent(second), false);
  assert.equal(guard.isCurrent(goals), false);
});

test('provider prevents old-account renders, survives Strict Mode, and keeps official snapshot on EX refresh', async () => {
  const { JSDOM } = await import('jsdom');
  const { act, createElement, StrictMode } = await import('react');
  const { createServer } = await import('vite');
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false } });
  let root;
  try {
    const { default: Provider } = await vite.ssrLoadModule('/src/features/noteRadar/RadarContext.jsx');
    const { useNoteRadar } = await vite.ssrLoadModule('/src/features/noteRadar/useNoteRadar.js');
    const { useAuthStore } = await vite.ssrLoadModule('/src/store/authStore.js');
    const { useScoreRefreshStore } = await vite.ssrLoadModule('/src/store/scoreRefreshStore.js');
    const { noteRadarApi } = await vite.ssrLoadModule('/src/features/noteRadar/api.js');
    const requests = [], renders = [];
    noteRadarApi.getSummary = () => { const request = deferred(); requests.push(request); return request.promise; };
    noteRadarApi.getGoals = async () => [];
    noteRadarApi.getRecommendations = async () => recommendations(1);
    let exposed;
    function Consumer() {
      const data = useNoteRadar();
      exposed = data;
      renders.push({ owner: data.owner, current: data.summary?.categories[0].current });
      return createElement('p', null, data.summary?.categories[0].current ?? 'loading');
    }
    useAuthStore.setState({ user: { id: 'alice' }, isLoading: false });
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(createElement(StrictMode, null, createElement(Provider, null, createElement(Consumer)))));
    assert.ok(requests.length >= 2);
    await act(async () => requests.at(-1).resolve(summary(111)));
    assert.equal(exposed.summary.categories[0].current, 111);
    const beforeRefresh = requests.length;
    await act(async () => useScoreRefreshStore.getState().invalidate());
    assert.equal(requests.length, beforeRefresh);
    assert.equal(exposed.summary.categories[0].current, 111);
    const transitionStart = renders.length;
    await act(async () => useAuthStore.setState({ user: { id: 'bob' } }));
    assert.equal(exposed.summary, null);
    assert.equal(renders.slice(transitionStart).some((render) => render.current === 111), false);
    await act(async () => requests.at(-1).resolve(summary(155)));
    await act(async () => requests[0].resolve(summary(33)));
    assert.equal(exposed.owner, 'bob');
    assert.equal(exposed.summary.categories[0].current, 155);
    const { MemoryRouter, useLocation } = await import('react-router-dom');
    const { useRadarEditor } = await vite.ssrLoadModule('/src/features/noteRadar/useRadarEditor.js');
    let editor, editorLocation;
    function EditorConsumer() {
      editor = useRadarEditor(1);
      editorLocation = useLocation();
      return createElement('p', null, editor.editing ? 'editing' : 'closed');
    }
    await act(async () => root.render(createElement(MemoryRouter, {
      initialEntries: [{ pathname: '/note-radar/categories/NOTES', search: '?tab=recommendations&level=12&record=absent&goal=165', state: { radarEditor: 1 } }],
    }, createElement(EditorConsumer))));
    await act(async () => editor.open({ chartId: 1 }, 'NOTES'));
    assert.ok(editor.editing);
    await act(async () => editor.close());
    assert.equal(editor.editing, null, 'Closing a fresh editor must not reopen an orphaned history marker after reload');
    assert.equal(editorLocation.search, '?tab=recommendations&level=12&record=absent&goal=165');
  } finally {
    if (root) await act(async () => root.unmount());
    await vite.close();
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});

test('API adapter reuses API base and CSRF while sending documented numeric payloads', async () => {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true, hmr: false } });
  globalThis.document = { cookie: 'XSRF-TOKEN=radar%20token' };
  try {
    const { noteRadarApi } = await vite.ssrLoadModule('/src/features/noteRadar/api.js');
    const { default: client } = await vite.ssrLoadModule('/src/api/client.js');
    const captured = [];
    client.defaults.adapter = async (config) => {
      captured.push(config);
      return { data: config.url.endsWith('/goals') ? [] : {}, status: 200, statusText: 'OK', headers: {}, config };
    };
    await noteRadarApi.getRecommendations('SOFLAN', { category: 'NOTES', level: '12', chartType: 'ANOTHER', record: 'absent', goal: '170.5' });
    await noteRadarApi.simulate([{ chartId: '123', exScore: 0 }]);
    await noteRadarApi.saveGoal({ chartId: '123', category: 'NOTES', targetExScore: 1500, ignored: true });
    await noteRadarApi.deleteGoal('456');
    assert.match(captured[0].baseURL, /\/api$/);
    assert.equal(captured[0].url, '/note-radar/recommendations');
    assert.deepEqual(captured[0].params, { category: 'SOFLAN', level: 12, chartType: 'ANOTHER', record: 'absent', goal: 170.5 });
    assert.equal(captured[0].withCredentials, true);
    assert.equal(captured[1].headers.get('X-XSRF-TOKEN'), 'radar token');
    assert.deepEqual(JSON.parse(captured[1].data), { targets: [{ chartId: 123, exScore: 0 }] });
    assert.deepEqual(JSON.parse(captured[2].data), { chartId: 123, category: 'NOTES', targetExScore: 1500 });
    assert.equal(captured[3].url, '/note-radar/goals/456');
    await assert.rejects(noteRadarApi.simulate([{ chartId: null, exScore: 100 }]), TypeError);
    await assert.rejects(noteRadarApi.simulate([{ chartId: 123, exScore: '100' }]), TypeError);
    await assert.rejects(noteRadarApi.simulate(Array.from({ length: 51 }, () => ({ chartId: 123, exScore: 100 }))), TypeError);
    await assert.rejects(noteRadarApi.saveGoal({ chartId: 123, category: 'SOF-LAN', targetExScore: 100 }), TypeError);
    await assert.rejects(noteRadarApi.deleteGoal('missing'), TypeError);
    assert.equal(captured.length, 4);
  } finally {
    await vite.close();
    delete globalThis.document;
  }
});
