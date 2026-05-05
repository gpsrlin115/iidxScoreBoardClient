import apiClient from './client';

/**
 * API service for fetching Tier Table data from the backend.
 *
 * Tier endpoints now return normalized array items like:
 * [{ title, difficulty, category, tier, sortOrder }]
 */
export const tierApi = {
  /**
   * Fetch tier table data for a specific level and play style
   * @param {number} level - Level to fetch (e.g. 10, 11, 12)
   * @param {string} playStyle - 'SP' or 'DP'
   * @returns {Promise<Array|Object>} Normalized tier array (preferred) or legacy tier grouping object
   */
  getTierData: async (level, playStyle) => {
    try {
      const response = await apiClient.get(`/tiers/${level}/${playStyle}`);
      const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;

      // 백엔드 새 형식: [{title, tier, difficulty, sortOrder, ...}]
      // tierStore가 기대하는 구 형식: {"S+": ["곡1", "곡2"], ...} 으로 변환
      if (Array.isArray(data)) {
        const grouped = {};
        const unranked = [];
        data.forEach(item => {
          if (item.tier != null) {
            if (!grouped[item.tier]) grouped[item.tier] = [];
            grouped[item.tier].push(item.title);
          } else {
            unranked.push(item.title);
          }
        });
        if (unranked.length > 0) grouped['Unranked'] = unranked;
        return grouped;
      }

      return data; // 이미 구 형식인 경우 그대로 반환
    } catch (error) {
      console.error(`Failed to fetch tier data for Lv.${level} ${playStyle}`, error);
      return [];
    }
  },

  /**
   * Fetch the current live tier table for admin editing (Admin Only).
   * Despite the "draft" naming, the backend now always returns the live tier table.
   * The endpoint name is kept for backward compatibility.
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
      return [];
    }
  },

  /**
   * Save the tier table (Admin Only).
   * Changes are applied to the live tier table immediately upon saving.
   * The "draft" name is kept for backward compatibility.
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
   * Backward-compatible alias for saving tier table (Admin Only).
   * Since the backend now uses a single live source, saving via /draft is equivalent.
   * This endpoint is kept for compatibility and may be removed in a future refactor.
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
      const songs = response.data || [];
      return songs.map((song) => {
        if (typeof song === 'object' && song !== null) {
          return {
            title: song.title,
            difficulty: song.difficulty ?? null,
            level: song.level ?? level,
            playStyle: song.playStyle ?? playStyle
          };
        }

        return {
          title: song,
          difficulty: null,
          level,
          playStyle
        };
      });
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
