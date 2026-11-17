import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createServer } from 'vite';
import { card, legacy, numericResponse, response, step } from './fixtures/noteRadarTitleData.js';

let dom, vite, root, container, createRoot, MemoryRouter, RadarCategory, api, reply;
const category = { category: 'NOTES', current: 110, title: 'EMERALD', complete: true, issues: [], top10: [{ chartId: 3, title: 'Top Song', chartType: 'HYPER', value: 20 }] };
const text = () => container.textContent;

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
  reply = response();
  api.getRecommendations = async () => reply;
});
after(async () => {
  if (root) await act(async () => root.unmount());
  await vite?.close();
  dom?.window.close();
  for (const key of ['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT']) delete globalThis[key];
});

const wait = () => act(async () => new Promise((resolve) => window.setTimeout(resolve, 400)));
async function show(data, props = {}) {
  reply = data;
  await act(async () => root.render(null));
  await act(async () => root.render(createElement(MemoryRouter, null, createElement(RadarCategory, {
    category, tab: 'recommendations', onTabChange() {}, onSelect() {}, goal: '120', onRequestImport() {},
    importedAt: '2026-10-18T09:00:00Z', ...props,
  }))));
  await wait();
}
const buttons = (label) => [...document.querySelectorAll('button')].filter((item) => item.textContent === label);

test('each goal status renders its banner and unknown statuses are surfaced', async () => {
  const goal = (status, extra = {}) => response({ goal: { ...response().goal, status, ...extra } });
  await show(goal('MISSING_OFFICIAL', { currentValue: null, remainingGap: null }));
  assert.match(text(), /공식 레이더를 먼저 가져와야/);
  assert.equal(buttons('공식 레이더 가져오기').length, 1);
  assert.doesNotMatch(text(), /부족분/);
  await show(goal('ALREADY_ACHIEVED'));
  assert.match(text(), /추가 플레이가 필요하지 않습니다/);
  await show(goal('BLOCKED'));
  assert.match(text(), /계산 보류 · 아래 사유를 확인해 주세요/);
  await show(goal('REFRESH_REQUIRED'));
  assert.equal(buttons('공식 레이더 다시 가져오기').length, 1);
  await show(goal('NEEDS_PLAY'));
  assert.match(text(), /추가 플레이가 필요합니다/);
  await show(goal('SOMETHING_NEW'));
  assert.match(text(), /확인 필요\(SOMETHING_NEW\)/);
});

test('BLOCKED hides plan steps even when the plan has steps', async () => {
  await show(response({ goal: { ...response().goal, status: 'BLOCKED' }, issues: ['Korean reason'] }));
  assert.equal(document.querySelectorAll('ol li').length, 0);
  assert.doesNotMatch(text(), /칭호 계획/);
  assert.match(text(), /Korean reason/);
  await show(response({ plan: { ...response().plan, status: 'BLOCKED' } }));
  assert.doesNotMatch(text(), /누적 예상/);
});

test('NO_OBSERVATION never renders as zero and historical record time is labelled', async () => {
  await show(response({ plan: null, recommendations: [card({ historicalBestExScore: 1400, historicalRecordUpdatedAt: '2026-09-01T00:00:00Z',
    historicalPlayedAt: '1999-01-01T00:00:00Z', historicalComparability: 'UNVERIFIED' })] }));
  const view = text();
  assert.match(view, /현 작품 관측 EX관측 없음/);
  assert.doesNotMatch(view, /현 작품 관측 EX0/);
  assert.match(view, /기록 갱신 시각\(플레이 날짜 아님\)/);
  assert.doesNotMatch(view, /1999/);
  assert.match(view, /누적 최고 EX1400/);
});

