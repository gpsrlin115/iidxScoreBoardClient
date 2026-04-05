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
      // 1. Fetch current draft tier data (or fallbacks to live if no draft)
      const draftTiers = await tierApi.getAdminTierDraft(selectedLevel, selectedPlayStyle);
      const safeTiers = draftTiers || {};

      // 2. Fetch all songs for this level from admin endpoint
      const allSongs = await tierApi.getAdminSongs(selectedLevel, selectedPlayStyle);
      
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

  // Save the draft state (임시저장)
  saveChanges: async () => {
    const { selectedLevel, selectedPlayStyle, draftTierData, hasChanges } = get();
    
    if (!hasChanges) {
      toast('No changes to save', { icon: 'ℹ️' });
      return;
    }

    set({ isSaving: true });
    try {
      await tierApi.saveAdminTierDraft(selectedLevel, selectedPlayStyle, draftTierData);
      toast.success('Draft saved successfully!');
      set({ isSaving: false, hasChanges: false });
    } catch {
      set({ isSaving: false });
      toast.error('Failed to save draft');
    }
  },

  // Publish the draft to live (게시)
  publishChanges: async () => {
    const { selectedLevel, selectedPlayStyle, draftTierData } = get();

    set({ isSaving: true });
    try {
      await tierApi.publishTierTable(selectedLevel, selectedPlayStyle, draftTierData);
      toast.success('Tier table published successfully! It is now live.');
      set({ isSaving: false, hasChanges: false });
    } catch {
      set({ isSaving: false });
      toast.error('Failed to publish tier table');
    }
  }
}));

export default useAdminTierStore;
