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
   * Fetch tier table draft (Admin Only)
   */
  getAdminTierDraft: async (level, playStyle) => {
    try {
      const response = await apiClient.get('/admin/tier-table/draft', {
        params: { level, playStyle }
      });
      const data = response.data;
      return typeof data === 'string' ? JSON.parse(data) : data;
    } catch (error) {
      console.error(`Failed to fetch draft for Lv.${level} ${playStyle}`, error);
      return null;
    }
  },

  /**
   * Save (Update) tier table draft (Admin Only)
   */
  saveAdminTierDraft: async (level, playStyle, tierData) => {
    try {
      const payload = {
        level,
        playStyle,
        tierDataJson: JSON.stringify(tierData)
      };
      const response = await apiClient.post('/admin/tier-table/draft', payload);
      return response.data;
    } catch (error) {
      console.error(`Failed to save draft for Lv.${level} ${playStyle}`, error);
      throw error;
    }
  },

  /**
   * Publish a draft to live (Admin Only)
   */
  publishTierTable: async (level, playStyle, tierData) => {
    try {
      const payload = {
        level,
        playStyle,
        tierDataJson: JSON.stringify(tierData)
      };
      const response = await apiClient.post('/admin/tier-table/publish', payload);
      return response.data;
    } catch (error) {
      console.error(`Failed to publish tier table for Lv.${level} ${playStyle}`, error);
      throw error;
    }
  },

  /**
   * Fetch all songs for assigning (Admin Only)
   */
  getAdminSongs: async (level, playStyle) => {
    try {
      const response = await apiClient.get('/admin/songs', {
        params: { level, playStyle }
      });
      const songTitles = response.data || [];
      return songTitles.map(title => ({
        title: typeof title === 'object' ? title.title : title,
        level,
        playStyle
      }));
    } catch (error) {
      console.error(`Failed to fetch admin songs for Lv.${level} ${playStyle}`, error);
      return [];
    }
  },

  /**
   * Fetch history of edits (Admin Only)
   */
  getAdminTierHistory: async (level, playStyle) => {
    try {
      const response = await apiClient.get('/admin/tier-table/history', {
        params: { level, playStyle }
      });
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch history for Lv.${level} ${playStyle}`, error);
      return [];
    }
  }
};
