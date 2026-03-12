import { create } from 'zustand';
import { tierApi } from '../api/tiers';
import toast from 'react-hot-toast';

/**
 * Store specifically for the Admin Tier Table Editor
 * Manages draft state, unassigned songs, and save operations.
 */
const useAdminTierStore = create((set, get) => ({
  selectedLevel: 12,
  selectedPlayStyle: 'SP',
  draftTierData: {},       // e.g., { "S+": ["Song A", "Song B"], "S": ["Song C"] }
  unassignedSongs: [],     // Array of strings (song titles)
  hasChanges: false,
  isLoading: false,
  isSaving: false,
  error: null,

  setLevel: (level) => set({ selectedLevel: level, hasChanges: false }),
  setPlayStyle: (style) => set({ selectedPlayStyle: style, hasChanges: false }),

  // Load initial data for editing
  fetchDataForEdit: async () => {
    const { selectedLevel, selectedPlayStyle } = get();
    set({ isLoading: true, error: null, hasChanges: false });

    try {
      // 1. Fetch current active tier data
      const currentTiers = await tierApi.getTierData(selectedLevel, selectedPlayStyle);
      const safeTiers = currentTiers || {};

      // 2. Fetch all songs for this level to determine which are unassigned
      const allSongs = await tierApi.getSongsByLevel(selectedLevel, selectedPlayStyle);
      
      // Calculate unassigned: All songs minus songs already in the tiers
      const assignedSongSet = new Set();
      Object.values(safeTiers).forEach(songArray => {
        songArray.forEach(song => assignedSongSet.add(song));
      });

      const unassigned = allSongs
        .map(s => s.title)
        .filter(title => !assignedSongSet.has(title));

      set({
        draftTierData: safeTiers,
        unassignedSongs: unassigned,
        isLoading: false
      });
    } catch {
      set({ error: 'Failed to load data for editor', isLoading: false });
      toast.error('Failed to load data for editor');
    }
  },

  // Update the entire draft state (e.g., after a drag and drop operation)
  updateDraftState: (newTiers, newUnassigned) => {
    set({
      draftTierData: newTiers,
      unassignedSongs: newUnassigned,
      hasChanges: true
    });
  },

  // Save the draft state
  saveChanges: async () => {
    const { selectedLevel, selectedPlayStyle, draftTierData, hasChanges } = get();
    
    if (!hasChanges) {
      toast('No changes to save', { icon: 'ℹ️' });
      return;
    }

    set({ isSaving: true });
    try {
      await tierApi.saveTierData(selectedLevel, selectedPlayStyle, draftTierData);
      toast.success('Tier table saved successfully!');
      set({ isSaving: false, hasChanges: false });
      
      // Note: In a real app, you might also want to trigger a re-fetch in the normal tierStore
      // so the public view reflects the new changes immediately.
    } catch {
      set({ isSaving: false });
      toast.error('Failed to save tier table changes');
    }
  }
}));

export default useAdminTierStore;
