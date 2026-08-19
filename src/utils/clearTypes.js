export const normalizeClearType = (clearType) => {
  if (!clearType) return null;

  const normalized = String(clearType)
    .trim()
    .toUpperCase()
    .replaceAll('-', '_')
    .replaceAll(' ', '_');

  if (['FULL_COMBO', 'FULLCOMBO', 'FULLCOMBO_CLEAR'].includes(normalized)) {
    return 'FULLCOMBO_CLEAR';
  }

  if (['EXHARD', 'EX_HARD'].includes(normalized)) {
    return 'EX_HARD_CLEAR';
  }

  return normalized;
};

export const CLEAR_TYPE_LABELS = {
  FULLCOMBO_CLEAR: 'FC',
  EX_HARD_CLEAR: 'EX-H',
  HARD_CLEAR: 'HARD',
  CLEAR: 'CLR',
  EASY_CLEAR: 'EASY',
  ASSIST_CLEAR: 'AC',
  FAILED: 'FAIL',
  NO_PLAY: 'NO PLAY',
};

const CLEAR_TYPES = new Set([
  'ASSIST_CLEAR',
  'EASY_CLEAR',
  'CLEAR',
  'HARD_CLEAR',
  'EX_HARD_CLEAR',
  'FULLCOMBO_CLEAR',
]);

export const isClearTypeCleared = (clearType) => CLEAR_TYPES.has(normalizeClearType(clearType));

// Full clear-type styling palette, ported verbatim from
// docs/design_handoff_night_sky_redesign/iidx-data.js (CLEAR object, lines 3-14).
// `bg` is the chip/badge background (FULLCOMBO_CLEAR uses a gold gradient
// string, every other type is a flat color or rgba string); `solid` is a
// single flat color for bar segments, legend swatches, and glow bases; `fg`
// is the foreground/text color; `bd` is the border color.
export const CLEAR_PALETTE = {
  FULLCOMBO_CLEAR: {
    bg: 'linear-gradient(100deg,#efd97f,#fffaf0 45%,#eccf72)',
    solid: '#f3e2a0',
    fg: '#170f04',
    bd: '#c2a04e',
  },
  EX_HARD_CLEAR: { bg: '#f0bf4d', solid: '#f0bf4d', fg: '#170f03', bd: '#b48a22' },
  HARD_CLEAR: { bg: '#f1f2f7', solid: '#f1f2f7', fg: '#0a0c13', bd: '#b6bac6' },
  CLEAR: { bg: '#3f7bd8', solid: '#4b85dd', fg: '#eef4ff', bd: '#2c5aa9' },
  EASY_CLEAR: { bg: '#2f9d5f', solid: '#37ab69', fg: '#eefff5', bd: '#1f7446' },
  ASSIST_CLEAR: { bg: '#8558cf', solid: '#8f63d6', fg: '#f5efff', bd: '#653da6' },
  FAILED: {
    bg: 'rgba(126,133,150,.3)',
    solid: 'rgba(150,158,175,.55)',
    fg: '#98a0b2',
    bd: 'rgba(150,158,175,.34)',
  },
  NO_PLAY: {
    bg: 'rgba(255,255,255,.03)',
    solid: 'rgba(255,255,255,.13)',
    fg: '#5b6274',
    bd: 'rgba(255,255,255,.07)',
  },
};

// Display order for clear-type bars, legends, and stacks: best clear first.
export const CLEAR_ORDER = [
  'FULLCOMBO_CLEAR',
  'EX_HARD_CLEAR',
  'HARD_CLEAR',
  'CLEAR',
  'EASY_CLEAR',
  'ASSIST_CLEAR',
  'FAILED',
  'NO_PLAY',
];

// Sort-friendly numeric rank, derived from CLEAR_ORDER so the two never drift
// apart: NO_PLAY is worst (0), FULLCOMBO_CLEAR is best (CLEAR_ORDER.length - 1).
export const CLEAR_RANK = CLEAR_ORDER.reduce((acc, key, index) => {
  acc[key] = CLEAR_ORDER.length - 1 - index;
  return acc;
}, {});

// Glow for full-combo song chips in the tier table. Deliberately the pink from
// DIST_GROUPS rather than the chip's own gold: the gold fill already reads as
// gold, so a gold halo would disappear into it. Design spec fixes this value.
export const FC_CHIP_GLOW = '0 0 12px rgba(248,113,160,.3)';

/**
 * Glow box-shadow for a given clear type, built from CLEAR_PALETTE[type].solid.
 *
 * Constraint: `solid` is an rgba(...) string for FAILED and NO_PLAY, so
 * appending a hex alpha suffix ('66') to it would produce an invalid CSS
 * value (e.g. "rgba(150,158,175,.55)66"). Only actual clear types (per
 * isClearTypeCleared) get a real glow; FAILED, NO_PLAY, and any
 * unrecognized clear type return 'none'.
 */
export const clearGlow = (clearType) => {
  const normalized = normalizeClearType(clearType);
  if (!isClearTypeCleared(normalized)) return 'none';

  const solid = CLEAR_PALETTE[normalized]?.solid;
  if (!solid) return 'none';

  return `0 0 9px ${solid}66`;
};

// Dashboard clear-distribution groups, ported verbatim from
// docs/design_handoff_night_sky_redesign/iidx-data.js (DIST_GROUPS, ~lines 222-228).
export const DIST_GROUPS = [
  {
    key: 'FC',
    label: 'FC',
    keys: ['FULLCOMBO_CLEAR'],
    fill: 'linear-gradient(90deg,#f871a0,#ffc107 78%)',
    dot: 'linear-gradient(135deg,#f871a0,#ffc107)',
  },
  { key: 'EXH', label: 'EX HARD', keys: ['EX_HARD_CLEAR'], fill: '#ffc107', dot: '#ffc107' },
  { key: 'HARD', label: 'HARD', keys: ['HARD_CLEAR'], fill: '#ffffff', dot: '#ffffff' },
  { key: 'CLEAR', label: 'CLEAR', keys: ['CLEAR'], fill: '#4c9aff', dot: '#4c9aff' },
  {
    key: 'OTHER',
    label: 'OTHER',
    keys: ['EASY_CLEAR', 'ASSIST_CLEAR', 'FAILED', 'NO_PLAY'],
    fill: '#7c8aa5',
    dot: '#7c8aa5',
  },
];

/**
 * Builds one tier row's clear-type stack: counts songs by clear type, keeps
 * CLEAR_ORDER's best-to-worst order, and drops any type with zero songs.
 * Ported from stackFor() in
 * docs/design_handoff_night_sky_redesign/iidx-data.js (lines 238-244).
 *
 * @param {Array<{ clearType?: string }>} songs
 * @returns {Array<{ key: string, count: number, pct: number, label: string, solid: string }>}
 */
export const buildClearStack = (songs) => {
  if (!songs || songs.length === 0) return [];

  const counts = {};
  songs.forEach((song) => {
    const key = normalizeClearType(song.clearType) || 'NO_PLAY';
    counts[key] = (counts[key] || 0) + 1;
  });

  return CLEAR_ORDER.filter((key) => counts[key]).map((key) => ({
    key,
    count: counts[key],
    pct: (counts[key] / songs.length) * 100,
    label: CLEAR_TYPE_LABELS[key],
    solid: CLEAR_PALETTE[key].solid,
  }));
};
