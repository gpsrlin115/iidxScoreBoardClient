import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createServer } from 'vite';

let dom, vite, root, container, createRoot, MemoryRouter, RadarCategory, RadarScoreEditor, RadarGoals, api;
const chart = { chartId: 5, title: 'Current selected song', chartType: 'ANOTHER', level: 12,
  noteCount: 1000, currentExScore: 0, targetExScore: 1500, minExScore: 1300 };
const category = (name) => ({ category: name, current: 100, complete: true, issues: [], top10: [] });
const deferred = () => { let resolve; const promise = new Promise((accept) => { resolve = accept; }); return { promise, resolve }; };
const effect = (after, exScore = 1500) => ({ estimated: true,
  categories: [{ category: 'NOTES', before: 100, after, gain: after - 100 }],
  targetValues: [{ chartId: 5, exScore, values: { NOTES: after + 40 } }] });
const recommendation = (title) => ({ recommendations: [{ ...chart, title, gain: 4 }], exploration: [], issues: [] });

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
  ({ default: RadarScoreEditor } = await vite.ssrLoadModule('/src/features/noteRadar/RadarScoreEditor.jsx'));
  ({ default: RadarGoals } = await vite.ssrLoadModule('/src/features/noteRadar/RadarGoals.jsx'));
  ({ noteRadarApi: api } = await vite.ssrLoadModule('/src/features/noteRadar/api.js'));
});
beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  container = document.createElement('div');
  document.body.replaceChildren(container);
  root = createRoot(container);
  api.simulate = async () => effect(104);
  api.getRecommendations = async () => recommendation('Default recommendation');
  api.saveGoal = async () => ({});
  api.deleteGoal = async () => {};
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

