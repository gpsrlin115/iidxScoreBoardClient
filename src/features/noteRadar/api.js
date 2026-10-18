import apiClient from '../../api/client';
import { CATEGORIES, normalizeGoal, normalizeRecommendations, normalizeSummary, numericId, requestFilters } from './model.js';

const ROOT = '/note-radar';
const options = (signal) => ({ timeout: 20000, signal });

const requireId = (value) => {
  const id = numericId(value);
  if (id === null) throw new TypeError('채보 또는 목표곡 ID를 확인해 주세요.');
  return id;
};
const requireEx = (value) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new TypeError('EX는 0 이상의 정수로 입력해 주세요.');
  return value;
};

export const noteRadarApi = {
  async getSummary(signal) {
    const { data } = await apiClient.get(`${ROOT}/me`, options(signal));
    return normalizeSummary(data);
  },
  async getRecommendations(category, filters = {}, signal) {
    if (!CATEGORIES.includes(category)) throw new TypeError('카테고리를 확인해 주세요.');
    const { data } = await apiClient.get(`${ROOT}/recommendations`, {
      ...options(signal), params: { ...requestFilters(filters), category },
    });
    return normalizeRecommendations(data);
  },
  async simulate(targets, signal) {
    if (!Array.isArray(targets) || targets.length < 1 || targets.length > 50) throw new TypeError('계산할 채보는 1개부터 50개까지 선택해 주세요.');
    const payload = targets.map(({ chartId, exScore }) => ({ chartId: requireId(chartId), exScore: requireEx(exScore) }));
    const { data } = await apiClient.post(`${ROOT}/simulate`, { targets: payload }, options(signal));
    return data;
  },
  async getGoals(signal) {
    const { data } = await apiClient.get(`${ROOT}/goals`, options(signal));
    const goals = Array.isArray(data) ? data : data?.goals ?? [];
    return goals.map(normalizeGoal);
  },
  async saveGoal(goal) {
    if (!CATEGORIES.includes(goal.category)) throw new TypeError('카테고리를 확인해 주세요.');
    const payload = { chartId: requireId(goal.chartId), category: goal.category, targetExScore: requireEx(goal.targetExScore) };
    const { data } = await apiClient.put(`${ROOT}/goals`, payload, options());
    return data;
  },
  async deleteGoal(id) {
    await apiClient.delete(`${ROOT}/goals/${requireId(id)}`, options());
  },
};
