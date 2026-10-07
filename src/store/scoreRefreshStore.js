import { create } from 'zustand';

// Score queries are local to hooks; joined tier records are the only shared score cache.
export const useScoreRefreshStore = create((set) => ({
  revision: 0,
  invalidate: () => set((state) => ({ revision: state.revision + 1 })),
}));
