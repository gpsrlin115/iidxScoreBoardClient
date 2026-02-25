import { create } from 'zustand';

/**
 * 🎓 학습 포인트: 왜 필터 상태를 Store에 둘까요?
 *
 * useState를 쓰면 컴포넌트가 언마운트될 때 상태가 사라집니다.
 * 즉, "레벨 12 필터" 적용 후 다른 페이지 갔다가 돌아오면 필터가 초기화됩니다.
 *
 * Zustand Store에 두면:
 * - 페이지를 이동했다 돌아와도 필터가 유지됩니다
 * - 필터 상태를 URL 쿼리 파라미터로 동기화하기도 쉽습니다
 */
export const useScoresStore = create((set) => ({
  // ─── 필터 상태 ───
  filters: {
    playStyle: '',     // 'SP' | 'DP' | '' (전체)
    level: '',         // 1~12 | '' (전체)
    chartType: '',     // 'BEGINNER' | 'NORMAL' | 'HYPER' | 'ANOTHER' | 'LEGGENDARIA' | ''
    clearType: '',     // 'FAILED' | 'ASSIST_CLEAR' | 'EASY_CLEAR' | ... | ''
  },

  // ─── 페이지네이션 상태 ───
  /**
   * 🎓 Spring의 Page 응답 구조
   * 백엔드(Spring Data)는 페이지 응답을 다음 형식으로 보냅니다:
   * {
   *   content: [...],     ← 실제 데이터 배열
   *   totalElements: 100,  ← 전체 항목 수
   *   totalPages: 5,       ← 전체 페이지 수
   *   number: 0,           ← 현재 페이지 번호 (0부터 시작!)
   *   size: 20,            ← 페이지 크기
   * }
   * Spring은 0부터 시작하는 페이지 번호를 사용합니다.
   */
  pagination: {
    page: 0,   // 현재 페이지 (0-indexed)
    size: 20,  // 페이지당 항목 수
  },

  // ─── 액션 ───
  setFilters: (newFilters) =>
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
      pagination: { ...state.pagination, page: 0 }, // 필터 변경 시 첫 페이지로 돌아감
    })),

  setPage: (page) =>
    set((state) => ({
      pagination: { ...state.pagination, page },
    })),

  /**
   * 🎓 스프레드 연산자(...)로 부분 업데이트
   * setFilters({ level: 12 }) 호출 시:
   * - ...state.filters: 기존 필터를 모두 유지
   * - ...newFilters: 새로운 값으로 해당 필드만 덮어씀
   * 결과: { playStyle: 'SP', level: 12, chartType: '', clearType: '' }
   */
  resetFilters: () =>
    set({
      filters: { playStyle: '', level: '', chartType: '', clearType: '' },
      pagination: { page: 0, size: 20 },
    }),
}));
