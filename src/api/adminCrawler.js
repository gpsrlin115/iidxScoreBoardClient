import apiClient from './client';

const BUDGET_URL = '/admin/crawler/request-budget';

/**
 * eagate request budget shared by all server-side collection (Admin Only).
 * Errors are rethrown untouched; the screen classifies them
 * (see `budgetErrorMessage` in src/utils/requestBudget.js).
 */
export const adminCrawlerApi = {
  getRequestBudget: async ({ signal } = {}) => {
    const response = await apiClient.get(BUDGET_URL, { signal });
    return response.data;
  },

  /**
   * Pull `blocked_until` forward to now. The server answers with the state
   * after the release and changes nothing when there is no block.
   */
  releaseBlock: async () => {
    const response = await apiClient.delete(`${BUDGET_URL}/block`);
    return response.data;
  },
};

export default adminCrawlerApi;
