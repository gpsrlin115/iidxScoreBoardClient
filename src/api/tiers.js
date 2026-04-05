import apiClient from './client';

/**
 * API service for fetching Tier Table data from the backend
 */
export const tierApi = {
  /**
   * Fetch tier table data for a specific level and play style
   * @param {number} level - Level to fetch (e.g. 10, 11, 12)
   * @param {string} playStyle - 'SP' or 'DP'
   * @returns {Promise<Object>} Tier grouping (e.g., { "S+": ["Song A", ...], "S": [...] })
   */
  getTierData: async (level, playStyle) => {
    try {
      const response = await apiClient.get(`/tiers/${level}/${playStyle}`);
      // The backend returns a JSON string, which Axios parses automatically if it's valid JSON
      // If it's a raw string in response.data, we might need to parse it if it wasn't auto-parsed
      const data = response.data;
      return typeof data === 'string' ? JSON.parse(data) : data;
    } catch (error) {
      console.error(`Failed to fetch tier data for Lv.${level} ${playStyle}`, error);
      return {};
    }
  },

  /**
   * Save (Update) tier table data (Admin Only)
   * @param {number} level 
   * @param {string} playStyle 
   * @param {Object} newTierData - Updated tier object
   */
  saveTierData: async (level, playStyle, newTierData) => {
    try {
      // Send as JSON string to the backend
      const response = await apiClient.post(`/tiers/${level}/${playStyle}`, newTierData);
      return response.data;
    } catch (error) {
      console.error(`Failed to save tier data for Lv.${level} ${playStyle}`, error);
      throw error;
    }
  },

  /**
   * Fetch all songs for a specific level and style for assigning (Admin Only)
   * @returns {Promise<Array>} Array of song objects [{ title: "..." }]
   */
  getSongsByLevel: async (level, playStyle) => {
    try {
      const response = await apiClient.get(`/tiers/songs/${level}/${playStyle}`);
      // Backend returns List<String>. Map to objects for frontend compatibility.
      const songTitles = response.data || [];
      return songTitles.map(title => ({
        title: typeof title === 'object' ? title.title : title,
        level,
        playStyle
      }));
    } catch (error) {
      console.error(`Failed to fetch songs for Lv.${level} ${playStyle}`, error);
      return [];
    }
  }
};
