import apiClient from './client';
import { buildLayoutMatchPayload } from '../features/layoutAnalysis/payload.js';

export const layoutAnalysisApi = {
  async getYouTubeMetadata(youtubeUrl) {
    const response = await apiClient.post('/layout-analyses/youtube/metadata', { youtubeUrl });
    return response.data;
  },

  async findCandidates({ videoId = null, query = '', titles = [], difficulties = [] }) {
    const response = await apiClient.post('/layout-analyses/candidates', {
      videoId,
      query,
      screenOcr: { titles, difficulties },
    });
    return response.data;
  },

  async match({ inputSource, videoId = null, chartId, observedNotes }) {
    const payload = buildLayoutMatchPayload({ inputSource, videoId, chartId, observedNotes });
    const serialized = JSON.stringify(payload);
    if (new TextEncoder().encode(serialized).length > 1_000_000) {
      throw new Error('배열 분석 요청은 1MB 이하여야 합니다.');
    }
    const response = await apiClient.post('/layout-analyses/match', payload);
    return response.data;
  },
};
