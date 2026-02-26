import { useState, useEffect, useCallback } from 'react';
import { scoresApi } from '../api/scores';
import { useAuthStore } from '../store/authStore';

/**
 * 🎓 학습 포인트: Promise.all을 활용한 병렬 데이터 페칭
 *
 * 백엔드에 대시보드 전용 통계 API가 없을 때,
 * 클라이언트에서 여러 번 API를 호출하여 데이터를 조합해야 합니다.
 *
 * 나쁜 예 (순차 호출 - 느림):
 *   const total = await getScores({size:1}); // 0.5초 대기
 *   const fc = await getScores({clearType:'FULL_COMBO', size:1}); // 0.5초 대기
 *   // 총 1초 소요
 *
 * 좋은 예 (병렬 호출 - 빠름):
 *   const [total, fc] = await Promise.all([
 *     getScores({size:1}),
 *     getScores({clearType:'FULL_COMBO', size:1})
 *   ]);
 *   // 동시에 실행되므로 총 0.5초 소요 (가장 오래 걸린 API 기준)
 */

const useDashboard = () => {
  const [stats, setStats] = useState({
    total: 0,
    fullCombo: 0,
    exHard: 0,
    hard: 0,
    clear: 0,
  });
  const [recentScores, setRecentScores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // 인증 상태 확인용 (비로그인 시 API 호출 방지)
  const { isAuthenticated } = useAuthStore();

  const fetchDashboardData = useCallback(async () => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      /**
       * 🎓 API 6개를 동시에 요청합니다.
       * size: 1 로 요청하여 데이터 전송량을 최소화하고,
       * 응답의 totalElements 속성만 추출하여 개수를 파악합니다.
       */
      const [
        totalRes,
        fcRes,
        exHardRes,
        hardRes,
        clearRes,
        recentRes
      ] = await Promise.all([
        scoresApi.getScores({ size: 1 }),
        scoresApi.getScores({ clearType: 'FULL_COMBO', size: 1 }),
        scoresApi.getScores({ clearType: 'EX_HARD_CLEAR', size: 1 }),
        scoresApi.getScores({ clearType: 'HARD_CLEAR', size: 1 }),
        scoresApi.getScores({ clearType: 'CLEAR', size: 1 }),
        scoresApi.getScores({ page: 0, size: 5 }) // 최근 스코어 5개
      ]);

      // 상태 업데이트
      setStats({
        total: totalRes.totalElements,
        fullCombo: fcRes.totalElements,
        exHard: exHardRes.totalElements,
        hard: hardRes.totalElements,
        clear: clearRes.totalElements,
      });

      setRecentScores(recentRes.content);
    } catch (err) {
      setError(err.response?.data?.message || '대시보드 데이터를 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // 컴포넌트 마운트 시 자동 실행
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return {
    stats,
    recentScores,
    isLoading,
    error,
    refetch: fetchDashboardData // 수동 새로고침용
  };
};

export default useDashboard;
