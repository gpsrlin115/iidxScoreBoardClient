import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createServer } from 'vite';
import { card, response, step } from './fixtures/noteRadarTitleData.js';

let dom, vite, root, container, createRoot, MemoryRouter, RadarCategory, api, bodies, saved;
const category = { category: 'NOTES', current: 110, title: 'EMERALD', complete: true, issues: [], top10: [] };
const text = () => container.textContent;
const pause = (ms) => act(async () => new Promise((resolve) => window.setTimeout(resolve, ms)));
const until = async (check) => { for (let i = 0; i < 40 && !check(); i += 1) await pause(50); assert.ok(check(), 'condition not met'); };
const buttons = (label) => [...document.querySelectorAll('button')].filter((item) => item.textContent === label);
const click = (label) => act(async () => buttons(label)[0].click());
const planInputs = () => [...document.querySelectorAll('section[aria-label="칭호 계획"] input[inputmode="numeric"]')];
const type = (input, value) => act(async () => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
});
const simResult = (overrides = {}) => ({
  estimated: true, targets: [], targetValues: [],
  categories: [{ category: 'NOTES', before: 110, after: 119.5, gain: 9.5, displacedTitle: 'Gone Song', top10: [{ chartId: 5, title: 'Top A', value: 30 }], blocked: false, ...overrides }],
});
const twoSteps = () => response({ plan: { ...response().plan, steps: [step({ chartId: 1, title: 'One', targetExScore: 1550 }), step({ chartId: 2, title: 'Two', targetExScore: 1400 })] } });

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
  bodies = []; saved = [];
  api.simulate = async (targets) => { bodies.push(targets); return simResult(); };
  api.getGoals = async () => [];
  api.saveGoal = async (goal) => { saved.push(goal); return goal; };
});
after(async () => {
  if (root) await act(async () => root.unmount());
  await vite?.close();
  dom?.window.close();
  for (const key of ['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT']) delete globalThis[key];
});

async function show(data, props = {}) {
  api.getRecommendations = async () => data;
  await act(async () => root.render(null));
  await act(async () => root.render(createElement(MemoryRouter, null, createElement(RadarCategory, {
    category, tab: 'recommendations', onTabChange() {}, onSelect() {}, goal: '120', onRequestImport() {},
    onGoalChange() {}, importedAt: '2026-10-18T09:00:00Z', ...props,
  }))));
  await pause(450);
}

test('recalculation sends the plan targets; editing uses the edited value and hides server per-step values', async () => {
  await show(twoSteps());
  assert.match(text(), /누적 예상/);
  await click('묶음 다시 계산');
  await until(() => bodies.length === 1);
  assert.deepEqual(bodies[0], [{ chartId: 1, exScore: 1550 }, { chartId: 2, exScore: 1400 }]);
  assert.match(text(), /119\.50/);
  assert.match(text(), /밀려나는 곡: Gone Song/);
  assert.match(text(), /하한까지 남은 값 0\.50\(추정\)/);
  await type(planInputs()[0], '1600');
  assert.doesNotMatch(text(), /누적 예상/);
  assert.match(text(), /수정됨 · 다시 계산해 확인하세요/);
  assert.doesNotMatch(text(), /밀려나는 곡/);
  await click('묶음 다시 계산');
  await until(() => bodies.length === 2);
  assert.deepEqual(bodies[1][0], { chartId: 1, exScore: 1600 });
  await click('서버 계획으로 되돌리기');
  assert.equal(planInputs()[0].value, '1550');
  assert.match(text(), /누적 예상/);
});

test('invalid or empty bundle disables recalculation', async () => {
  await show(twoSteps());
  await type(planInputs()[0], '2001');
  assert.equal(planInputs()[0].getAttribute('aria-invalid'), 'true');
  assert.equal(buttons('묶음 다시 계산')[0].disabled, true);
  await type(planInputs()[0], '1500');
  assert.equal(buttons('묶음 다시 계산')[0].disabled, false);
  await click('빼기'); await click('빼기');
  assert.equal(buttons('묶음 다시 계산')[0].disabled, true);
  assert.equal(bodies.length, 0);
});

test('adding a card puts it in the bundle and the request body', async () => {
  await show(response({ recommendations: [card({ chartId: 9, title: 'Card Song', targetExScore: 1700 })] }));
  await click('묶음에 추가');
  assert.equal(buttons('묶음에 있음')[0].disabled, true);
  assert.equal(planInputs().length, 2);
  await click('묶음 다시 계산');
  await until(() => bodies.length === 1);
  assert.deepEqual(bodies[0], [{ chartId: 1, exScore: 1550 }, { chartId: 9, exScore: 1700 }]);
});

test('a blocked category shows 계산 보류 and never +0.00', async () => {
  api.simulate = async () => simResult({ after: 110, gain: 0, blocked: true, displacedTitle: null });
  await show(twoSteps());
  await click('묶음 다시 계산');
  await until(() => /계산 보류/.test(text()));
  assert.doesNotMatch(text(), /\+0\.00/);
});

test('save review classifies rows and leaves lower rows unchecked', async () => {
  api.getGoals = async () => [{ id: 7, chartId: 1, category: 'NOTES', targetExScore: 1500 }, { id: 8, chartId: 2, category: 'NOTES', targetExScore: 1450 }];
  await show(twoSteps());
  await click('저장 검토');
  await until(() => /상향/.test(text()));
  assert.match(text(), /상향\(기존 1500 → 1550\)/);
  assert.match(text(), /하향\(기존 1450 → 1400\)/);
  const box = document.querySelector('section[aria-label="묶음 목표 저장"] input[type="checkbox"]');
  assert.equal(box.checked, false);
  assert.ok(buttons('선택한 1개 저장').length);
  assert.match(text(), /선택한 칭호는 저장되지 않습니다/);
});

