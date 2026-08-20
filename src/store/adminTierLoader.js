import { tierApi } from '../api/tiers';
import defaultTierTable from '../data/tierTable.json';
import { toAppError } from '../utils/httpError';
import { normalizeTierCategory } from '../utils/tierData';

/**
 * Data acquisition for the admin tier editor, kept separate from the store so
 * the fallback policy is readable on its own.
 */

export const DEFAULT_CATEGORY = '地力';
export const DEFAULT_DIFFICULTY = 'ANOTHER';

export const normalizeDraftEntries = (data) => {
  if (Array.isArray(data)) return data;

  if (!data || typeof data !== 'object') return [];

  return Object.entries(data).flatMap(([tier, songs]) => {
    if (!Array.isArray(songs)) return [];

    return songs.map((song, index) => {
      if (song && typeof song === 'object') {
        return {
          ...song,
          tier: song.tier ?? tier,
          category: normalizeTierCategory(song.category) ?? DEFAULT_CATEGORY,
          sortOrder: song.sortOrder ?? index + 1
        };
      }

      return {
        title: song,
        difficulty: DEFAULT_DIFFICULTY,
        category: DEFAULT_CATEGORY,
        tier,
        sortOrder: index + 1
      };
    });
  });
};

const getDefaultTierEntries = (level, playStyle) => {
  const grouped = defaultTierTable[String(level)]?.[playStyle];
  return normalizeDraftEntries(grouped);
};

// A 401/403 means the editor is not allowed to see the real data. It must
// never be replaced with public or bundled default data: doing so shows
// plausible-looking content that the admin could then save over the live
// table.
const isAuthFailure = (error) => {
  const { status } = toAppError(error);
  return status === 401 || status === 403;
};

const findAuthFailure = (results) => (
  results.find((result) => result.status === 'rejected' && isAuthFailure(result.reason))?.reason ?? null
);

const settledValue = (result, emptyValue) => (
  result.status === 'fulfilled' ? result.value : emptyValue
);

/**
 * Fetch every source the editor needs, applying fallbacks only when the admin
 * endpoints genuinely returned nothing — never to paper over a failed request.
 *
 * @param {number} level
 * @param {'SP' | 'DP'} playStyle
 * @returns {Promise<
 *   { authFailure: unknown, context: string } |
 *   { rawEntries: Array, masterSongs: Array, usedFallbackData: boolean }
 * >} `authFailure` is returned rather than thrown so the caller can decide how
 *    to surface it without unwinding through a generic catch.
 */
export async function loadAdminTierSources(level, playStyle) {
  // allSettled, not all: one endpoint failing should not discard the other's
  // data, and the rejection reasons drive the fallback policy below.
  const [draftResult, songsResult] = await Promise.allSettled([
    tierApi.getAdminTierDraft(level, playStyle),
    tierApi.getAdminSongs(level, playStyle)
  ]);

  const authFailure = findAuthFailure([draftResult, songsResult]);
  if (authFailure) {
    return { authFailure, context: 'Admin tier editor access denied:' };
  }

  const allSongs = settledValue(songsResult, []);
  let rawEntries = normalizeDraftEntries(settledValue(draftResult, []));
  let masterSongs = Array.isArray(allSongs) ? allSongs : [];
  let usedFallbackData = false;

  if (rawEntries.length === 0 && masterSongs.length === 0) {
    try {
      rawEntries = normalizeDraftEntries(await tierApi.getTierData(level, playStyle));
      usedFallbackData = rawEntries.length > 0;
    } catch (fallbackError) {
      if (isAuthFailure(fallbackError)) {
        return { authFailure: fallbackError, context: 'Public tier fallback denied:' };
      }
      console.error('Public tier fallback failed:', fallbackError);
    }
  }

  if (rawEntries.length === 0 && masterSongs.length === 0) {
    rawEntries = getDefaultTierEntries(level, playStyle);
    usedFallbackData = rawEntries.length > 0;
  }

  if (masterSongs.length === 0 && rawEntries.length > 0) {
    masterSongs = rawEntries.map((item) => ({
      title: item.title,
      difficulty: item.difficulty ?? DEFAULT_DIFFICULTY
    }));
  }

  return { rawEntries, masterSongs, usedFallbackData };
}
