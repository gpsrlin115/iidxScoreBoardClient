import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement, useEffect, useState } from 'react';
import { createServer } from 'vite';
import { toScoreDialogSong, getScoreDialogDifficultyLabel } from '../src/utils/scoreDialog.js';

let dom, vite, root, container, createRoot, MemoryRouter, ScoreCard, SongScoreDialog, SongFeedbackPanel, useTierVote, api;
let capturedVote;
const score = {
  id: 1, song: { title: 'Same song', artist: 'Artist', version: 'substream' },
  chart: { id: 42, playStyle: 'SP', chartType: 'HYPER', level: 9 },
  bestScore: 1234, bestClearType: 'HARD_CLEAR', lastScore: 1200, playCount: 3,
};
const calls = { feedback: [], comments: [], saves: [], creates: [] };
const feedback = (currentTier = null) => ({ currentTier, vote: { total: 0, counts: {}, myVote: null } });

before(async () => {
  dom = new JSDOM('<body></body>', { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  ({ MemoryRouter } = await import('react-router-dom'));
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  ({ default: ScoreCard } = await vite.ssrLoadModule('/src/components/scores/ScoreCard.jsx'));
  ({ default: SongScoreDialog } = await vite.ssrLoadModule('/src/components/tier-table/SongScoreDialog.jsx'));
  ({ default: SongFeedbackPanel } = await vite.ssrLoadModule('/src/components/tier-table/feedback/SongFeedbackPanel.jsx'));
  ({ default: useTierVote } = await vite.ssrLoadModule('/src/hooks/useTierVote.js'));
  ({ songFeedbackApi: api } = await vite.ssrLoadModule('/src/api/songFeedback.js'));
});
beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  container = document.createElement('div');
  document.body.replaceChildren(container);
  root = createRoot(container);
  for (const list of Object.values(calls)) list.length = 0;
  api.getFeedback = async (id) => { calls.feedback.push(id); return feedback(); };
  api.getComments = async (id) => {
    calls.comments.push(id);
    return { content: [{ id: 3, body: 'Existing comment', createdAt: '2026-10-23T01:00:00', author: { id: 2, nickname: 'Tester' } }], totalElements: 1, totalPages: 1 };
  };
  api.saveVote = async (...args) => { calls.saves.push(args); return {}; };
  api.clearVote = async (...args) => { calls.saves.push(args); return {}; };
  api.createComment = async (id, body) => {
    calls.creates.push({ id, body });
    return { id: 4, body, createdAt: '2026-10-23T01:00:00', author: { id: 1, nickname: 'Tester' } };
  };
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

function ScoreWithDialog({ selectedScore = score }) {
  const [open, setOpen] = useState(false);
  return createElement('div', null,
    createElement(ScoreCard, {
      score: selectedScore, onClick: () => setOpen(true), 'aria-haspopup': 'dialog',
      'aria-expanded': open, 'aria-controls': open ? 'score-detail' : undefined,
    }),
    open && createElement(SongScoreDialog, {
      id: 'score-detail', song: toScoreDialogSong(selectedScore),
      difficultyLabel: getScoreDialogDifficultyLabel(selectedScore), onClose: () => setOpen(false),
    }));
}
function VoteHarness() {
  const vote = useTierVote(42);
  useEffect(() => { capturedVote = vote; }, [vote]);
  return null;
}
const render = (Component, props) => act(async () => root.render(createElement(MemoryRouter, null, createElement(Component, props))));
const click = (element) => act(async () => element.click());

test('native score button opens one shared dialog and restores focus and body scroll on close', async () => {
  document.body.style.overflow = 'auto';
  await render(ScoreWithDialog);
  const trigger = container.querySelector('button');
  assert.equal(trigger.type, 'button');
  assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog');
  assert.match(trigger.textContent, /substream/);
  trigger.focus();
  await click(trigger);
  assert.equal(document.querySelectorAll('[role=dialog]').length, 1);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(document.activeElement.getAttribute('aria-label'), '상세 점수 닫기');
  assert.equal(document.body.style.overflow, 'hidden');
  assert.match(document.getElementById('score-detail').textContent, /1,234/);
  assert.deepEqual(calls.feedback, [42]);
  assert.deepEqual(calls.comments, [42]);
  await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(document.querySelector('[role=dialog]'), null);
  assert.equal(document.activeElement, trigger);
  assert.equal(document.body.style.overflow, 'auto');
  await click(trigger);
  await click(document.querySelector('[aria-label="상세 점수 닫기"]'));
  assert.equal(document.activeElement, trigger);
  await click(trigger);
  const backdrop = document.querySelector('[role=dialog]').parentElement;
  await act(async () => backdrop.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })));
  assert.equal(document.querySelector('[role=dialog]'), null);
  assert.equal(document.activeElement, trigger);
});