test('cap failure blocks saving', async () => {
  api.getGoals = async () => Array.from({ length: 50 }, (_, index) => ({ id: index, chartId: 100 + index, category: 'CHORD', targetExScore: 10 }));
  await show(twoSteps());
  await click('저장 검토');
  await until(() => /최대 50개/.test(text()));
  assert.equal(buttons('선택한 2개 저장')[0].disabled, true);
});

test('sequential save stops at the first failure and reports saved and failed charts', async () => {
  api.saveGoal = async (goal) => { saved.push(goal); if (goal.chartId === 2) throw new Error('boom'); return goal; };
  await show(response({ plan: { ...response().plan, steps: [1, 2, 3].map((id) => step({ chartId: id, title: `Song${id}` })) } }));
  await click('저장 검토');
  await until(() => buttons('선택한 3개 저장').length);
  await click('선택한 3개 저장');
  await until(() => /저장 실패/.test(text()));
  assert.deepEqual(saved.map((goal) => goal.chartId), [1, 2]);
  assert.match(text(), /저장 성공: Song1/);
  assert.match(text(), /저장 실패: Song2/);
  assert.match(text(), /이후 1개는 저장하지 않았습니다/);
});

test('onGoalsSaved runs after success; a refresh failure shows the saved-but-not-refreshed message', async () => {
  let calls = 0;
  await show(twoSteps(), { onGoalsSaved: async () => { calls += 1; return true; } });
  await click('저장 검토');
  await until(() => buttons('선택한 2개 저장').length);
  await click('선택한 2개 저장');
  await until(() => /2개를 저장했습니다/.test(text()));
  assert.equal(calls, 1);
  assert.deepEqual(saved.map((goal) => goal.targetExScore), [1550, 1400]);
  await show(twoSteps(), { onGoalsSaved: async () => false });
  await click('저장 검토');
  await until(() => buttons('선택한 2개 저장').length);
  await click('선택한 2개 저장');
  await until(() => /목록 새로고침에 실패/.test(text()));
});

test('unmounting during a save stops further saveGoal calls', async () => {
  let release;
  api.saveGoal = (goal) => { saved.push(goal); return new Promise((resolve) => { release = () => resolve(goal); }); };
  await show(twoSteps());
  await click('저장 검토');
  await until(() => buttons('선택한 2개 저장').length);
  await click('선택한 2개 저장');
  await until(() => saved.length === 1);
  assert.match(text(), /1\/2 저장 중/);
  await act(async () => root.unmount());
  await act(async () => release());
  await pause(100);
  assert.equal(saved.length, 1);
  root = createRoot(container);
});

test('the bundle is frozen while goals are being saved and unlocks afterwards', async () => {
  let release;
  api.saveGoal = (goal) => new Promise((resolve) => { saved.push(goal); release = () => resolve(goal); });
  await show(response({ recommendations: [card({ chartId: 7, title: 'Card Seven', targetExScore: 1700 })] }));
  await click('저장 검토');
  await until(() => buttons('선택한 1개 저장').length === 1);
  await click('선택한 1개 저장');
  await until(() => saved.length === 1);
  assert.ok(planInputs().every((input) => input.disabled));
  assert.ok(buttons('빼기').every((button) => button.disabled));
  assert.ok(buttons('묶음 다시 계산').every((button) => button.disabled));
  assert.ok(buttons('묶음에 추가').every((button) => button.disabled));
  await act(async () => release());
  await until(() => /목표 1개를 저장했습니다/.test(text()));
  assert.ok(planInputs().every((input) => !input.disabled));
  assert.ok(buttons('묶음에 추가').some((button) => !button.disabled));
});

test('saved goals reach the goal list after a partial failure or an unmount, and replacing a value is labelled', async () => {
  let reloads = 0;
  const onGoalsSaved = async () => { reloads += 1; return true; };
  api.saveGoal = async (goal) => { if (goal.chartId === 2) throw Object.assign(new Error('x'), { response: { status: 400, data: { code: 'INVALID_RADAR_INPUT', message: 'bad' } } }); saved.push(goal); return goal; };
  await show(twoSteps(), { onGoalsSaved });
  await click('저장 검토');
  await until(() => buttons('선택한 2개 저장').length === 1);
  await click('선택한 2개 저장');
  await until(() => /저장 실패/.test(text()));
  await until(() => reloads === 1);
  let release;
  api.saveGoal = (goal) => { saved.push(goal); return new Promise((resolve) => { release = () => resolve(goal); }); };
  await show(twoSteps(), { onGoalsSaved });
  await click('저장 검토');
  await until(() => buttons('선택한 2개 저장').length === 1);
  await click('선택한 2개 저장');
  await until(() => typeof release === 'function');
  await act(async () => root.unmount());
  await act(async () => release());
  await pause(100);
  assert.equal(reloads, 2);
  root = createRoot(container);
  await show(response({ recommendations: [card({ chartId: 1, targetExScore: 1700 })], plan: { ...response().plan, steps: [step({ chartId: 1, targetExScore: 1550, noteCount: null })] } }));
  assert.equal(buttons('묶음 값을 1700으로').length, 1);
  assert.match(text(), /0 이상의 정수/);
});
