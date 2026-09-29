import { create } from 'zustand';

// Cards revealed per infinite-scroll step (see utils/scoreQuery.js#takeVisible).
// 24 rather than the old 12-card page: the grid is up to four columns wide on
// desktop, so 12 cards barely filled one screen and every scroll hit the
// sentinel again.
export const BATCH_SIZE = 24;

/**
 * Scores screen filter/sort/infinite-scroll state.
 *
 * `level` has three states, all distinct from each other:
 * - null: no local override — follow the global scope's level (useScopeStore).
 * - '' (empty string): "all levels", a score-screen-only option. The global
 *   scope itself only ever holds 10/11/12, but this screen has always
 *   supported the full 1-12 range plus "all" and that must not regress.
 * - 1..12 (number): an explicit per-screen override, independent of scope.
 *
 * playStyle is intentionally NOT duplicated here — useScopeStore is its
 * single source of truth, and this store only ever reads it.
 */
export const useScoresStore = create((set) => ({
  level: null,
  chart: '',
  clear: '',
  q: '',
  sort: 'ex', // 'ex' | 'clear' | 'date' — see docs decision: no achievement-rate sort.
  // How many cards of the sorted result are on screen. Grows by BATCH_SIZE as
  // the user scrolls to the bottom of the grid.
  visibleCount: BATCH_SIZE,

  // Merges patch into state and collapses back to the first batch, since any
  // filter change can shrink or reorder the result set.
  setFilter: (patch) => set(() => ({ ...patch, visibleCount: BATCH_SIZE })),

  setSort: (sort) => set({ sort, visibleCount: BATCH_SIZE }),

  showMore: () => set((state) => ({ visibleCount: state.visibleCount + BATCH_SIZE })),

  resetFilters: () =>
    set({ level: null, chart: '', clear: '', q: '', sort: 'ex', visibleCount: BATCH_SIZE }),
}));
