import { useLoadingStore } from '../store/loadingStore';

/**
 * 🎓 학습 포인트: useLoading 커스텀 훅
 *
 * 비동기 작업을 실행하면서 전역 로딩 오버레이를 자동으로 제어합니다.
 *
 * ─ 기존 방식 (매번 수동으로) ─────────────────────────────
 *   setIsLoading(true);
 *   try {
 *     await someApi.doSomething();
 *   } finally {
 *     setIsLoading(false);
 *   }
 *
 * ─ useLoading 사용 후 ──────────────────────────────────────
 *   const { run } = useLoading();
 *   await run(() => someApi.doSomething(), 'Bootstrap 적재 중...');
 *
 * ─ 장점 ───────────────────────────────────────────────────
 *   - try/finally 반복 제거
 *   - 에러가 나도 반드시 hide() 호출 (finally 보장)
 *   - 전역 오버레이이므로 어떤 컴포넌트에서 호출해도 동작
 *
 * @returns {{ run: Function }}
 */
export const useLoading = () => {
  const { show, hide, isLoading } = useLoadingStore();

  /**
   * @param {() => Promise<any>} asyncFn - 실행할 비동기 함수
   * @param {string | null} message      - 로딩 중 표시할 메시지
   * @returns {Promise<any>}             - asyncFn의 반환값 그대로 전달
   */
  const run = async (asyncFn, message = null) => {
    show(message);
    try {
      return await asyncFn();
    } finally {
      hide();
    }
  };

  return { run, isRunning: isLoading };
};
