import { create } from 'zustand';

// Cards per page in the client-side pagination (see utils/scoreQuery.js#paginate).
export const PAGE_SIZE = 12;

/**
 * Scores screen filter/sort/pagination state.
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
  page: 0,

  // Merges patch into state and resets to the first page, since any filter
  // change can shrink or reorder the result set.
  setFilter: (patch) => set(() => ({ ...patch, page: 0 })),

  setSort: (sort) => set({ sort, page: 0 }),

  setPage: (page) => set({ page }),

  resetFilters: () =>
    set({ level: null, chart: '', clear: '', q: '', sort: 'ex', page: 0 }),
}));
