import apiClient from './client';

/**
 * 스코어 관련 API 함수 모음
 *
 * 🎓 빈 문자열 필터 제거 로직
 * 사용자가 필터를 선택 안 하면 값이 ''(빈 문자열)입니다.
 * 이를 그대로 보내면 ?clearType= 처럼 의미 없는 파라미터가 붙습니다.
 * Object.entries + filter로 빈 값을 미리 제거합니다.
 *
 * 예시:
 *   { level: 12, playStyle: '', clearType: '' }
 *   → cleanParams: { level: 12 }
 *   → GET /api/scores?level=12  (전체 플레이스타일, 전체 클리어타입)
 */
export const scoresApi = {
  getScores: async (params = {}) => {
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
    );
    const response = await apiClient.get('/scores', { params: cleanParams });
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
