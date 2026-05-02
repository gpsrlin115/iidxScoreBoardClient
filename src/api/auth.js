import apiClient from './client';

/**
 * 🎓 학습 포인트: API 함수를 왜 별도 파일로 분리할까요?
 *
 * 이유 1: 단일 책임 원칙 (Single Responsibility Principle)
 *   - client.js  → Axios 인스턴스 "설정"만 담당
 *   - auth.js    → 인증 관련 API "호출"만 담당
 *   - scores.js  → 스코어 관련 API "호출"만 담당
 *
 * 이유 2: 유지보수가 쉬워집니다
 *   - 백엔드 엔드포인트가 바뀌면? → 이 파일만 수정!
 *   - 컴포넌트 코드는 전혀 건드릴 필요 없습니다.
 *
 * 이유 3: 재사용성
 *   - 어느 컴포넌트에서든 authApi.login() 한 줄이면 됩니다.
 */
export const authApi = {
  /**
   * 로그인 요청
   *
   * 🎓 무슨 일이 일어나나요?
   * 1. POST /api/auth/login 으로 { username, password } 전송
   * 2. 백엔드 인증 성공 시 → 세션 쿠키를 응답 헤더에 담아 반환
   * 3. client.js의 withCredentials: true 덕분에
   *    브라우저가 쿠키를 자동으로 저장합니다
   * 4. 이후 모든 API 요청에 이 쿠키가 자동으로 포함됩니다
   *
   * 🎓 async/await 패턴
   *   async 함수는 항상 Promise를 반환합니다.
   *   await는 "이 작업이 끝날 때까지 기다려라"는 의미입니다.
   *   → 서버 응답이 올 때까지 다음 줄로 넘어가지 않습니다.
   */
  login: async (username, password) => {
    const response = await apiClient.post('/auth/login', { username, password });
    return response.data;
  },

  /**
   * 회원가입 요청
   *
   * 🎓 API 스펙에 아직 없지만 백엔드 AuthService에 signup() 메서드가 있습니다.
   * 프론트엔드에서 미리 구현해두면 백엔드 엔드포인트가 추가될 때 바로 연동됩니다.
   *
   * @param {{ username: string, email: string, password: string }} data
   */
  signup: async ({ username, email, password }) => {
    const response = await apiClient.post('/auth/signup', { username, email, password });
    return response.data;
  },

  /**
   * 로그아웃 요청
   *
   * 🎓 클라이언트에서 직접 쿠키를 지우지 않나요?
   * → 서버에 요청해야 합니다! 이유:
   *   - 세션 정보는 "서버"가 관리합니다
   *   - 서버 세션을 무효화해야 진짜 로그아웃입니다
   *   - 클라이언트 쿠키만 지우면 서버 세션이 남아 보안 위험이 생깁니다
   */
  logout: async () => {
    await apiClient.post('/auth/logout');
  },

  /**
   * 현재 로그인한 사용자 정보 조회
   *
   * 🎓 앱 시작 시 왜 이 API를 호출할까요?
   * - 페이지를 새로고침하면 JavaScript 메모리(Zustand Store)가 초기화됩니다
   * - 하지만 쿠키(세션)는 브라우저에 그대로 남아 있습니다!
   * - 그래서 앱 시작 시 서버에 "내가 아직 로그인 상태인가?" 확인합니다
   * - 이것을 "세션 복원(Session Restoration)"이라고 합니다
   */
  getCurrentUser: async () => {
    const response = await apiClient.get('/users/me');
    return response.data;
  },

  /**
   * 아이디 찾기
   */
  findUsername: async (email) => {
    const response = await apiClient.post('/auth/find-username', { email });
    return response.data;
  },

  /**
   * 비밀번호 재설정 요청 (토큰 발급)
   */
  requestPasswordReset: async (username, email) => {
    const response = await apiClient.post('/auth/password-reset/request', { username, email });
    return response.data;
  },

  /**
   * 비밀번호 재설정 완료
   */
  confirmPasswordReset: async (token, newPassword) => {
    const response = await apiClient.post('/auth/password-reset/confirm', { token, newPassword });
    return response.data;
  },
};
