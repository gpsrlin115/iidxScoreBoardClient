import test from 'node:test';
import assert from 'node:assert/strict';

import { getDifficultyDisplay } from '../src/utils/difficulty.js';

test('known difficulties have concise and full labels', () => {
  assert.deepEqual(getDifficultyDisplay('BEGINNER'), {
    key: 'BEGINNER',
    label: 'B',
    fullLabel: 'BEGINNER',
    isMissing: false,
  });
  assert.deepEqual(getDifficultyDisplay('NORMAL'), {
    key: 'NORMAL',
    label: 'N',
    fullLabel: 'NORMAL',
    isMissing: false,
  });
  assert.deepEqual(getDifficultyDisplay('HYPER'), {
    key: 'HYPER',
    label: 'H',
    fullLabel: 'HYPER',
    isMissing: false,
  });
  assert.deepEqual(getDifficultyDisplay('ANOTHER'), {
    key: 'ANOTHER',
    label: 'A',
    fullLabel: 'ANOTHER',
    isMissing: false,
  });
  assert.deepEqual(getDifficultyDisplay('LEGGENDARIA'), {
    key: 'LEGGENDARIA',
    label: 'L',
    fullLabel: 'LEGGENDARIA',
    isMissing: false,
  });
});

test('known difficulties are normalized case-insensitively and ignore surrounding whitespace', () => {
  assert.strictEqual(getDifficultyDisplay(' hyper '), getDifficultyDisplay('HYPER'));
  assert.strictEqual(getDifficultyDisplay('Leggendaria'), getDifficultyDisplay('LEGGENDARIA'));
});

test('missing difficulties expose an explicit diagnostic label', () => {
  const expected = { key: null, label: '?', fullLabel: '난이도 정보 없음', isMissing: true };

  assert.deepEqual(getDifficultyDisplay(undefined), expected);
  assert.deepEqual(getDifficultyDisplay(null), expected);
  assert.deepEqual(getDifficultyDisplay(''), expected);
  assert.deepEqual(getDifficultyDisplay('   '), expected);
  assert.strictEqual(getDifficultyDisplay(undefined), getDifficultyDisplay(''));
});

test('unknown non-empty values remain visible without being mislabelled', () => {
  assert.deepEqual(getDifficultyDisplay(' EXPERT '), {
    key: null,
    label: 'EXPERT',
    fullLabel: 'EXPERT',
    isMissing: false,
  });
  assert.deepEqual(getDifficultyDisplay('future-difficulty'), {
    key: null,
    label: 'future-difficulty',
    fullLabel: 'future-difficulty',
    isMissing: false,
  });
});

test('a literal question mark is an unknown value rather than a missing difficulty', () => {
  const display = getDifficultyDisplay(' ? ');

  assert.deepEqual(display, {
    key: null,
    label: '?',
    fullLabel: '?',
    isMissing: false,
  });
  assert.equal(display.label, getDifficultyDisplay(null).label);
  assert.notEqual(display.isMissing, getDifficultyDisplay(null).isMissing);
});
