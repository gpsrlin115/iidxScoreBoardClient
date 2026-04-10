import { create } from 'zustand';

/**
 * 🎓 학습 포인트: 전역 로딩 상태 관리
 *
 * 컴포넌트 안에서 로컬 isLoading 상태를 쓰면 해당 컴포넌트만 알 수 있습니다.
 * 긴 백엔드 작업(CSV 적재, DB 초기화 등)은 "앱 전체"에 로딩을 띄워야 합니다.
 * → 전역 Zustand Store 로 관리하면 어디서든 show/hide 가 가능합니다.
 *
 * 사용 방법:
 *   useLoadingStore.getState().show('잠시만요...');
 *   useLoadingStore.getState().hide();
 *
 * 또는 useLoading 커스텀 훅을 사용합니다 (src/hooks/useLoading.js).
 */
export const useLoadingStore = create((set) => ({
  /** 로딩 오버레이 표시 여부 */
  isLoading: false,

  /** 오버레이에 표시할 메시지 (null이면 기본 문구 사용) */
  message: null,

  /**
   * show: 로딩 오버레이를 표시합니다.
   * @param {string | null} message - 사용자에게 보여줄 메시지
   */
  show: (message = null) => set({ isLoading: true, message }),

  /**
   * hide: 로딩 오버레이를 숨깁니다.
   */
  hide: () => set({ isLoading: false, message: null }),
}));
