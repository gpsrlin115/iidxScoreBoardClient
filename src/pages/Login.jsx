import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/authStore';

/**
 * 🎓 학습 포인트: 로그인 페이지의 역할
 *
 * 이 컴포넌트가 하는 일:
 * 1. 사용자에게 ID/PW 입력 폼을 보여줌
 * 2. 제출 시 authApi.login() 호출
 * 3. 성공 → Store에 사용자 정보 저장 → 대시보드로 이동
 * 4. 실패 → 에러 메시지 표시
 *
 * 이 컴포넌트에서 사용하는 핵심 개념:
 * - useState: 입력값과 로딩 상태 관리
 * - useNavigate: 로그인 성공 후 페이지 이동
 * - useAuthStore: 전역 user 상태 업데이트
 */
const Login = () => {
  /**
   * 🎓 useState란?
   *
   * 컴포넌트 안에서 변할 수 있는 값을 관리합니다.
   * - username, password: 사용자가 타이핑한 값
   * - isSubmitting: 로그인 요청이 진행 중인지 (중복 제출 방지)
   *
   * useState('') = 초기값이 빈 문자열인 상태를 만듭니다
   * [username, setUsername] = [현재값, 값을 바꾸는 함수]
   */
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * 🎓 useNavigate란?
   * React Router가 제공하는 Hook입니다.
   * navigate('/') 처럼 호출하면 해당 경로로 이동합니다.
   * 링크 클릭 없이 코드로 페이지를 이동할 때 사용합니다.
   */
  const navigate = useNavigate();
  const { setUser } = useAuthStore();

  const handleSubmit = async (e) => {
    /**
     * 🎓 e.preventDefault()란?
     * HTML form의 기본 동작(페이지 새로고침)을 막습니다.
     * React에서 form을 다룰 때 거의 항상 사용합니다.
     */
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const user = await authApi.login(username, password);

      /**
       * 🎓 순서가 중요합니다!
       * 1. 먼저 Store에 user 저장 → ProtectedRoute가 통과시켜 줌
       * 2. 그 다음 navigate('/')로 이동 → 대시보드가 보임
       * 순서가 바뀌면 ProtectedRoute가 아직 로그인 안 됐다고 판단해 다시 /login으로 보냅니다.
       */
      setUser(user);
      toast.success('로그인 성공! 환영합니다 🎵');
      navigate('/');
    } catch (err) {
      /**
       * 🎓 에러 처리
       * 백엔드가 401을 반환하면 → Axios가 에러를 throw합니다
       * err.response?.data?.message: 백엔드에서 보낸 에러 메시지
       * 없으면 기본 메시지를 보여줍니다
       */
      const message = err.response?.data?.message || '아이디 또는 비밀번호를 확인해주세요.';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-darker flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* 로고 & 타이틀 */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            🎵 IIDX
          </h1>
          <p className="text-slate-400 text-sm">ScoreBoard</p>
        </div>

        {/* 로그인 카드 */}
        <div className="bg-slate-800 rounded-2xl p-8 shadow-2xl border border-slate-700">
          <h2 className="text-xl font-semibold text-white mb-6">로그인</h2>

          {/**
           * 🎓 onSubmit vs onClick
           * form에는 onSubmit을 사용합니다.
           * 이유: Enter 키로도 제출이 가능하게 됩니다.
           */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1" htmlFor="username">
                아이디
              </label>
              <input
                id="username"
                type="text"
                value={username}
                /**
                 * 🎓 onChange란?
                 * 사용자가 타이핑할 때마다 호출됩니다.
                 * e.target.value = 현재 input에 입력된 값
                 * → setUsername으로 상태를 업데이트하면
                 *   React가 자동으로 화면을 다시 그립니다 (리렌더링)
                 */
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-700 text-white rounded-lg px-4 py-3 text-sm
                           border border-slate-600 focus:outline-none focus:border-primary-500
                           transition"
                placeholder="아이디를 입력하세요"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1" htmlFor="password">
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-700 text-white rounded-lg px-4 py-3 text-sm
                           border border-slate-600 focus:outline-none focus:border-primary-500
                           transition"
                placeholder="비밀번호를 입력하세요"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary-500 hover:bg-primary-700 disabled:opacity-50
                         disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg
                         transition mt-2"
            >
              {/**
               * 🎓 조건부 렌더링
               * isSubmitting이 true면 "로그인 중..." 텍스트를 보여줍니다.
               * 버튼을 비활성화(disabled)해서 중복 제출을 막습니다.
               */}
              {isSubmitting ? '로그인 중...' : '로그인'}
            </button>
          </form>

          <p className="text-center text-slate-500 text-sm mt-6">
            <Link to="/find-account" className="text-slate-400 hover:text-white transition">
              아이디 / 비밀번호 찾기
            </Link>
            <span className="mx-3 text-slate-600">|</span>
            <Link to="/signup" className="text-primary-500 hover:text-primary-400 transition">
              회원가입
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
