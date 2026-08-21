import { create } from 'zustand';
import { tierApi } from '../api/tiers';
import { scoresApi } from '../api/scores';
import { resolveMockChartId } from '../api/songFeedback';
import toast from 'react-hot-toast';
import { normalizeClearType } from '../utils/clearTypes';
import { toAppError } from '../utils/httpError';

let latestTierRequestId = 0;

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

const useTierStore = create((set, get) => ({
  selectedLevel: 12,
  selectedPlayStyle: 'SP',
  tierData: null,          // Raw JSON tier data
  userScores: [],          // Raw scores from backend
  enrichedTierData: [],    // Combined data array: [{ tier: 'S+', songs: [{ title, clearType }] }]
  expandedTiers: new Set(), // Set of tier strings currently expanded
  viewMode: 'grid',        // 'list' or 'grid'
  isLoading: false,
  error: null,

  // Actions
  setViewMode: (mode) => set({ viewMode: mode }),
  setLevel: (level) => {
    latestTierRequestId += 1;
    set({ selectedLevel: level });
  },
  setPlayStyle: (playStyle) => {
    latestTierRequestId += 1;
    set({ selectedPlayStyle: playStyle });
  },

  toggleTier: (tier) => {
    const { expandedTiers } = get();
    const newExpanded = new Set(expandedTiers);
    if (newExpanded.has(tier)) {
      newExpanded.delete(tier);
    } else {
      newExpanded.add(tier);
    }
    set({ expandedTiers: newExpanded });
  },

  expandAllTiers: () => {
    const { enrichedTierData } = get();
    const allTiers = enrichedTierData.map(t => t.tier);
    set({ expandedTiers: new Set(allTiers) });
  },

  collapseAllTiers: () => set({ expandedTiers: new Set() }),

  fetchTierData: async () => {
    const { selectedLevel, selectedPlayStyle } = get();
    const requestId = ++latestTierRequestId;
    const isCurrentRequest = () => (
      requestId === latestTierRequestId
      && get().selectedLevel === selectedLevel
      && get().selectedPlayStyle === selectedPlayStyle
    );
    set({ isLoading: true, error: null });

    try {
      // 1. Fetch static tier data for the current level/style
      const rawTierData = await tierApi.getTierData(selectedLevel, selectedPlayStyle);
      if (!isCurrentRequest()) return;

      if (!rawTierData || Object.keys(rawTierData).length === 0) {
        set({
          tierData: null,
          enrichedTierData: [],
          expandedTiers: new Set(),
          isLoading: false
        });
        return;
      }

      // 2. Fetch user's actual scores from backend for this level/style to overlay clear lamps
      const response = await scoresApi.getScores({
        level: selectedLevel,
        playStyle: selectedPlayStyle,
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
            level: selectedLevel,
            playStyle: selectedPlayStyle,
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

      // Initially expand all tiers when successfully loaded
      const allTiers = enriched.map(t => t.tier);

      set({
        tierData: rawTierData,
        userScores,
        enrichedTierData: enriched,
        expandedTiers: new Set(allTiers),
        isLoading: false
      });

    } catch (error) {
      if (!isCurrentRequest()) return;
      // tierApi가 더 이상 실패를 []로 삼키지 않으므로 403/500이 여기까지 올라옵니다.
      // 화면은 이 status를 보고 "데이터 없음"이 아닌 실제 오류를 표시합니다.
      console.error('Failed to fetch tier data:', error);
      const appError = toAppError(error, { fallback: '서열표 데이터를 불러오는데 실패했습니다.' });
      set({ error: appError, isLoading: false });
      toast.error(appError.message);
    }
  }
}));

export default useTierStore;
