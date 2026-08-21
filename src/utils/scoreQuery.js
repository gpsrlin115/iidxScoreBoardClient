import { normalizeClearType, CLEAR_RANK } from './clearTypes';

/**
 * Pure client-side query pipeline for the /scores screen: filter -> sort ->
 * paginate. useScores.js fetches one size:1000 page per scope and runs these
 * over it in memory (see scoresStore.js decision notes for why).
 *
 * Server-side migration map, if these ever move back to real API params:
 *   - filterScores({ chart, clear, q }) -> chartType, clearType, q params.
 *     Wire asymmetry to preserve: the UI/display clear-type key is
 *     'FULLCOMBO_CLEAR' (see clearTypes.js), but the backend's clearType
 *     query param for it is 'FULL_COMBO' (see useDashboard.js's existing
 *     comment on this same asymmetry). Every other CLEAR_ORDER key matches
 *     the wire value as-is.
 *   - sortScores(scores, sort) -> a `sort=ex|clear|date` param, paired with
 *     a matching server-side order-by.
 *   - paginate(scores, page, size) -> the existing page/size params, just
 *     applied against the full scope instead of a pre-sliced page.
 */

// clear/chart: '' means "no filter". q: case-insensitive substring match on
// title or artist; whitespace-only q is treated as no filter.
export const filterScores = (scores, { chart = '', clear = '', q = '' } = {}) => {
  const needle = q.trim().toLowerCase();

  return scores.filter((score) => {
    if (chart && score.chart?.chartType !== chart) return false;

    if (clear) {
      const clearType = normalizeClearType(score.bestClearType) ?? 'NO_PLAY';
      if (clearType !== clear) return false;
    }

    if (needle) {
      const title = score.song?.title?.toLowerCase() ?? '';
      const artist = score.song?.artist?.toLowerCase() ?? '';
      if (!title.includes(needle) && !artist.includes(needle)) return false;
    }

    return true;
  });
};

// Sorts a shallow copy — never mutates the array passed in, since it's the
// same array reference useScores.js reuses across filter/sort calls.
export const sortScores = (scores, sort) => {
  const sorted = [...scores];

  if (sort === 'clear') {
    sorted.sort((a, b) => {
      const rankA = CLEAR_RANK[normalizeClearType(a.bestClearType) ?? 'NO_PLAY'] ?? 0;
      const rankB = CLEAR_RANK[normalizeClearType(b.bestClearType) ?? 'NO_PLAY'] ?? 0;
      return rankB - rankA;
    });
  } else if (sort === 'date') {
    sorted.sort((a, b) => {
      const dateA = a.lastPlayedAt ?? a.bestPlayedAt;
      const dateB = b.lastPlayedAt ?? b.bestPlayedAt;
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1; // missing dates always sort last
      if (!dateB) return -1;
      return new Date(dateB) - new Date(dateA);
    });
  } else {
    // 'ex' (default)
    sorted.sort((a, b) => (b.bestScore ?? 0) - (a.bestScore ?? 0));
  }

  return sorted;
};

// Clamps out-of-range pages to the last valid page instead of returning an
// empty slice, so e.g. narrowing a filter while on page 5 doesn't strand the
// user on a blank page.
export const paginate = (scores, page, size) => {
  const totalElements = scores.length;
  const totalPages = Math.max(1, Math.ceil(totalElements / size));
  const currentPage = Math.min(Math.max(0, page), totalPages - 1);
  const start = currentPage * size;

  return {
    items: scores.slice(start, start + size),
    totalElements,
    totalPages,
    currentPage,
  };
};
