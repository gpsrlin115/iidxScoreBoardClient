const DIFFICULTY_DISPLAYS = Object.freeze({
  BEGINNER: Object.freeze({ key: 'BEGINNER', label: 'B', fullLabel: 'BEGINNER', isMissing: false }),
  NORMAL: Object.freeze({ key: 'NORMAL', label: 'N', fullLabel: 'NORMAL', isMissing: false }),
  HYPER: Object.freeze({ key: 'HYPER', label: 'H', fullLabel: 'HYPER', isMissing: false }),
  ANOTHER: Object.freeze({ key: 'ANOTHER', label: 'A', fullLabel: 'ANOTHER', isMissing: false }),
  LEGGENDARIA: Object.freeze({ key: 'LEGGENDARIA', label: 'L', fullLabel: 'LEGGENDARIA', isMissing: false }),
});

const MISSING_DIFFICULTY_DISPLAY = Object.freeze({
  key: null,
  label: '?',
  fullLabel: '난이도 정보 없음',
  isMissing: true,
});

/**
 * Convert an API difficulty value into text suitable for compact badges and
 * their tooltip/accessibility labels.
 *
 * Unknown non-empty values intentionally remain unchanged. This keeps new or
 * malformed values visible without incorrectly presenting them as a known
 * IIDX difficulty.
 */
export const getDifficultyDisplay = (difficulty) => {
  if (difficulty == null) return MISSING_DIFFICULTY_DISPLAY;

  const value = String(difficulty).trim();
  if (!value) return MISSING_DIFFICULTY_DISPLAY;

  const knownDisplay = DIFFICULTY_DISPLAYS[value.toUpperCase()];
  if (knownDisplay) return knownDisplay;

  return { key: null, label: value, fullLabel: value, isMissing: false };
};
