/**
 * Key-sequence rules for the Konami-code easter egg
 * (`src/components/easter-egg/KonamiEasterEgg.jsx`).
 *
 * Kept free of React and the DOM so the matching rules can be exercised
 * directly under plain `node:test`.
 */

/**
 * Enter first, then the classic ↑ ↑ ↓ ↓ ← → ← → B A.
 *
 * Leading with Enter keeps the egg out of ordinary browsing: arrow keys
 * scroll the page all the time, so a sequence that began on ↑ would light up
 * the arrow row whenever someone scrolled.
 */
export const KONAMI_SEQUENCE = Object.freeze([
  'Enter',
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'KeyB', 'KeyA',
]);

/** A sequence left alone for this long starts over. */
export const KONAMI_IDLE_MS = 2000;

const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/**
 * Maps a keyboard event to a sequence step, or null for a key the sequence
 * does not use. Callers ignore null outright, so Shift, 한/영 and friends
 * neither advance nor break a sequence.
 *
 * B and A also match on the physical key (`code`). With the Korean IME in
 * Hangul mode `key` arrives as 'ㅠ' / 'ㅁ' (or 'Process'), and a `key`-only
 * check would make the code impossible to type on a Korean layout.
 *
 * @param {{ key?: string, code?: string }} event
 * @returns {string | null}
 */
export const toKonamiInput = ({ key, code }) => {
  if (key === 'Enter') return 'Enter';
  if (ARROW_KEYS.has(key)) return key;
  if (code === 'KeyB' || key === 'b' || key === 'B') return 'KeyB';
  if (code === 'KeyA' || key === 'a' || key === 'A') return 'KeyA';
  return null;
};

/**
 * Advances the sequence by one step.
 *
 * A wrong step starts over, except a stray Enter: Enter is itself step one,
 * so it begins a fresh attempt instead. Enter appears nowhere else in the
 * sequence, which makes that the only overlap a restart can reuse.
 *
 * @param {number} progress - Steps already matched.
 * @param {string} input - A step from `toKonamiInput`.
 * @returns {number} Steps matched afterwards. `KONAMI_SEQUENCE.length`
 *   means the code is complete.
 */
export const advanceKonami = (progress, input) => {
  if (input === KONAMI_SEQUENCE[progress]) return progress + 1;
  return input === KONAMI_SEQUENCE[0] ? 1 : 0;
};

/**
 * Whether a key event was aimed at the page itself rather than at a control.
 *
 * Keys only count while nothing is focused, when events target <body>. Enter
 * on a focused button or link activates it, so counting that as step one
 * would play the jingle every time a keyboard user pressed a button. The same
 * rule keeps text fields and open dialogs out.
 *
 * @param {{ tagName?: string } | null} target
 * @returns {boolean}
 */
export const isPageTarget = (target) => (
  !target || target.tagName === 'BODY' || target.tagName === 'HTML'
);