test('single chart goal states and server order are respected', async () => {
  const items = [
    card({ chartId: 1, title: 'Low Gain First', gain: 0.5, singleChartGoalStatus: 'SINGLE_CHART_UNREACHABLE' }),
    card({ chartId: 2, title: 'High Gain Second', gain: 9, goalExScore: 1800, singleChartGoalStatus: 'REACHABLE' }),
  ];
  await show(response({ plan: null, recommendations: items }));
  assert.match(text(), /이 곡 하나만으로는 칭호 하한에 닿지 않습니다/);
  assert.match(text(), /이 곡만으로 목표 하한에 닿는 EX 1800/);
  assert.ok(text().indexOf('Low Gain First') < text().indexOf('High Gain Second'));
  assert.match(text(), /서버 기준/);
});

test('refresh required cards are separate and have no edit button', async () => {
  await show(response({ plan: null, recommendations: [card({ title: 'Replay Song' })],
    refreshRequired: [card({ chartId: 7, title: 'Refresh Song', status: 'OFFICIAL_REFRESH_REQUIRED' })] }));
  const section = document.querySelector('section[aria-label="공식 갱신 확인"]');
  assert.ok(section);
  assert.match(section.textContent, /Refresh Song/);
  assert.match(section.textContent, /공식 레이더를 다시 가져와 반영 여부를 확인하세요/);
  assert.equal(section.querySelectorAll('button').length, 0);
  assert.equal(buttons('목표 EX 조정 · 저장').length, 1);
});

test('plan uses step values and cumulative labels, PARTIAL states the gap without claiming impossibility', async () => {
  await show(response({ recommendations: [card({ targetExScore: 1700 })], plan: { ...response().plan, remainingGap: 7.5, steps: [step({ targetExScore: 1550, after: 111.2 })] } }));
  const plan = document.querySelector('section[aria-label="칭호 계획"]');
  assert.equal(plan.querySelector('input').value, '1550');
  assert.match(plan.textContent, /누적 예상 111.20/);
  assert.match(plan.textContent, /누적 교체곡: Replaced One/);
  assert.match(plan.textContent, /하한까지 7.50 남습니다\(추정\)/);
  assert.equal((plan.textContent.match(/불가능/g) ?? []).length, 1);
  assert.match(plan.textContent, /불가능하다는 뜻은 아닙니다/);
  assert.match(plan.textContent, /최종 예상 칭호 EMERALD\(추정\)/);
});

test('plan labels the active filters and offers a filter reset when no candidates', async () => {
  const cleared = [];
  await show(response({ plan: { ...response().plan, status: 'NO_CANDIDATES', steps: [] } }),
    { filters: { level: '12', chartType: '', record: '' }, onFilterChange: (key, value) => cleared.push([key, value]) });
  assert.match(text(), /현재 조건에서 계획을 만들 후보가 없습니다/);
  assert.match(text(), /현재 필터\(레벨·난이도·기록\) 안에서 계산한 계획입니다/);
  await act(async () => buttons('필터 해제')[0].click());
  assert.deepEqual(cleared, [['level', ''], ['chartType', ''], ['record', '']]);
  await show(response({ plan: { ...response().plan, status: 'ESTIMATED_REACHED' } }));
  assert.match(text(), /도달할 것으로 예상됩니다\(추정\)/);
});

test('empty lists: NEEDS_PLAY explains, ALREADY_ACHIEVED stays quiet', async () => {
  // The plan's NO_CANDIDATES banner already explains it, so the generic empty text is not repeated.
  await show(response({ plan: { ...response().plan, status: 'NO_CANDIDATES', steps: [] } }));
  assert.match(text(), /현재 조건에서 계획을 만들 후보가 없습니다/);
  assert.doesNotMatch(text(), /조건에 맞는 후보가 없습니다\. 필터를 바꾸거나/);
  await show(response());
  assert.match(text(), /조건에 맞는 후보가 없습니다\. 필터를 바꾸거나/);
  await show(response({ goal: { ...response().goal, status: 'ALREADY_ACHIEVED' }, plan: { ...response().plan, status: 'ALREADY_ACHIEVED', steps: [] } }));
  assert.doesNotMatch(text(), /추천곡이 없습니다|조건에 맞는 후보가 없습니다/);
  assert.doesNotMatch(text(), /칭호 계획/);
});

