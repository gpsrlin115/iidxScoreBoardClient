import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KONAMI_SEQUENCE,
  advanceKonami,
  isPageTarget,
  toKonamiInput,
} from '../src/utils/konamiCode.js';

const COMPLETE = KONAMI_SEQUENCE.length;

/** Feeds steps in order and returns the progress after each one. */
const replay = (steps, start = 0) => {
  let progress = start;
  return steps.map((step) => {
    progress = advanceKonami(progress, step);
    return progress;
  });
};

test('the code is Enter, then ↑ ↑ ↓ ↓ ← → ← → B A', () => {
  assert.deepEqual(KONAMI_SEQUENCE, [
    'Enter',
    'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
    'KeyB', 'KeyA',
  ]);
});

test('the full sequence completes on the final A', () => {
  const trail = replay(KONAMI_SEQUENCE);

  assert.deepEqual(trail, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(trail.at(-1), COMPLETE);
});

test('arrows without the leading Enter never make progress', () => {
  // Scrolling with the arrow keys must not light up the arrow row.
  assert.deepEqual(replay(KONAMI_SEQUENCE.slice(1)), new Array(COMPLETE - 1).fill(0));
});

test('a wrong step starts over', () => {
  // The third ↑ should have been ↓.
  assert.deepEqual(replay(['Enter', 'ArrowUp', 'ArrowUp', 'ArrowUp']), [1, 2, 3, 0]);
});

test('a stray Enter mid-sequence begins a fresh attempt that can still complete', () => {
  const trail = replay(['Enter', 'ArrowUp', 'ArrowUp', ...KONAMI_SEQUENCE]);

  assert.deepEqual(trail.slice(0, 4), [1, 2, 3, 1]);
  assert.equal(trail.at(-1), COMPLETE);
});

test('B and A match on the physical key under the Korean IME', () => {
  assert.equal(toKonamiInput({ key: 'ㅠ', code: 'KeyB' }), 'KeyB');
  assert.equal(toKonamiInput({ key: 'ㅁ', code: 'KeyA' }), 'KeyA');
  assert.equal(toKonamiInput({ key: 'Process', code: 'KeyB' }), 'KeyB');
});

test('letter case and the numpad Enter make no difference', () => {
  assert.equal(toKonamiInput({ key: 'B', code: 'KeyB' }), 'KeyB');
  assert.equal(toKonamiInput({ key: 'a', code: 'KeyA' }), 'KeyA');
  assert.equal(toKonamiInput({ key: 'Enter', code: 'NumpadEnter' }), 'Enter');
  assert.equal(toKonamiInput({ key: 'ArrowLeft', code: 'ArrowLeft' }), 'ArrowLeft');
});

test('keys outside the sequence map to null', () => {
  const unrelated = [
    { key: 'Shift', code: 'ShiftLeft' },
    { key: 'HangulMode', code: 'Lang1' },
    { key: 'x', code: 'KeyX' },
    { key: ' ', code: 'Space' },
    { key: 'Escape', code: 'Escape' },
  ];

  for (const event of unrelated) {
    assert.equal(toKonamiInput(event), null, event.code);
  }
});

test('only keys aimed at the page itself count', () => {
  assert.equal(isPageTarget({ tagName: 'BODY' }), true);
  assert.equal(isPageTarget({ tagName: 'HTML' }), true);
  assert.equal(isPageTarget(null), true);

  // Enter on these presses the control, edits text, or belongs to a dialog.
  for (const tagName of ['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'DIV']) {
    assert.equal(isPageTarget({ tagName }), false, tagName);
  }
});
