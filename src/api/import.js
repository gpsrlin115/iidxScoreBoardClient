import apiClient from './client';

/**
 * 🎓 학습 포인트: multipart/form-data란?
 *
 * 파일을 HTTP로 보낼 때 사용하는 특수한 Content-Type입니다.
 * FormData 객체로 파일과 텍스트 필드를 함께 담습니다.
 *
 * ⚠️ 주의: Content-Type을 직접 'multipart/form-data'로 쓰면 안 됩니다!
 * boundary 값이 빠져서 서버가 parsing 못 합니다.
 * → FormData를 Axios에 넘기면 자동으로 올바른 헤더를 설정해줍니다.
 *
 * 🎓 onUploadProgress란?
 * 파일 업로드 진행률을 실시간으로 받는 콜백입니다.
 * progressEvent.loaded = 지금까지 보낸 바이트
 * progressEvent.total  = 전체 파일 크기
 * → (loaded / total) * 100 = 진행률 %
 */
export const importApi = {
  /**
   * CSV 파일 업로드
   * @param {File} file - input[type=file]에서 가져온 File 객체
   * @param {'SP' | 'DP'} playStyle - 플레이 스타일
   * @param {(percent: number) => void} [onProgress] - 진행률 콜백 (0~100)
   */
  uploadCsv: async (file, playStyle, onProgress) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('playStyle', playStyle);

    const response = await apiClient.post('/import/iidx/score', formData, {
      // FormData를 넘기면 Axios가 Content-Type을 자동으로 multipart/form-data로 설정
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });
    return response.data;
  },

  /**
   * 전체 CSV를 업로드해서 8~12레벨 구간의 곡 마스터와 차트 마스터를 초기 적재합니다. (Admin 전용)
   * @param {File} file - 전체 CSV 파일
   * @param {'SP' | 'DP'} playStyle - 플레이 스타일
   * @param {(percent: number) => void} [onProgress] - 진행률 콜백 (0~100)
   */
  bootstrapAdminCsv: async (file, playStyle, onProgress) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('playStyle', playStyle);

    const response = await apiClient.post('/admin/bootstrap/iidx/csv', formData, {
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });
    return response.data;
  },
};