test('old server notice for a title request without goal key', async () => {
  await show(legacy('Old Server Song'));
  assert.match(text(), /서버가 아직 칭호 추천을 지원하지 않아 상승량 중심 결과를 보여 줍니다/);
  assert.match(text(), /상승량 중심 · 서버가 칭호 추천을 지원하지 않음/);
  assert.match(text(), /Old Server Song/);
});

test('a numeric goal draws its plan in goal-value wording without the old stopgap', async () => {
  const goal = { ...response().goal, requestedTitle: null, targetValue: 145, remainingGap: 35 };
  await show(response({ goal, plan: { ...response().plan, remainingGap: 32.5 }, recommendations: [
    card({ singleChartGoalStatus: 'SINGLE_CHART_UNREACHABLE' }),
    card({ chartId: 2, songId: 2, title: 'Second', singleChartGoalStatus: 'REACHABLE', goalExScore: 1900 }),
  ] }), { goal: '145' });
  assert.match(text(), /수치 추천 · 145/);
  assert.match(text(), /목표 계획/);
  assert.doesNotMatch(text(), /칭호 계획/);
  assert.match(text(), /목표 수치에 가까워지는 순서/);
  assert.match(text(), /계획대로 내도 목표 수치까지 32\.50 남습니다/);
  assert.match(text(), /이 곡 하나만으로는 목표 수치에 닿지 않습니다/);
  assert.match(text(), /이 곡만으로 목표 수치에 닿는 EX 1900/);
  assert.doesNotMatch(text(), /다곡 계획이 없습니다|하한/);
  assert.equal([...document.querySelectorAll('button')].filter((item) => item.textContent.startsWith('가까운 칭호')).length, 0);
  // An old server still answers a number without a plan; the removed notice must not come back.
  await show(numericResponse(), { goal: '145' });
  assert.match(text(), /Numeric Song/);
  assert.doesNotMatch(text(), /다곡 계획이 없습니다/);
});

test('TOP10 tab falls back to an estimated gap from the category value', async () => {
  await show(response(), { tab: 'top10' });
  assert.match(text(), /목표DIAMOND 하한 120.00/);
  assert.match(text(), /부족분10.00 \(추정\)/);
  await show(response(), { tab: 'top10', category: { ...category, current: null } });
  assert.match(text(), /현재 수치 확인 필요/);
});

test('exactly 100 items show the display limit notice', async () => {
  const items = Array.from({ length: 100 }, (_, index) => card({ chartId: index + 1, title: `Song ${index + 1}` }));
  await show(response({ plan: null, recommendations: items }));
  assert.match(text(), /최대 100개까지 표시합니다/);
});

test('over-max observations, unknown observation time, basis counts and status wording follow the server meaning', async () => {
  await show(response({ plan: null, recommendations: [
    card({ releaseExScore: 2300, releaseObservationStatus: 'SCORE_EXCEEDS_CURRENT_MAX', basis: 'TITLE_REQUIRED_SCORE', sampleCount: 9 }),
    card({ chartId: 2, songId: 2, title: 'Second', releaseExScore: 900, releaseObservationStatus: 'OBSERVATION_TIME_UNKNOWN' }),
  ] }));
  assert.doesNotMatch(text(), /현 작품 관측 EX2300/);
  assert.match(text(), /현재 만점 초과\(비교 불가\)/);
  assert.match(text(), /관측 시각 불명/);
  assert.doesNotMatch(text(), /확인 필요\(OBSERVATION_TIME_UNKNOWN\)/);
  assert.doesNotMatch(text(), /칭호 도달에 필요한 점수 · 개인 기록/);
  await show(numericResponse({ goal: { ...numericResponse().goal, status: 'ALREADY_ACHIEVED', remainingGap: 0 } }), { goal: '145' });
  assert.match(text(), /목표 수치 이상입니다/);
  await show(response({ goal: { ...response().goal, status: 'REFRESH_REQUIRED' } }));
  assert.match(text(), /칭호 도달을 뜻하지는 않습니다/);
  await show(response(), { category: { ...category, complete: false } });
  assert.match(text(), /부족분계산 보류/);
});
