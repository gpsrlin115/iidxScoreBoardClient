import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement, Fragment } from 'react';
import { createServer } from 'vite';

let dom, vite, root, container, createRoot, MemoryRouter, ScoreBrowser, TopBar;
let scoresApi, tierApi, feedbackApi, authStore, scoresStore, scopeStore;
const calls = [];
const row = (id, chartType = 'HYPER', level = 9, playStyle = 'SP') => ({
  id, song: { title: id <= 2 ? 'Shared title' : `Song ${id}`, artist: 'Artist', version: 'substream' },
  chart: { id: id * 100, chartType, level, playStyle }, bestScore: id * 1000,
  bestClearType: 'HARD_CLEAR', bestDjLevel: 'AA', playCount: 2,
});

before(async () => {
  dom = new JSDOM('<body></body>', { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  ({ MemoryRouter } = await import('react-router-dom'));
  vite = await createServer({
    define: { 'import.meta.env.VITE_ENABLE_SCORE_BROWSER_V2': JSON.stringify('1') },
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  ({ default: ScoreBrowser } = await vite.ssrLoadModule('/src/pages/ScoreBrowser.jsx'));
  ({ default: TopBar } = await vite.ssrLoadModule('/src/components/layout/TopBar.jsx'));
  ({ scoresApi } = await vite.ssrLoadModule('/src/api/scores.js'));
  ({ tierApi } = await vite.ssrLoadModule('/src/api/tiers.js'));
  ({ songFeedbackApi: feedbackApi } = await vite.ssrLoadModule('/src/api/songFeedback.js'));
  ({ useAuthStore: authStore } = await vite.ssrLoadModule('/src/store/authStore.js'));
  ({ useScoresStore: scoresStore } = await vite.ssrLoadModule('/src/store/scoresStore.js'));
  ({ useScopeStore: scopeStore } = await vite.ssrLoadModule('/src/store/scopeStore.js'));
});
beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  container = document.createElement('div');
  document.body.replaceChildren(container);
  root = createRoot(container);
  calls.length = 0;
  authStore.setState({ user: { id: 1 } });
  scoresStore.getState().resetFilters();
  scopeStore.setState({ playStyle: 'SP', level: 12 });
  scoresApi.getScores = async (params) => {
    calls.push(params);
    return { content: [row(1), row(2, 'ANOTHER', 12)], totalElements: 2, last: true };
  };
  scoresApi.getSeries = async () => [{ value: 'substream', label: 'substream', order: 2 }];
  tierApi.getTierData = async () => ({ '地力 B': [{ title: 'Shared title', difficulty: 'ANOTHER', chartId: 200 }] });
  feedbackApi.getFeedback = async () => ({ currentTier: null, vote: { counts: {}, total: 0 } });
  feedbackApi.getComments = async () => ({ content: [], totalElements: 0, totalPages: 1 });
});
after(async () => {
  if (root) await act(async () => root.unmount());
  await vite?.close();
  dom?.window.close();
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.HTMLElement;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
const render = (path = '/scores', includeScores = true) => act(async () => root.render(
  createElement(MemoryRouter, { initialEntries: [path], key: path },
    createElement(Fragment, null, createElement(TopBar), includeScores && createElement(ScoreBrowser)))));
const click = (element) => act(async () => element.click());
const select = (name, value) => act(async () => {
  const input = container.querySelector(`select[aria-label="${name}"]`);
  input.value = value;
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
});
const lastCall = () => calls.at(-1);

test('new score browser starts at all levels and EX order without global level buttons', async () => {
  await render();
  assert.equal(container.querySelector('select[aria-label="레벨"]').value, '');
  assert.equal(container.querySelectorAll('select[aria-label="레벨"] option').length, 13);
  assert.equal(container.querySelector('[aria-label="정렬"] [aria-pressed=true]').textContent, 'EX');
  assert.equal(lastCall().level, '');
  assert.equal(lastCall().sort, 'ex');
  assert.equal(lastCall().size, 24);
  assert.match(container.firstElementChild.textContent, /scores · 전체 SP/);
  assert.equal(container.firstElementChild.querySelectorAll('button').length, 0);
});

test('dashboard and tier table keep their existing global level controls', async () => {
  for (const path of ['/', '/tier-table']) {
    await render(path, false);
    assert.deepEqual([...container.querySelectorAll('button')].map((button) => button.textContent), ['☆10', '☆11', '☆12']);
    assert.match(container.textContent, /☆12 SP/);
  }
});

test('level, series, chart, clear, and sort controls send one combined server query', async () => {
  await render();
  await select('레벨', '1');
  await select('시리즈', 'substream');
  await click([...container.querySelectorAll('[aria-label="채보 종류"] button')].find((button) => button.textContent === 'NORMAL'));
  await click([...container.querySelectorAll('[aria-label="클리어"] button')].find((button) => button.textContent === 'FC'));
  await click([...container.querySelectorAll('[aria-label="정렬"] button')].find((button) => button.textContent === '최신 시리즈순'));
  assert.equal(lastCall().level, 1);
  assert.equal(lastCall().series, 'substream');
  assert.equal(lastCall().chartType, 'NORMAL');
  assert.equal(lastCall().clearType, 'FULL_COMBO');
  assert.equal(lastCall().sort, 'series_desc');
  assert.equal(lastCall().page, 0);
  assert.match(container.firstElementChild.textContent, /scores · ☆1 SP/);
  for (const level of ['9', '10', '11', '12']) {
    await select('레벨', level);
    assert.equal(lastCall().level, Number(level));
  }
  await act(async () => scopeStore.getState().setPlayStyle('DP'));
  assert.equal(lastCall().playStyle, 'DP');
  assert.match(container.firstElementChild.textContent, /scores · ☆12 DP/);
});

test('list mounts only one dialog and uses the selected same-title chart record', async () => {
  await render();
  const cards = container.querySelectorAll('button[aria-haspopup="dialog"]');
  assert.equal(cards.length, 2);
  assert.doesNotMatch(cards[0].textContent, /TIER/);
  assert.match(cards[1].textContent, /TIER 地力 B/);
  let feedbackChart, commentChart;
  feedbackApi.getFeedback = async (chartId) => { feedbackChart = chartId; return { currentTier: null }; };
  feedbackApi.getComments = async (chartId) => { commentChart = chartId; return { content: [], totalElements: 0, totalPages: 1 }; };
  cards[1].focus();
  await click(cards[1]);
  assert.equal(document.querySelectorAll('[role=dialog]').length, 1);
  assert.match(document.querySelector('[role=dialog]').textContent, /2,000/);
  assert.match(document.querySelector('[role=dialog]').textContent, /SP · Lv.12/);
  assert.equal(feedbackChart, 200);
  assert.equal(commentChart, 200);
  await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(document.activeElement, cards[1]);
  assert.equal(container.querySelector('select[aria-label="레벨"]').value, '');
  assert.equal(container.querySelectorAll('button[aria-haspopup="dialog"]').length, 2);
});

test('tier service failure does not block personal scores or detail dialog', async () => {
  tierApi.getTierData = async () => { throw new Error('tier unavailable'); };
  await render();
  const card = container.querySelectorAll('button[aria-haspopup="dialog"]')[1];
  assert.ok(card);
  assert.doesNotMatch(card.textContent, /TIER/);
  await click(card);
  assert.match(document.querySelector('[role=dialog]').textContent, /2,000/);
});

test('account and play-style changes permanently dismiss an old score dialog', async () => {
  await render();
  await click(container.querySelector('button[aria-haspopup="dialog"]'));
  assert.ok(document.querySelector('[role=dialog]'));
  await act(async () => authStore.setState({ user: { id: 2 } }));
  assert.ok(!document.querySelector('[role=dialog]'));
  await act(async () => authStore.setState({ user: { id: 1 } }));
  assert.ok(!document.querySelector('[role=dialog]'));
  await click(container.querySelector('button[aria-haspopup="dialog"]'));
  assert.ok(document.querySelector('[role=dialog]'));
  await act(async () => scopeStore.getState().setPlayStyle('DP'));
  assert.ok(!document.querySelector('[role=dialog]'));
  await act(async () => scopeStore.getState().setPlayStyle('SP'));
  assert.ok(!document.querySelector('[role=dialog]'));
});
