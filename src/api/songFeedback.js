import apiClient from './client';
import { COMMENT_PAGE_SIZE } from '../constants/feedback';

/**
 * Tier-appropriateness voting and discussion for a single chart.
 *
 * Every endpoint is keyed by `chartId` — the only stable identity a tier entry
 * has. Tier data itself is a JSON blob matched on title + difficulty, and the
 * backend keeps a song-title alias table, so routing feedback by title would
 * split one chart's votes across spellings. Callers must skip these calls
 * entirely when `chartId` is null (a tier entry with no difficulty cannot name
 * a chart).
 *
 * These endpoints live under /api/** and are therefore session-authenticated;
 * the CSRF header for writes is injected by the shared client interceptor.
 *
 * Errors are rethrown as-is so the response interceptor's `error.appError`
 * survives — callers decide what is user-facing. In particular a 404 here
 * means "backend not deployed yet", which must not raise a toast.
 */
const realApi = {
  getFeedback: async (chartId) => {
    const response = await apiClient.get(`/charts/${chartId}/feedback`);
    return response.data;
  },

  saveVote: async (chartId, value) => {
    const response = await apiClient.put(`/charts/${chartId}/vote`, { value });
    return response.data;
  },

  // Re-clicking the active choice clears it. The server snapshots the current
  // tier on write, so the client never sends a tier of its own.
  clearVote: async (chartId) => {
    const response = await apiClient.delete(`/charts/${chartId}/vote`);
    return response.data;
  },

  getComments: async (chartId, { page = 0, size = COMMENT_PAGE_SIZE } = {}) => {
    const response = await apiClient.get(`/charts/${chartId}/comments`, {
      params: { page, size },
    });
    return response.data;
  },

  createComment: async (chartId, body) => {
    const response = await apiClient.post(`/charts/${chartId}/comments`, { body });
    return response.data;
  },

  deleteComment: async (chartId, commentId) => {
    await apiClient.delete(`/charts/${chartId}/comments/${commentId}`);
  },
};

// Dev-only in-memory backend, so this feature can be exercised before the real
// endpoints ship. Gated on import.meta.env.DEV as well as the flag, so it is
// structurally impossible to enable in a production build — the constant folds
// to false and the dynamic import below becomes unreachable.
const useMock = import.meta.env.DEV && import.meta.env.VITE_FEEDBACK_MOCK === '1';

/**
 * Dev-only stand-in for a chart identity the backend does not serve yet.
 *
 * Every feedback call is skipped when `chartId` is null, which is the correct
 * production behaviour but also means the mock backend could never be reached
 * — the gate sits upstream of it. Deriving a stable id from the tier entry
 * lets mock mode actually exercise the UI. Returns null unless mock mode is
 * on, so production keeps the real "no identity, no request" contract.
 */
export const resolveMockChartId = (title, difficulty) => {
  if (!useMock || !title || !difficulty) return null;

  const key = `${title}|${difficulty}`;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (Math.imul(hash, 31) + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
};

let mockImplPromise = null;

const getImpl = () => {
  if (!useMock) return Promise.resolve(realApi);
  if (!mockImplPromise) {
    mockImplPromise = import('./songFeedbackMock').then((module) => module.default);
  }
  return mockImplPromise;
};

export const songFeedbackApi = {
  getFeedback: async (chartId) => (await getImpl()).getFeedback(chartId),
  saveVote: async (chartId, value) => (await getImpl()).saveVote(chartId, value),
  clearVote: async (chartId) => (await getImpl()).clearVote(chartId),
  getComments: async (chartId, options) => (await getImpl()).getComments(chartId, options),
  createComment: async (chartId, body) => (await getImpl()).createComment(chartId, body),
  deleteComment: async (chartId, commentId) => (await getImpl()).deleteComment(chartId, commentId),
};

export default songFeedbackApi;
