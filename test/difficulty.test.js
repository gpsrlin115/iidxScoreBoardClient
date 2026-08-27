import test from 'node:test';
import assert from 'node:assert/strict';

import { getDifficultyDisplay } from '../src/utils/difficulty.js';

test('known difficulties have concise and full labels', () => {
  assert.deepEqual(getDifficultyDisplay('BEGINNER'), {
    key: 'BEGINNER',
    label: 'B',
    fullLabel: 'BEGINNER',
  });
  assert.deepEqual(getDifficultyDisplay('NORMAL'), {
    key: 'NORMAL',
    label: 'N',
    fullLabel: 'NORMAL',
  });
  assert.deepEqual(getDifficultyDisplay('HYPER'), {
    key: 'HYPER',
    label: 'H',
    fullLabel: 'HYPER',
  });
  assert.deepEqual(getDifficultyDisplay('ANOTHER'), {
    key: 'ANOTHER',
    label: 'A',
    fullLabel: 'ANOTHER',
  });
  assert.deepEqual(getDifficultyDisplay('LEGGENDARIA'), {
    key: 'LEGGENDARIA',
    label: 'L',
    fullLabel: 'LEGGENDARIA',
  });
});

test('known difficulties are normalized case-insensitively and ignore surrounding whitespace', () => {
  assert.strictEqual(getDifficultyDisplay(' hyper '), getDifficultyDisplay('HYPER'));
  assert.strictEqual(getDifficultyDisplay('Leggendaria'), getDifficultyDisplay('LEGGENDARIA'));
});

test('missing difficulties expose an explicit diagnostic label', () => {
  const expected = { key: null, label: '?', fullLabel: '난이도 정보 없음' };

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
  });
  assert.deepEqual(getDifficultyDisplay('future-difficulty'), {
    key: null,
    label: 'future-difficulty',
    fullLabel: 'future-difficulty',
  });
});