const render = (component, props) => act(async () => root.render(createElement(MemoryRouter, null, createElement(component, props))));
const button = (text) => [...document.body.querySelectorAll('button')].find((item) => item.textContent === text);
const click = (text) => act(async () => { assert.ok(button(text), `Missing button ${text}`); button(text).click(); });
const settle = (response, value) => act(async () => { response.resolve(value); await response.promise; });
const debounce = () => act(async () => new Promise((resolve) => window.setTimeout(resolve, 280)));
async function inputEx(value) {
  await act(async () => {
    const input = document.querySelector('[aria-describedby=radar-score-help]');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
const editorProps = { song: chart, category: 'NOTES', categoryTarget: 110, onClose() {}, onSaved() {} };

test('EX edit cancels pending calculation and ignores its late result after a newer score succeeds', async () => {
  const calls = [];
  api.simulate = (targets, signal) => { const response = deferred(); calls.push({ targets, signal, response }); return response.promise; };
  await render(RadarScoreEditor, editorProps);
  await click('상승량 계산');
  assert.equal(document.querySelector('input').disabled, false);
  await inputEx('1600');
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(button('상승량 계산').disabled, false);
  await click('상승량 계산');
  assert.deepEqual(calls[1].targets, [{ chartId: 5, exScore: 1600 }]);
  await settle(calls[1].response, effect(106, 1600));
  assert.match(document.body.textContent, /106.00/);
  await settle(calls[0].response, effect(199, 1500));
  assert.match(document.body.textContent, /106.00/);
  assert.doesNotMatch(document.body.textContent, /199.00/);
});

test('invalid EX edits clear visible results and block both calculation and saving', async () => {
  let saved = 0;
  api.saveGoal = async () => { saved++; };
  await render(RadarScoreEditor, editorProps);
  await click('상승량 계산');
  assert.match(document.body.textContent, /104.00/);
  for (const value of ['2001', '1500.5', '-1', '']) {
    await inputEx(value);
    assert.doesNotMatch(document.body.textContent, /104.00/);
    assert.equal(button('상승량 계산').disabled, true, value);
    assert.equal(button('목표곡에 저장').disabled, true, value);
    assert.equal(document.querySelector('input').getAttribute('aria-invalid'), 'true');
  }
  await inputEx('0');
  assert.equal(button('목표곡에 저장').disabled, false);
  await click('목표곡에 저장');
  assert.equal(saved, 1);
});

test('old category response cannot overwrite newer category recommendations even when API ignores abort', async () => {
  const calls = [], accepted = [];
  api.getRecommendations = (name, filters, signal) => { const response = deferred(); calls.push({ name, filters, signal, response }); return response.promise; };
  const common = { tab: 'recommendations', onTabChange() {}, onSelect() {}, goal: '110', onRecommendations: (name) => accepted.push(name) };
  await render(RadarCategory, { ...common, category: category('NOTES') });
  await debounce();
  await render(RadarCategory, { ...common, category: category('CHORD') });
  await debounce();
  assert.equal(calls[0].signal.aborted, true);
  await settle(calls[1].response, recommendation('New CHORD recommendation'));
  await settle(calls[0].response, recommendation('Stale NOTES recommendation'));
  assert.match(container.textContent, /New CHORD recommendation/);
  assert.doesNotMatch(container.textContent, /Stale NOTES recommendation/);
  assert.deepEqual(accepted, ['CHORD']);
});

test('old filter response cannot overwrite a later filter and query keeps numeric category goal', async () => {
  const calls = [];
  api.getRecommendations = (name, filters, signal) => { const response = deferred(); calls.push({ name, filters, signal, response }); return response.promise; };
  const common = { category: category('NOTES'), tab: 'recommendations', onTabChange() {}, onSelect() {}, goal: '110.25', onFilterChange() {} };
  await render(RadarCategory, { ...common, filters: { level: '12', chartType: '', record: 'present' } });
  await debounce();
  await render(RadarCategory, { ...common, filters: { level: '11', chartType: 'HYPER', record: 'absent' } });
  await debounce();
  assert.equal(calls[0].signal.aborted, true);
  assert.deepEqual(calls[1].filters, { level: '11', chartType: 'HYPER', record: 'absent', goal: 110.25 });
  await settle(calls[1].response, recommendation('New filter recommendation'));
  await settle(calls[0].response, recommendation('Stale filter recommendation'));
  assert.match(container.textContent, /New filter recommendation/);
  assert.doesNotMatch(container.textContent, /Stale filter recommendation/);
});

test('changing selected goals invalidates a pending combined simulation and permits fresh recomputation', async () => {
  const calls = [];
  api.simulate = (targets, signal) => { const response = deferred(); calls.push({ targets, signal, response }); return response.promise; };
  const goals = [{ ...chart, id: 1, category: 'NOTES', targetExScore: 1500 },
    { ...chart, chartId: 6, title: 'Second saved song', id: 2, category: 'CHORD', targetExScore: 1600 }];
  await render(RadarGoals, { goals, onReload() {}, onEdit() {} });
  await act(async () => { container.querySelectorAll('input[type=checkbox]').forEach((checkbox) => checkbox.click()); });
  await click('선택한 2곡 함께 계산');
  await act(async () => container.querySelectorAll('input[type=checkbox]')[1].click());
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(button('선택한 1곡 함께 계산').disabled, false);
  await settle(calls[0].response, effect(199));
  assert.doesNotMatch(container.textContent, /199.00/);
  await click('선택한 1곡 함께 계산');
  assert.deepEqual(calls[1].targets, [{ chartId: 5, exScore: 1500 }]);
  await settle(calls[1].response, effect(104));
  assert.match(container.textContent, /104.00/);
});

test('successful save followed by refresh failure remains a saved outcome', async () => {
  let saved = 0;
  api.saveGoal = async () => { saved++; };
  await render(RadarScoreEditor, { ...editorProps, onSaved: async () => { throw new Error('List unavailable'); } });
  await click('목표곡에 저장');
  assert.equal(saved, 1);
  assert.match(document.body.textContent, /목표곡은 저장됐습니다.*목록 새로고침에 실패/);
  assert.equal(document.querySelector('[role=alert]'), null);
  assert.equal(button('목표곡에 저장').disabled, false);
});

test('successful delete followed by refresh failure remains a deleted outcome', async () => {
  let deleted = 0;
  api.deleteGoal = async () => { deleted++; };
  await render(RadarGoals, { goals: [{ ...chart, id: 1, category: 'NOTES', targetExScore: 1500 }],
    onReload: async () => { throw new Error('List unavailable'); }, onEdit() {} });
  await click('삭제');
  assert.equal(deleted, 1);
  assert.match(container.textContent, /목표곡은 삭제됐습니다.*목록 조회를 다시 시도/);
  assert.equal(container.querySelector('[role=alert]'), null);
});

test('editor Escape invokes close and unmount restores prior keyboard focus and body scroll', async () => {
  let closed = 0;
  const opener = document.createElement('button');
  opener.textContent = 'Open score editor';
  document.body.append(opener);
  opener.focus();
  await render(RadarScoreEditor, { ...editorProps, onClose: () => { closed++; } });
  assert.equal(document.activeElement.getAttribute('aria-label'), '목표 점수 편집 닫기');
  assert.equal(document.body.style.overflow, 'hidden');
  await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(closed, 1);
  await act(async () => root.render(null));
  assert.equal(document.activeElement, opener);
  assert.equal(document.body.style.overflow, '');
});
