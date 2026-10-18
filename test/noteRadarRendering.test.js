import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createServer } from 'vite';

let dom, vite, root, container, createRoot, MemoryRouter, RadarCategory, RadarScoreEditor, RadarGoals, BookmarkletInstall, api;
let simulated, saved, recommendationQuery;
const chart = { chartId: 5, songId: 2, title: 'Radar Song', chartType: 'ANOTHER', level: 12, noteCount: 1000, currentExScore: 0, targetExScore: 1500, targetRate: 75, minExScore: 1300, radarValue: 140, gain: 4, peerCount: 7, basis: 'PEERS' };

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
  ({ BookmarkletInstall } = await vite.ssrLoadModule('/src/features/noteRadar/import/BookmarkletInstall.jsx'));
  ({ noteRadarApi: api } = await vite.ssrLoadModule('/src/features/noteRadar/api.js'));
});

beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  container = document.createElement('div');
  document.body.replaceChildren(container);
  root = createRoot(container);
  simulated = null;
  saved = null;
  recommendationQuery = null;
  api.getRecommendations = async (category, filters) => {
    recommendationQuery = { category, filters };
    return { recommendations: [{ ...chart, goalExScore: 1800 }], exploration: [], issues: [] };
  };
  api.simulate = async (targets) => {
    simulated = targets;
    return { estimated: true, categories: [{ category: 'NOTES', before: 100, after: 104, gain: 4 }], targetValues: [{ chartId: 5, exScore: 1500, values: { NOTES: 140 } }] };
  };
  api.saveGoal = async (goal) => { saved = goal; };
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
const click = async (label) => act(async () => {
  const button = [...document.body.querySelectorAll('button')].find((item) => item.textContent === label);
  assert.ok(button, `Missing button: ${label}`);
  button.click();
});

test('recommendations distinguish real zero records, song value, and category gain', async () => {
  let selected;
  await render(RadarCategory, {
    category: { category: 'NOTES', current: 100, complete: true, issues: [] },
    tab: 'recommendations', onTabChange() {}, onSelect: (song) => { selected = song; },
    preview: { data: { recommendations: [chart], exploration: [], issues: [] } },
  });
  assert.match(container.textContent, /EX 0/);
  assert.match(container.textContent, /곡 획득값 140.00/);
  assert.match(container.textContent, /평균 상승량\+4.00/);
  assert.match(container.textContent, /참고 사용자 7명/);
  await click('점수 조정 · 목표 저장');
  assert.equal(selected.chartId, 5);
});

test('React retains the exact draggable bookmarklet URL and a mobile copy fallback', async () => {
  await render(BookmarkletInstall, {});
  const link = container.querySelector('a');
  assert.equal(link.getAttribute('draggable'), 'true');
  assert.match(link.getAttribute('href'), /^javascript:/);
  assert.doesNotMatch(link.getAttribute('href'), /React has blocked/);
  assert.equal(link.getAttribute('href'), container.querySelector('textarea').value);
  assert.match(decodeURIComponent(link.getAttribute('href')), /IIDX_RADAR_DATA/);
});

test('personal fallback labels record samples without pretending they are other users', async () => {
  await render(RadarCategory, {
    category: { category: 'NOTES', current: 100, complete: true, issues: [] },
    tab: 'recommendations', onTabChange() {}, onSelect() {},
    preview: { data: { recommendations: [{ ...chart, basis: 'PERSONAL_LEVEL', peerCount: 0, sampleCount: 10 }], exploration: [] } },
  });
  assert.match(container.textContent, /같은 레벨·속성의 내 기록 · 개인 기록 10개/);
  assert.doesNotMatch(container.textContent, /10명|PERSONAL_LEVEL/);
});

test('incomplete official chart mapping blocks recommendations and preserves original rows', async () => {
  const category = { category: 'NOTES', current: 100, complete: false, top10: [{ title: 'Unmapped Official Song', value: 120 }], issues: ['보면 연결을 확인해 주세요.'] };
  await render(RadarCategory, { category, tab: 'recommendations', onTabChange() {} });
  assert.match(container.textContent, /계산 보류.*일부 공식 집계곡의 채보를 확인해야/);
  await render(RadarCategory, { category, tab: 'top10', onTabChange() {} });
  assert.match(container.textContent, /Unmapped Official Song/);
  assert.match(container.textContent, /채보 연결 확인 필요/);
  assert.match(container.textContent, /120.00/);
});

