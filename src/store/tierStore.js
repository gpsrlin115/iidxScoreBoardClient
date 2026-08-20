import { create } from 'zustand';
import { tierApi } from '../api/tiers';
import { scoresApi } from '../api/scores';
import { resolveMockChartId } from '../api/songFeedback';
import toast from 'react-hot-toast';
import { normalizeClearType } from '../utils/clearTypes';
import { toAppError } from '../utils/httpError';
import { useAuthStore } from './authStore';
import { decideTierFetch } from '../utils/tierFetchGate';

// Monotonic id shared by every fetchTierData call. Only the newest request may
// write into the store. See the INVARIANT note inside fetchTierData.
let latestTierRequestId = 0;

// Scope key of the request currently on the wire, or null. Lets an identical
// non-forced entry ride along instead of cancelling it — see tierFetchGate.
let inFlightKey = null;

// The cache key names the USER as well as the scope. enrichedTierData carries
// that user's clear lamps and best scores, so a key of scope alone let a
// logout -> different login serve the previous user's records. store/
// sessionReset.js also clears this store on identity change; both layers are
// deliberate, since a leak here is a privacy failure, not a stale render.
const buildFetchedKey = (level, playStyle) => {
  const userId = useAuthStore.getState().user?.id ?? 'anon';
  return `${userId}:${level}:${playStyle}`;
};

const EMPTY_TIER_STATE = {
  tierData: null,
  userScores: [],
  enrichedTierData: [],
  fetchedKey: null,
  isLoading: false,
  error: null,
};

const normalizeTierSong = (song) => {
  if (typeof song === 'string') {
    return { title: song, difficulty: null, chartId: null };
  }

  return {
    title: song.title,
    difficulty: song.difficulty ?? song.chartType ?? null,
    category: song.category ?? null,
    tier: song.tier ?? null,
    sortOrder: song.sortOrder ?? null,
    chartId: song.chartId ?? null,
  };
};

const buildScoreKey = (title, difficulty) => (
  JSON.stringify([title ?? null, difficulty ?? null])
);

const buildScoreMap = (scores) => {
  const scoreMap = new Map();

  scores.forEach((score) => {
    const title = score.song?.title;
    const difficulty = score.chart?.chartType;
    if (!title || !difficulty) return;

    scoreMap.set(buildScoreKey(title, difficulty), score);
  });

  return scoreMap;
};

