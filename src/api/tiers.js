import tierTableData from '../data/tierTable.json';

// Simulated API service for fetching static Tier Table JSON data
export const tierApi = {
  /**
   * Fetch tier table data for a specific level and play style
   * @param {number} level - Level to fetch (e.g. 10, 11, 12)
   * @param {string} playStyle - 'SP' or 'DP'
   * @returns {Promise<Object>} Tier grouping (e.g., { "S+": ["Song A", ...], "S": [...] })
   */
  getTierData: async (level, playStyle) => {
    // Simulate slight network delay to mock real API behavior
    await new Promise(resolve => setTimeout(resolve, 300));

    // 1. Check if we have modified data in localStorage
    const storageKey = `tierData_${level}_${playStyle}`;
    const storedData = localStorage.getItem(storageKey);
    if (storedData) {
      try {
        return JSON.parse(storedData);
      } catch (e) {
        console.error('Failed to parse tier data from localStorage', e);
      }
    }

    // 2. Fall back to static JSON
    const levelData = tierTableData[String(level)];
    if (!levelData) {
      return null;
    }

    return levelData[playStyle] || null;
  },

  /**
   * Save (Update) tier table data (Admin Only)
   * Simulated API for now.
   * @param {number} level 
   * @param {string} playStyle 
   * @param {Object} newTierData - Updated tier object
   */
  saveTierData: async (level, playStyle, newTierData) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // In a real app, this would POST/PUT to backend.
    console.log(`[MOCK API] Saving Tier Data for Lv.${level} ${playStyle}:`, newTierData);
    
    // Save to localStorage so changes persist across page reloads in the browser
    const storageKey = `tierData_${level}_${playStyle}`;
    localStorage.setItem(storageKey, JSON.stringify(newTierData));
    
    return { success: true };
  },

  /**
   * Fetch all songs for a specific level and style to find "Unassigned" songs (Admin Only)
   * This would typically come from a /api/songs endpoint
   */
  getSongsByLevel: async (level, playStyle) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Mocking some songs that aren't in the tier list yet for Lv 12
    if (level === 12 && playStyle === 'SP') {
      return [
        { title: 'New Song A', level: 12, playStyle: 'SP' },
        { title: 'Another Boss', level: 12, playStyle: 'SP' },
        { title: 'Unknown Track', level: 12, playStyle: 'SP' }
      ];
    }
    return [];
  }
};
