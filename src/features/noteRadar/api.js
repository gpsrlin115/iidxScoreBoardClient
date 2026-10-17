import apiClient from '../../api/client';
import { normalizeRecommendations, normalizeSummary, requestFilters } from './model.js';

const ROOT = '/note-radar';
const options = (signal) => ({ timeout: 20000, signal });

export const noteRadarApi = {
  async getSummary(signal) {
    const { data } = await apiClient.get(`${ROOT}/me`, options(signal));
    return normalizeSummary(data);
  },
  async getRecommendations(category, filters = {}, signal) {
    const { data } = await apiClient.get(`${ROOT}/recommendations`, {
      ...options(signal), params: { category, ...requestFilters(filters) },
    });
    return normalizeRecommendations(data);
  },
  async simulate(targets, signal) {
    const { data } = await apiClient.post(`${ROOT}/simulate`, { targets }, options(signal));
    return data;
  },
  async getGoals(signal) {
    const { data } = await apiClient.get(`${ROOT}/goals`, options(signal));
    return Array.isArray(data) ? data : data.goals ?? [];
  },
  async saveGoal(goal) {
    const { data } = await apiClient.put(`${ROOT}/goals`, goal, options());
    return data;
  },
  async deleteGoal(id) {
    await apiClient.delete(`${ROOT}/goals/${encodeURIComponent(id)}`, options());
  },
};