// Scope (level / playStyle) is NOT owned here. useScopeStore is the single
// source of truth; callers read it and pass the scope into fetchTierData.
const useTierStore = create((set, get) => ({
  tierData: null,          // Raw JSON tier data
  userScores: [],          // Raw scores from backend
  enrichedTierData: [],    // Combined data array: [{ tier: 'S+', songs: [{ title, clearType }] }]
  fetchedKey: null,        // `${level}:${playStyle}` of the last successfully settled fetch
  viewMode: 'chips',       // 'chips' | 'dense'
  isLoading: false,
  error: null,

  // Actions
  setViewMode: (mode) => set({ viewMode: mode }),

  /**
   * Drop every cached per-user row. Called by store/sessionReset.js whenever
   * the signed-in identity changes; `viewMode` survives because it is a UI
   * preference, not user data.
   *
   * Bumping the request id is the important half: a fetch started by the
   * previous user may still be on the wire, and without invalidating it here
   * its response would land in the freshly cleared store.
   */
  reset: () => {
    latestTierRequestId += 1;
    inFlightKey = null;
    set({ ...EMPTY_TIER_STATE });
  },

  /**
   * Fetch tier data + user scores for one scope and join them into
   * enrichedTierData.
   *
   * @param {number} level
   * @param {'SP'|'DP'} playStyle
   * @param {{ force?: boolean }} [options] `force: true` bypasses the
   *   fetchedKey memo and always hits the network. It is the only public way
   *   to break the cache. Two call sites use it: the CSV upload success
   *   handler (newly imported scores invalidate the joined clear lamps for
   *   the current scope) and the tier table's error retry (redundant, since
   *   a stored error already bypasses the memo, but it states the intent).
   */
  fetchTierData: async (level, playStyle, options = {}) => {
    const { force = false } = options;
    const nextFetchedKey = buildFetchedKey(level, playStyle);
    const previous = get();
    const decision = decideTierFetch({
      force,
      requestedKey: nextFetchedKey,
      fetchedKey: previous.fetchedKey,
      inFlightKey,
      hasError: Boolean(previous.error),
    });

    // INVARIANT: latestTierRequestId is incremented on every entry that could
    // change what the screen should show — which is every entry EXCEPT
    // 'join-inflight'.
    //
    // Response-race protection used to live in setLevel/setPlayStyle (commit
    // 1d9749d), which bumped the id whenever the scope changed. Those actions
    // are gone, so the bump had to move to the only remaining entry point.
    //
    // Skipping the bump on the cache-hit path would reopen the race:
    //   1. lv12 is already cached.
    //   2. fetchTierData(11, 'SP') starts and is slow.
    //   3. The user switches back to lv12 -> cache hit -> early return.
    //   4. The lv11 response finally lands, still holding the newest id, so it
    //      passes isCurrentRequest() and overwrites the lv12 screen.
    // Bumping on 'serve-cache' invalidates the in-flight lv11 request at step 3.
    //
    // 'join-inflight' is the one safe exception: the request already on the
    // wire is for the SAME key, so its response is exactly what this caller
    // wanted. Bumping there would cancel it for no gain — and when that
    // request is a CSV import's `force` refresh, cancelling it silently threw
    // away the newly imported clear lamps.
    if (decision === 'join-inflight') return;

    const requestId = ++latestTierRequestId;

    if (decision === 'serve-cache') {
      // The bump above just orphaned whatever was in flight for another
      // scope. That request returns early at its own isCurrentRequest()
      // check, i.e. BEFORE its `isLoading: false`, so nothing else will ever
      // turn the spinner off. The data this cache hit serves is complete, so
      // clear it here.
      if (previous.isLoading) set({ isLoading: false });
      return;
    }

    // requestId equality is now the entire staleness test. Comparing
    // get().selectedLevel is no longer possible (the field is gone), but the
    // invariant above makes the id alone sufficient: any newer entry into this
    // action — fetch or cache hit — has already invalidated this requestId.
    const isCurrentRequest = () => requestId === latestTierRequestId;
    inFlightKey = nextFetchedKey;
    // Releases the ride-along slot, but only if this request still owns it —
    // a newer entry may have claimed it in the meantime.
    const releaseInFlight = () => {
      if (isCurrentRequest()) inFlightKey = null;
    };
    set({ isLoading: true, error: null });

    try {
      // 1. Fetch static tier data for the requested level/style
      const rawTierData = await tierApi.getTierData(level, playStyle);
      if (!isCurrentRequest()) return;

      if (!rawTierData || Object.keys(rawTierData).length === 0) {
        set({
          tierData: null,
          enrichedTierData: [],
          fetchedKey: nextFetchedKey,
          isLoading: false
        });
        return;
      }

      // 2. Fetch user's actual scores from backend for this level/style to overlay clear lamps
      const response = await scoresApi.getScores({
        level,
        playStyle,
        size: 1000 // A large enough number to get all scores for mapping
      });
      if (!isCurrentRequest()) return;

      const userScores = response.content || [];

      const scoreMap = buildScoreMap(userScores);

      // 3. Enrich the raw tier data with user scores
      // Convert grouped tier data into clear-lamp-aware song rows.
      const enriched = Object.entries(rawTierData).map(([tier, songs]) => ({
        tier,
        songs: songs.map(song => {
          const tierSong = normalizeTierSong(song);
          const exactScore = tierSong.difficulty
            ? scoreMap.get(buildScoreKey(tierSong.title, tierSong.difficulty))
            : null;
          const fallbackScore = tierSong.difficulty
            ? null
            : userScores.find(s => s.song?.title === tierSong.title);
          const score = exactScore ?? fallbackScore;
          const clearType = normalizeClearType(score?.bestClearType) ?? 'NO_PLAY';

          return {
            ...tierSong,
            level,
            playStyle,
            clearType,
            score: score ? score.bestScore : 0,
            djLevel: score ? score.bestDjLevel : '-',
            // Carry whichever score drove the lamp above. Using exactScore only
            // made the tile light up while the dialog claimed "no play record",
            // because a tier item without a difficulty falls back to a
            // title-only match. `isFallbackScore` lets the dialog say the
            // record belongs to another chart of the same song.
            scoreDetails: score ?? null,
            isFallbackScore: Boolean(!exactScore && fallbackScore),
            // Backfill from exactScore only. A fallback match is a *different*
            // chart of the same song, so its id would attach per-chart
            // feedback to the wrong chart. Null here disables that feature
            // rather than pointing it somewhere plausible but wrong.
            chartId: tierSong.chartId
              ?? exactScore?.chart?.id
              ?? resolveMockChartId(tierSong.title, tierSong.difficulty),
          };
        })
      }));

      set({
        tierData: rawTierData,
        userScores,
        enrichedTierData: enriched,
        fetchedKey: nextFetchedKey,
        isLoading: false
      });

    } catch (error) {
      if (!isCurrentRequest()) return;
      // tierApi가 더 이상 실패를 []로 삼키지 않으므로 403/500이 여기까지 올라옵니다.
      // 화면은 이 status를 보고 "데이터 없음"이 아닌 실제 오류를 표시합니다.
      // fetchedKey is intentionally left untouched here so a failed scope is
      // not memoized as fetched and the next attempt retries the network.
      console.error('Failed to fetch tier data:', error);
      const appError = toAppError(error, { fallback: '서열표 데이터를 불러오는데 실패했습니다.' });
      set({ error: appError, isLoading: false });
      toast.error(appError.message);
    } finally {
      // In `finally` so that every exit — success, error, and the two stale
      // `return`s inside the try — frees the slot. A leaked inFlightKey would
      // make later callers ride along with a request that already finished
      // and then never see any data at all.
      releaseInFlight();
    }
  }
}));

export default useTierStore;