test('same-title ANOTHER uses its own chart, record and comments', async () => {
  const another = { ...score, chart: { ...score.chart, id: 84, chartType: 'ANOTHER', level: 12 }, bestScore: 2001 };
  await render(ScoreWithDialog, { selectedScore: another });
  await click(container.querySelector('button'));
  assert.match(document.getElementById('score-detail-title').textContent, /\[A\]/);
  assert.match(document.getElementById('score-detail').textContent, /2,001/);
  assert.deepEqual(calls.feedback, [84]);
  assert.deepEqual(calls.comments, [84]);
});

test('unassigned tier hides vote actions while existing comments and submission stay available', async () => {
  await render(SongFeedbackPanel, { chartId: 42, hasDifficulty: true });
  assert.match(container.textContent, /티어 미배정 채보는 투표할 수 없습니다/);
  assert.equal(container.querySelector('[aria-label="티어 적정성 투표"]'), null);
  assert.match(container.textContent, /Existing comment/);
  const textarea = container.querySelector('textarea');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'New comment');
    textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  const submit = [...container.querySelectorAll('button')].find((button) => button.textContent === '댓글 등록');
  assert.equal(submit.disabled, false);
  await click(submit);
  assert.deepEqual(calls.creates, [{ id: 42, body: 'New comment' }]);
  assert.match(container.textContent, /New comment/);
});

test('vote fetch errors and unavailable endpoint remain distinct from an unassigned tier', async () => {
  api.getFeedback = async () => { throw { response: { status: 503 } }; };
  await render(SongFeedbackPanel, { chartId: 42, hasDifficulty: true });
  assert.doesNotMatch(container.textContent, /티어 미배정/);
  assert.match(container.textContent, /HTTP 503/);
  assert.match(container.textContent, /Existing comment/);
  await act(async () => root.unmount());
  root = createRoot(container);
  api.getFeedback = async () => { throw { response: { status: 404 } }; };
  await render(SongFeedbackPanel, { chartId: 42, hasDifficulty: true });
  assert.match(container.textContent, /투표 기능은 준비 중입니다/);
  assert.doesNotMatch(container.textContent, /티어 미배정/);
  assert.match(container.textContent, /Existing comment/);
});

test('the hook rejects direct vote submission after loading an unassigned tier', async () => {
  await render(VoteHarness);
  assert.equal(capturedVote.isLoading, false);
  assert.equal(capturedVote.currentTier, null);
  await act(async () => capturedVote.submitVote('UP'));
  assert.deepEqual(calls.saves, []);
});

test('assigned charts still expose working vote actions', async () => {
  api.getFeedback = async () => feedback({ category: '지력', tier: 'B' });
  await render(SongFeedbackPanel, { chartId: 42, hasDifficulty: true });
  const vote = container.querySelector('[aria-label="상향 0표"]');
  assert.equal(vote.disabled, false);
  await click(vote);
  assert.deepEqual(calls.saves, [[42, 'UP']]);
});

test('series text preserves unknown versions and names missing data explicitly', async () => {
  await render(ScoreCard, { score: { ...score, song: { ...score.song, version: 'future release' } } });
  assert.match(container.textContent, /future release/);
  await render(ScoreCard, { score: { ...score, song: { ...score.song, version: null } } });
  assert.match(container.textContent, /시리즈 정보 없음/);
});
