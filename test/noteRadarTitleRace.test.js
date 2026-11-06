import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createServer } from 'vite';
import { card, response } from './fixtures/noteRadarTitleData.js';

let dom, vite, root, container, createRoot, MemoryRouter, RadarCategory, api, calls;
const category = { category: 'NOTES', current: 110, title: 'EMERALD', complete: true, issues: [], top10: [] };
const deferred = () => { let resolve; const promise = new Promise((accept) => { resolve = accept; }); return { promise, resolve }; };
const reply = (title) => response({ plan: null, recommendations: [card({ title })] });

before(async () => {
  dom = new JSDOM('<body></body>', { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  ({ MemoryRouter } = await import('react-router-dom'));
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  ({ default: RadarCategory } = await vite.ssrLoadModule('/src/features/noteRadar/RadarCategory.jsx'));
  ({ noteRadarApi: api } = await vite.ssrLoadModule('/src/features/noteRadar/api.js'));
});
beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  container = document.createElement('div');
  document.body.replaceChildren(container);
  root = createRoot(container);
  calls = [];
  api.getRecommendations = (name, filters) => { const entry = { filters, ...deferred() }; calls.push(entry); return entry.promise; };
});
after(async () => {
  if (root) await act(async () => root.unmount());
  await vite?.close();
  dom?.window.close();
  for (const key of ['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT']) delete globalThis[key];
});

const props = { category, tab: 'recommendations', onTabChange() {}, onSelect() {}, onFilterChange() {} };
const render = (extra, key = 'a') => act(async () => root.render(createElement(MemoryRouter, null,
  createElement(RadarCategory, { key, ...props, filters: { level: '', chartType: '', record: '' }, ...extra }))));
const debounce = () => act(async () => new Promise((resolve) => window.setTimeout(resolve, 400)));
const settle = (entry, value) => act(async () => { entry.resolve(value); await entry.promise; });

test('a late response for the previous goal is ignored after the goal changes', async () => {
  await render({ goal: '120' }); await debounce();
  await render({ goal: '150' }); await debounce();
  assert.deepEqual(calls.map((call) => call.filters.goalTitle), ['DIAMOND', 'PLATINUM']);
  await settle(calls[1], reply('Platinum Song'));
  await settle(calls[0], reply('Diamond Song'));
  assert.match(container.textContent, /Platinum Song/);
  assert.doesNotMatch(container.textContent, /Diamond Song/);
});

test('a late response for the previous filter is ignored', async () => {
  await render({ goal: '120' }); await debounce();
  await render({ goal: '120', filters: { level: '12', chartType: '', record: '' } }); await debounce();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].filters.level, '12');
  await settle(calls[1], reply('Filtered Song'));
  await settle(calls[0], reply('Unfiltered Song'));
  assert.match(container.textContent, /Filtered Song/);
  assert.doesNotMatch(container.textContent, /Unfiltered Song/);
});

test('a new revision key remounts and drops stale data', async () => {
  await render({ goal: '120' }, 'NOTES:0'); await debounce();
  await settle(calls[0], reply('Old Revision Song'));
  assert.match(container.textContent, /Old Revision Song/);
  await render({ goal: '120' }, 'NOTES:1');
  assert.doesNotMatch(container.textContent, /Old Revision Song/);
  await debounce();
  assert.equal(calls.length, 2);
  await settle(calls[1], reply('New Revision Song'));
  assert.match(container.textContent, /New Revision Song/);
  assert.doesNotMatch(container.textContent, /Old Revision Song/);
});
