import apiClient from './client';
import { buildLayoutMatchPayload } from '../features/layoutAnalysis/payload.js';
import { candidateQueryParams, SUPPORTED_DIFFICULTIES } from '../features/layoutAnalysis/candidates.js';

export const layoutAnalysisApi = {
  async getYouTubeMetadata(youtubeUrl) {
    const response = await apiClient.post('/layout-analyses/youtube/metadata', { youtubeUrl });
    return response.data;
  },

  async findCandidates({ videoId = null, query = '', titles = [], difficulties = [], difficulty = null }) {
    // The catalogue and the hand-picked difficulty are query parameters. A
    // difficulty folded into screenOcr would only be a ranking hint, and the
    // server filters the index exactly when it arrives as a parameter.
    const response = await apiClient.post('/layout-analyses/candidates', {
      videoId,
      query,
      screenOcr: { titles, difficulties: difficulties.filter((value) => SUPPORTED_DIFFICULTIES.includes(value)) },
    }, { params: candidateQueryParams(difficulty) });
    return response.data;
  },

  async match({ inputSource, videoId = null, chartId = null, textageChartKey = null, observedNotes }) {
    const payload = buildLayoutMatchPayload({ inputSource, videoId, chartId, textageChartKey, observedNotes });
    const serialized = JSON.stringify(payload);
    if (new TextEncoder().encode(serialized).length > 1_000_000) {
      throw new Error('배열 분석 요청은 1MB 이하여야 합니다.');
    }
    const response = await apiClient.post('/layout-analyses/match', payload);
    return response.data;
  },
};
