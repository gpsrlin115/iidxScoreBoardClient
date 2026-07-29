import { useState, useEffect, useCallback } from 'react';
import { scoresApi } from '../api/scores';
import { useScoresStore } from '../store/scoresStore';
import { toAppError } from '../utils/httpError';

/**
 * 🎓 학습 포인트: 커스텀 훅 (Custom Hook)이란?
 *
 * 컴포넌트에는 두 가지 책임이 있습니다:
 * 1. "어떻게 보일까" (UI/렌더링)
 * 2. "어떻게 동작할까" (로직/데이터 처리)
 *
 * 커스텀 훅은 2번 "로직"을 별도로 분리한 것입니다.
 * - 이름이 "use"로 시작하면 React가 훅으로 인식합니다
 * - 내부에서 다른 훅(useState, useEffect 등)을 사용할 수 있습니다
 *
 * 장점:
 * - Scores.jsx가 UI에만 집중할 수 있습니다
 * - 같은 로직을 여러 컴포넌트에서 재사용할 수 있습니다
 * - 테스트가 쉬워집니다
 *
 * 🎓 이 훅이 하는 일:
 * 1. scoresStore에서 현재 필터/페이지 읽기
 * 2. API 호출 → 스코어 목록 로딩
 * 3. 필터/페이지 바뀌면 자동으로 재호출
 * 4. 로딩/에러 상태 관리
 */
const useScores = () => {
  const { filters, pagination } = useScoresStore();

  const [data, setData] = useState(null);    // Spring Page 응답 전체
  const [isLoading, setIsLoading] = useState(true);
  // toAppError가 정규화한 객체({ status, message, retryable, ... })를 담습니다.
  // 문자열이 아니라 객체인 이유: 화면이 상태 코드별로 다른 UI를 보여줘야 하기 때문입니다.
  const [error, setError] = useState(null);

  /**
   * 🎓 useCallback이란?
   *
   * 함수를 "기억(메모이제이션)"합니다.
   * 의존성 배열의 값이 바뀌지 않으면 같은 함수 객체를 재사용합니다.
   *
   * 왜 필요한가요?
   * fetchScores를 useEffect의 의존성에 넣어야 합니다.
   * useCallback 없이 일반 함수로 선언하면 렌더링마다 새 함수가 생겨
   * useEffect가 무한히 실행될 수 있습니다!
   */
  const fetchScores = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await scoresApi.getScores({
        ...filters,
        page: pagination.page,
        size: pagination.size,
      });
      setData(result);
    } catch (err) {
      setError(toAppError(err, { fallback: '스코어를 불러오는 데 실패했습니다.' }));
    } finally {
      setIsLoading(false);
    }
  }, [filters, pagination]);

  /**
   * 🎓 useEffect + 의존성 배열
   *
   * [fetchScores] = "fetchScores 함수가 바뀔 때마다 실행"
   * 즉, 필터나 페이지가 바뀌면 → fetchScores가 새로 생성 → useEffect 재실행 → 새 API 호출
   */
  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  return {
    scores: data?.content ?? [],        // 현재 페이지 스코어 배열
    totalElements: data?.totalElements ?? 0,
    totalPages: data?.totalPages ?? 0,
    currentPage: data?.number ?? 0,
    isLoading,
    error,
    refetch: fetchScores,
  };
};

export default useScores;
