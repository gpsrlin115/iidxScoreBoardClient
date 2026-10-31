import test from 'node:test';
import assert from 'node:assert/strict';
import { toScoreDialogSong, getScoreDialogDifficultyLabel } from '../src/utils/scoreDialog.js';

test('dialog receives the selected score and exact chart identity for equal song titles', () => {
  for (const [id, chartType, playStyle, level] of [[17, 'HYPER', 'SP', 9], [18, 'ANOTHER', 'DP', 12]]) {
    const score = { song: { title: 'Same title' }, chart: { id, chartType, playStyle, level }, bestScore: id * 100 };
    const dialog = toScoreDialogSong(score);
    assert.deepEqual(dialog, {
      chartId: id, title: 'Same title', difficulty: chartType, playStyle, level,
      scoreDetails: score, isFallbackScore: false,
    });
    assert.equal(dialog.scoreDetails, score);
  }
});

test('missing chart identity stays missing without borrowing another score', () => {
  const score = { song: { title: 'Same title' }, chart: { chartType: 'ANOTHER', level: 12, playStyle: 'SP' } };
  assert.equal(toScoreDialogSong(score).chartId, null);
  assert.equal(toScoreDialogSong(score).isFallbackScore, false);
});

test('score dialog labels share tier table abbreviation rules and preserve unknown types', () => {
  for (const [chartType, expected] of [
    ['BEGINNER', 'BEGINNER'], ['NORMAL', 'NORMAL'], ['hyper', 'H'],
    ['ANOTHER', 'A'], ['LEGGENDARIA', 'L'], ['EXPERT', 'EXPERT'], [null, undefined], ['', undefined],
  ]) {
    assert.equal(getScoreDialogDifficultyLabel({ chart: { chartType } }), expected);
  }
});
