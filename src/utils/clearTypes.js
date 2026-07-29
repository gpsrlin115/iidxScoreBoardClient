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

export const CLEAR_TYPE_STYLES = {
  FULLCOMBO_CLEAR: 'bg-yellow-400 text-gray-900',
  EX_HARD_CLEAR: 'bg-yellow-600 text-white',
  HARD_CLEAR: 'bg-slate-100 text-gray-900',
  CLEAR: 'bg-blue-500 text-white',
  EASY_CLEAR: 'bg-green-500 text-white',
  ASSIST_CLEAR: 'bg-purple-500 text-white',
  FAILED: 'bg-slate-600 text-slate-300',
  NO_PLAY: 'bg-slate-700 text-slate-400',
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
