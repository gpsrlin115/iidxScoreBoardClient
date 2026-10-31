import { create } from 'zustand';
import { useAuthStore } from './authStore';
import { SCORE_BROWSER_V2_ENABLED } from '../constants/scoreBrowser';

export const BATCH_SIZE = 24;

const initialFilters = () => ({
  level: SCORE_BROWSER_V2_ENABLED ? '' : null,
  series: '',
  chart: '',
  clear: '',
  q: '',
  sort: 'ex',
  visibleCount: BATCH_SIZE,
});

// visibleCount/showMore remain for the release-gated legacy screen only.
export const useScoresStore = create((set) => ({
  ...initialFilters(),
  setFilter: (patch) => set({ ...patch, visibleCount: BATCH_SIZE }),
  setSort: (sort) => set({ sort, visibleCount: BATCH_SIZE }),
  showMore: () => set((state) => ({ visibleCount: state.visibleCount + BATCH_SIZE })),
  resetFilters: () => set(initialFilters()),
}));

// Reset even when the scores page is unmounted between account sessions.
useAuthStore.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id) useScoresStore.getState().resetFilters();
});
