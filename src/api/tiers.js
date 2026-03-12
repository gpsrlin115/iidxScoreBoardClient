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

    const levelData = tierTableData[String(level)];
    if (!levelData) {
      return null;
    }

    return levelData[playStyle] || null;
  }
};
