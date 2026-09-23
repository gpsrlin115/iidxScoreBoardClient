import apiClient from './client';

export const tierShareApi = {
  getStatus: async () => {
    const response = await apiClient.get('/tier-shares/me');
    return response.data;
  },

  setEnabled: async (enabled) => {
    const response = await apiClient.put('/tier-shares/me', { enabled });
    return response.data;
  },

  regenerate: async () => {
    const response = await apiClient.post('/tier-shares/me/regenerate');
    return response.data;
  },

  getPublicTierTable: async (shareId, level, playStyle, signal) => {
    const response = await apiClient.get(`/public/tier-tables/${encodeURIComponent(shareId)}`, {
      params: { level, playStyle },
      signal,
    });
    return response.data;
  },
};
