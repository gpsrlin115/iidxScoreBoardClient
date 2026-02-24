import { create } from 'zustand';

/**
 * 🎓 학습 포인트: Zustand Store 만들기
 * 
 * create() 함수는 Zustand의 핵심입니다.
 * - 인자로 받는 함수(set, get)를 통해 상태를 관리합니다
 * - set: 상태를 업데이트하는 함수
 * - get: 현재 상태를 읽는 함수
 * 
 * 반환값은 React Hook입니다! (useAuthStore)
 * 컴포넌트에서 const { user } = useAuthStore() 처럼 사용합니다.
 */
export const useAuthStore = create((set, get) => ({
  // ========================================
  // 📦 상태 (State)
  // ========================================
  
  /**
   * user: 현재 로그인한 사용자 정보
   * - null이면 로그아웃 상태
   * - 객체가 있으면 로그인 상태
   */
  user: null,
  
  /**
   * isLoading: 로그인 확인 중인지 여부
   * - 앱 시작 시 "이미 로그인되어 있나?" 확인하는 동안 true
   * - API 호출이 끝나면 false
   */
  isLoading: true,
  
  /**
   * error: 로그인/로그아웃 중 발생한 에러 메시지
   */
  error: null,

  // ========================================
  // 🔧 액션 (Actions)
  // ========================================
  
  /**
   * setUser: 사용자 정보를 저장하는 함수
   * 
   * 🎓 왜 이렇게 하나요?
   * - set() 함수는 상태를 업데이트합니다
   * - 객체를 반환하면, 그 객체의 속성들이 상태에 병합됩니다
   * - 예: setUser({ id: 1, name: 'Kim' }) 호출 시
   *   → user가 { id: 1, name: 'Kim' }으로 변경됩니다
   */
  setUser: (user) => set({ user, error: null }),
  
  /**
   * setLoading: 로딩 상태를 변경하는 함수
   */
  setLoading: (isLoading) => set({ isLoading }),
  
  /**
   * setError: 에러 메시지를 저장하는 함수
   */
  setError: (error) => set({ error }),
  
  /**
   * logout: 로그아웃 처리
   * 
   * 🎓 무슨 일이 일어나나요?
   * 1. user를 null로 설정 → "로그아웃 상태"로 변경
   * 2. error를 null로 초기화 → 이전 에러 메시지 제거
   * 3. 이 함수를 호출하는 모든 컴포넌트가 자동으로 리렌더링됩니다!
   */
  logout: () => set({ user: null, error: null }),
  
  /**
   * clearError: 에러 메시지를 지우는 함수
   * 
   * 🎓 언제 사용하나요?
   * - 사용자가 에러 알림을 닫을 때
   * - 새로운 로그인 시도를 시작할 때
   */
  clearError: () => set({ error: null }),
  
  /**
   * isAuthenticated: 로그인 여부를 확인하는 함수
   * 
   * 🎓 왜 함수로 만들었나요?
   * - get()을 사용하면 현재 상태를 읽을 수 있습니다
   * - 단순히 user !== null을 체크합니다
   * - 컴포넌트에서 const isLoggedIn = useAuthStore(state => state.isAuthenticated())
   *   처럼 사용할 수 있습니다
   */
  isAuthenticated: () => {
    const { user } = get();
    return user !== null;
  },
}));

/**
 * 🎓 이 Store를 어떻게 사용하나요?
 * 
 * 예시 1: 컴포넌트에서 사용자 정보 읽기
 * ```jsx
 * function Header() {
 *   const user = useAuthStore((state) => state.user);
 *   
 *   return <div>안녕하세요, {user?.name}님!</div>;
 * }
 * ```
 * 
 * 예시 2: 로그아웃 버튼
 * ```jsx
 * function LogoutButton() {
 *   const logout = useAuthStore((state) => state.logout);
 *   
 *   return <button onClick={logout}>로그아웃</button>;
 * }
 * ```
 * 
 * 예시 3: 로그인 여부 확인
 * ```jsx
 * function ProtectedPage() {
 *   const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
 *   
 *   if (!isAuthenticated) {
 *     return <Navigate to="/login" />;
 *   }
 *   
 *   return <div>보호된 페이지</div>;
 * }
 * ```
 * 
 * 🔑 핵심 개념:
 * - useAuthStore((state) => state.user) 형태로 사용
 * - state => state.xxx 부분을 "selector"라고 부릅니다
 * - selector를 사용하면 필요한 값만 구독하므로 성능이 좋습니다!
 */
