import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createServer } from 'vite';
import { CATEGORIES, normalizeSummary } from '../src/features/noteRadar/model.js';
import { card, legacy, response } from './fixtures/noteRadarTitleData.js';

let dom, vite, root, container, createRoot, routerDom, Page, Context, api, queries, remembered, opened, nextReply;
const top10 = Array.from({ length: 10 }, (_, index) => ({ chartId: index + 1, songId: index + 1, title: `Top ${index + 1}`, chartType: 'HYPER', value: 10 }));
const summaryFor = (overrides = {}) => normalizeSummary({ release: '34', importedAt: '2026-10-18T09:00:00Z', catalog: { available: true },
  categories: CATEGORIES.map((name) => ({ category: name, current: 110, nextThreshold: 120, complete: true, title: 'EMERALD', top10, issues: [],
    ...(overrides[name] ?? {}) })) });

before(async () => {
  dom = new JSDOM('<body></body>', { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  routerDom = await import('react-router-dom');
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  ({ default: Page } = await vite.ssrLoadModule('/src/pages/NoteRadarCategory.jsx'));
  ({ NoteRadarContext: Context } = await vite.ssrLoadModule('/src/features/noteRadar/context.js'));
  ({ noteRadarApi: api } = await vite.ssrLoadModule('/src/features/noteRadar/api.js'));
});
beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  container = document.createElement('div');
  document.body.replaceChildren(container);
  root = createRoot(container);
  queries = []; remembered = []; opened = 0;
  nextReply = response({ plan: null });
  api.getRecommendations = async (name, filters) => { queries.push(Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))); return nextReply; };
});
after(async () => {
  if (root) await act(async () => root.unmount());
  await vite?.close();
  dom?.window.close();
  for (const key of ['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT']) delete globalThis[key];
});

async function mount(url, summary = summaryFor(), previews = {}) {
  const { MemoryRouter, Routes, Route, Outlet } = routerDom;
  await act(async () => root.render(null));
  const value = { summary, previews, revision: 0, reloadGoals() {}, rememberRecommendations: (name, data) => remembered.push([name, data]), getChartDetail() {} };
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: [url] },
    createElement(Context.Provider, { value }, createElement(Routes, null,
      createElement(Route, { element: createElement(Outlet, { context: { openImport: () => { opened++; } } }) },
        createElement(Route, { path: '/note-radar/categories/:category', element: createElement(Page) })))))));
  await act(async () => new Promise((resolve) => window.setTimeout(resolve, 400)));
}
const button = (label) => [...document.querySelectorAll('button')].find((item) => item.textContent.startsWith(label));
const text = () => container.textContent;

test('default URL requests the next title only', async () => {
  await mount('/note-radar/categories/NOTES');
  assert.deepEqual(queries, [{ goalTitle: 'DIAMOND' }]);
  assert.match(text(), /칭호 하한을 입력하면 칭호 추천/);
});

test('a non-title number keeps the legacy numeric request', async () => {
  nextReply = legacy();
  await mount('/note-radar/categories/NOTES?goal=145');
  assert.deepEqual(queries, [{ goal: 145 }]);
});

test('150 and 150.0 both resolve to PLATINUM', async () => {
  await mount('/note-radar/categories/NOTES?goal=150');
  await mount('/note-radar/categories/NOTES?goal=150.0');
  assert.deepEqual(queries, [{ goalTitle: 'PLATINUM' }, { goalTitle: 'PLATINUM' }]);
});

test('title shortcut buttons update the request and mark the selection', async () => {
  await mount('/note-radar/categories/NOTES');
  assert.equal(button('PLATINUM').getAttribute('aria-pressed'), 'false');
  assert.match(button('ROOKIE').textContent, /달성/);
  assert.doesNotMatch(button('PLATINUM').textContent, /달성/);
  await act(async () => button('PLATINUM').click());
  await act(async () => new Promise((resolve) => window.setTimeout(resolve, 400)));
  assert.deepEqual(queries.at(-1), { goalTitle: 'PLATINUM' });
  assert.equal(button('PLATINUM').getAttribute('aria-pressed'), 'true');
  assert.equal(document.querySelector('input').value, '150');
});

test('a category without a next threshold sends no request and uses the preview', async () => {
  const summary = summaryFor({ NOTES: { current: 185, nextThreshold: null } });
  await mount('/note-radar/categories/NOTES', summary, { NOTES: { data: legacy('Preview Song') } });
  assert.equal(queries.length, 0);
  assert.match(text(), /Preview Song/);
});

test('a title request without filters still fetches and PLAN responses are not remembered', async () => {
  nextReply = response({ plan: null, recommendations: [card({ title: 'Plan Mode Song' })] });
  await mount('/note-radar/categories/NOTES?goal=120');
  assert.equal(queries.length, 1);
  assert.match(text(), /Plan Mode Song/);
  assert.equal(remembered.length, 0);
});

test('LEGACY responses are remembered', async () => {
  nextReply = legacy();
  await mount('/note-radar/categories/NOTES?goal=145');
  assert.equal(remembered.length, 1);
});

test('REFRESH_REQUIRED banner button opens the import panel', async () => {
  nextReply = response({ goal: { ...response().goal, status: 'REFRESH_REQUIRED' }, plan: null });
  await mount('/note-radar/categories/NOTES?goal=120');
  await act(async () => button('공식 레이더 다시 가져오기').click());
  assert.equal(opened, 1);
});
