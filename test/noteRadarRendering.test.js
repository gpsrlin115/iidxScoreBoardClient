import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { createServer } from 'vite';

let dom, vite, root, container, RadarCategory, RadarScoreEditor, RadarGoals, BookmarkletInstall, api;
let simulated, saved, recommendationQuery;
const chart = { chartId: 5, songId: 2, title: 'Radar Song', chartType: 'ANOTHER', level: 12, noteCount: 1000, currentExScore: 0, targetExScore: 1500, targetRate: 75, minExScore: 1300, radarValue: 140, gain: 4, peerCount: 7, basis: 'PEERS' };

before(async () => {
  dom = new JSDOM('<body></body>', { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vite = await createServer({ server: { middlewareMode: true, hmr: false } });
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
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = (component, props) => act(async () => root.render(createElement(component, props)));
const click = async (label) => act(async () => {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent === label);
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
  assert.match(container.textContent, /곡 획득값140.00/);
  assert.match(container.textContent, /평균 상승\+4.00/);
  assert.match(container.textContent, /참고 7명/);
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
  assert.match(container.textContent, /같은 레벨·속성의 내 기록 · 참고 10개 기록/);
  assert.doesNotMatch(container.textContent, /10명|PERSONAL_LEVEL/);
});

test('incomplete official chart mapping blocks recommendations and preserves original rows', async () => {
  const category = { category: 'NOTES', current: 100, complete: false, top10: [{ title: 'Unmapped Official Song', value: 120 }], issues: ['보면 연결을 확인해 주세요.'] };
  await render(RadarCategory, { category, tab: 'recommendations', onTabChange() {} });
  assert.match(container.textContent, /집계곡을 모두 확인한 뒤/);
  await render(RadarCategory, { category, tab: 'top10', onTabChange() {} });
  assert.match(container.textContent, /Unmapped Official Song/);
  assert.match(container.textContent, /보면 연결 미확인/);
  assert.match(container.textContent, /120.00/);
});

test('editable category goal sends a separate query and shows its minimum EX without changing recommendation target', async () => {
  await render(RadarCategory, {
    category: { category: 'NOTES', current: 100, complete: true, issues: [] },
    tab: 'recommendations', onTabChange() {}, goal: '110.25',
  });
  assert.equal(recommendationQuery.category, 'NOTES');
  assert.equal(recommendationQuery.filters.goal, 110.25);
  assert.match(container.textContent, /카테고리 목표 단독 달성: EX 1800/);
  assert.match(container.textContent, /추천 목표EX 1500/);
});

test('score editor sends integer EX and keeps simulation separate from goal saving', async () => {
  let reloadCount = 0;
  await render(RadarScoreEditor, { song: chart, category: 'NOTES', categoryTarget: 110, onClose() {}, onSaved: async () => { reloadCount += 1; } });
  await click('상승량 계산');
  assert.deepEqual(simulated, [{ chartId: 5, exScore: 1500 }]);
  assert.equal(saved, null);
  assert.match(container.textContent, /현재 100.00/);
  assert.match(container.textContent, /이 곡의 NOTES 획득값: 140.00/);
  assert.match(container.textContent, /목표 110.00까지 6.00 남음/);
  await click('목표곡에 저장');
  assert.deepEqual(saved, { chartId: 5, category: 'NOTES', targetExScore: 1500 });
  assert.equal(reloadCount, 1);
  assert.match(container.textContent, /목표곡을 저장했습니다/);
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
  assert.match(container.textContent, /달성 여부 미확인/);
});

test('blocked category simulation is shown as unavailable instead of a zero improvement', async () => {
  api.simulate = async () => ({ estimated: true, categories: [{ category: 'NOTES', before: 100, after: 100, gain: 0, blocked: true }] });
  await render(RadarScoreEditor, { song: chart, category: 'NOTES', categoryTarget: 110, onClose() {}, onSaved() {} });
  await click('상승량 계산');
  assert.match(container.textContent, /계산 보류/);
  assert.match(container.textContent, /일부 집계곡을 식별하지 못했습니다/);
  assert.doesNotMatch(container.textContent, /목표 110.00까지/);
});
