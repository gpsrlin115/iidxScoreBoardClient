import apiClient from './client';

export const scoresApi = {
  getScores: async (params = {}) => {
    const response = await apiClient.get('/scores', { params });
    return response.data;
  },
};

export const userApi = {
  uploadAvatar: async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post('/users/me/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};
