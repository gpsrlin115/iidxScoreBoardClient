import apiClient from './client';

export const importApi = {
  uploadCsv: async (file, playStyle) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('playStyle', playStyle);

    const response = await apiClient.post('/import/iidx/score', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};
