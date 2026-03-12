import { create } from 'zustand';
import { tierApi } from '../api/tiers';
import { scoresApi } from '../api/scores';
import toast from 'react-hot-toast';

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
  setLevel: (level) => set({ selectedLevel: level }),
  setPlayStyle: (playStyle) => set({ selectedPlayStyle: playStyle }),

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
    set({ isLoading: true, error: null });

    try {
      // 1. Fetch static tier data for the current level/style
      const rawTierData = await tierApi.getTierData(selectedLevel, selectedPlayStyle);

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

      const userScores = response.content || [];

      // 3. Enrich the raw tier data with user scores
      // Convert { "S+": ["Verflucht"] } into [{ tier: "S+", songs: [{ title: "Verflucht", clearType: "FULL_COMBO", ... }] }]
      const enriched = Object.entries(rawTierData).map(([tier, songs]) => ({
        tier,
        songs: songs.map(songTitle => {
          // Find matching score. Based strictly on exact title match for this static implementation.
          const score = userScores.find(s => s.song && s.song.title === songTitle);
          return {
            title: songTitle,
            clearType: score ? score.bestClearType : 'FAILED',
            score: score ? score.bestScore : 0,
            djLevel: score ? score.bestDjLevel : '-',
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
      console.error('Failed to fetch tier data:', error);
      const message = error.response?.data?.message || '서열표 데이터를 불러오는데 실패했습니다.';
      set({ error: message, isLoading: false });
      toast.error(message);
    }
  }
}));

export default useTierStore;