test('editable category goal sends a separate query and shows its minimum EX without changing recommendation target', async () => {
  await render(RadarCategory, {
    category: { category: 'NOTES', current: 100, complete: true, issues: [] },
    tab: 'recommendations', onTabChange() {}, goal: '110.25',
  });
  await act(async () => new Promise((resolve) => window.setTimeout(resolve, 280)));
  assert.equal(recommendationQuery.category, 'NOTES');
  assert.equal(recommendationQuery.filters.goal, 110.25);
  assert.match(container.textContent, /카테고리 목표 단독 달성 EX 1800/);
  assert.match(container.textContent, /추천 목표 EX1500/);
});

test('score editor sends integer EX and keeps simulation separate from goal saving', async () => {
  let reloadCount = 0;
  await render(RadarScoreEditor, { song: chart, category: 'NOTES', categoryTarget: 110, onClose() {}, onSaved: async () => { reloadCount += 1; } });
  await click('상승량 계산');
  assert.deepEqual(simulated, [{ chartId: 5, exScore: 1500 }]);
  assert.equal(saved, null);
  assert.match(document.body.textContent, /현재 100.00/);
  assert.match(document.body.textContent, /이 곡의 NOTES 곡 획득값 140.00/);
  assert.match(document.body.textContent, /카테고리 목표 110.00까지 6.00 남음/);
  await click('목표곡에 저장');
  assert.deepEqual(saved, { chartId: 5, category: 'NOTES', targetExScore: 1500 });
  assert.equal(reloadCount, 1);
  assert.match(document.body.textContent, /목표곡을 저장했습니다/);
});

test('multi-goal simulation deduplicates a chart selected for two categories', async () => {
  const goals = [
    { ...chart, id: 1, category: 'NOTES', targetExScore: 1500 },
    { ...chart, id: 2, category: 'CHORD', targetExScore: 1600 },
  ];
  await render(RadarGoals, { goals, onReload() {}, onEdit() {} });
  await act(async () => { container.querySelectorAll('input[type=checkbox]').forEach((checkbox) => checkbox.click()); });
  await click('선택한 2곡 함께 계산');
  assert.deepEqual(simulated, [{ chartId: 5, exScore: 1600 }]);
  assert.match(container.textContent, /확인 필요/);
});

test('blocked category simulation is shown as unavailable instead of a zero improvement', async () => {
  api.simulate = async () => ({ estimated: true, categories: [{ category: 'NOTES', before: 100, after: 100, gain: 0, blocked: true }] });
  await render(RadarScoreEditor, { song: chart, category: 'NOTES', categoryTarget: 110, onClose() {}, onSaved() {} });
  await click('상승량 계산');
  assert.match(document.body.textContent, /계산 보류/);
  assert.match(document.body.textContent, /공식 집계곡 또는 기준 데이터를 확인해야/);
  assert.doesNotMatch(document.body.textContent, /카테고리 목표 110.00까지/);
});

test('empty saved goals provide a category navigation action', async () => {
  await render(RadarGoals, { goals: [], onReload() {}, onEdit() {} });
  assert.match(container.textContent, /저장한 목표곡이 없습니다/);
  assert.equal(container.querySelector('a').getAttribute('href'), '/note-radar');
});

test('reimported TOP10 separates entered, updated, and departed official rows', async () => {
  const entered = { chartId: 11, title: 'Entered official song', chartType: 'ANOTHER', value: 140 };
  const updated = { chartId: 12, title: 'Updated official song', chartType: 'HYPER', value: 130 };
  const left = { chartId: 13, title: 'Departed official song', chartType: 'ANOTHER', value: 100 };
  await render(RadarCategory, { category: { category: 'NOTES', current: 100, complete: true,
    top10: [entered, updated], issues: [], changes: { entered: [entered], updated: [updated], left: [left] } },
  tab: 'top10', onTabChange() {} });
  const rows = container.querySelectorAll('ol > li');
  assert.match(rows[0].textContent, /Entered official song.*새로 진입.*140.00/);
  assert.match(rows[1].textContent, /Updated official song.*기록 갱신.*130.00/);
  assert.match(container.textContent, /이전 TOP10에서 제외.*Departed official song.*100.00/);
});
