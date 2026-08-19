import { create } from 'zustand';

// Single source of truth for the global scope (level + play style) that
// drives tier tables, dashboards, and score filters across the app.
// Phase 3a replaces tierStore's selectedLevel/selectedPlayStyle with this
// store so every screen reads scope from one place.
export const useScopeStore = create((set) => ({
  level: 12,
  playStyle: 'SP',

  setLevel: (level) => set({ level }),
  setPlayStyle: (playStyle) => set({ playStyle }),
}));
