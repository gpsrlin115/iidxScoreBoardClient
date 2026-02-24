import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import { authApi } from './api/auth';
import ProtectedRoute from './components/guards/ProtectedRoute';
import Login from './pages/Login';

/**
 * 🎓 학습 포인트: 페이지 컴포넌트를 lazy import하는 이유
 *
 * 현재는 placeholder로 인라인 컴포넌트를 사용합니다.
 * 실제 페이지 컴포넌트가 만들어지면 아래처럼 import합니다:
 *   const Login = lazy(() => import('./pages/Login'));
 *
 * lazy import = "이 컴포넌트가 필요할 때만 코드를 불러온다"
 * → 앱 초기 로딩 속도가 빨라집니다 (Code Splitting)
 *
 * 지금은 개발 편의를 위해 인라인으로 작성합니다.
 */

// ─── 임시 placeholder 컴포넌트 (나중에 별도 파일로 교체) ───
const PlaceholderPage = ({ title }) => (
  <div className="flex items-center justify-center min-h-screen bg-bg-darker">
    <h1 className="text-3xl font-bold text-text-light">{title} 페이지 (개발 중)</h1>
  </div>
);

function App() {

  /**
   * 🎓 학습 포인트: useEffect란?
   *
   * useEffect는 컴포넌트가 화면에 나타난 후(마운트 후) 실행되는 코드를 담습니다.
   * 두 번째 인자인 빈 배열 []은 "앱 시작 시 딱 한 번만 실행"을 의미합니다.
   *
   * 여기서 하는 일: 세션 복원 (Session Restoration)
   * 1. 앱이 시작됨
   * 2. /api/users/me 호출 → 쿠키에 유효한 세션이 있으면 사용자 정보 반환
   * 3. user를 Store에 저장 → 로그인 상태로 인식
   * 4. 쿠키가 없거나 만료됐으면 → 에러 발생 → user는 null 유지 (로그아웃 상태)
   *
   * 🎓 lint 경고 "missing dependencies" 해결책
   * useAuthStore.getState()는 리렌더링 없이 현재 스토어를 바로 읽습니다.
   * 세션 복원은 마운트 시 "딱 한 번"만 실행하면 되므로
   * 의존성 배열에 함수를 넣지 않아도 안전합니다.
   */
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const user = await authApi.getCurrentUser();
        // getState()로 직접 액션을 호출 → 의존성 배열 경고 없이 안전
        useAuthStore.getState().setUser(user);
      } catch {
        // 401 등 에러 발생 = 로그인 안 된 상태 → 아무것도 하지 않음 (user: null 유지)
      } finally {
        useAuthStore.getState().setLoading(false);
      }
    };

    restoreSession();
  }, []); // 빈 배열: 앱 시작 시 딱 한 번만 실행


  return (
    /**
     * 🎓 Toaster 컴포넌트란?
     * react-hot-toast 라이브러리의 뷰 컴포넌트입니다.
     * 앱 최상단에 한 번만 두면, 어디서든 toast.success() 등을 호출할 수 있습니다.
     * position="top-right": 화면 우측 상단에 알림이 표시됩니다.
     */
    <Router>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
          },
        }}
      />
      <Routes>
        {/* ── 공개 라우트 (로그인 없이 접근 가능) ── */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<PlaceholderPage title="회원가입" />} />

        {/* ── 보호된 라우트 (로그인 필요) ── */}
        {/**
         * 🎓 ProtectedRoute로 감싸면 어떻게 되나요?
         * - 로그인 O → <PlaceholderPage> 렌더링
         * - 로그인 X → /login으로 리다이렉트
         */}
        <Route path="/" element={
          <ProtectedRoute>
            <PlaceholderPage title="대시보드" />
          </ProtectedRoute>
        } />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Navigate to="/" replace />
          </ProtectedRoute>
        } />
        <Route path="/scores" element={
          <ProtectedRoute>
            <PlaceholderPage title="스코어 목록" />
          </ProtectedRoute>
        } />
        <Route path="/tier-table/:level" element={
          <ProtectedRoute>
            <PlaceholderPage title="서열표" />
          </ProtectedRoute>
        } />
        <Route path="/import/*" element={
          <ProtectedRoute>
            <PlaceholderPage title="데이터 가져오기" />
          </ProtectedRoute>
        } />
        <Route path="/profile/*" element={
          <ProtectedRoute>
            <PlaceholderPage title="프로필" />
          </ProtectedRoute>
        } />
        <Route path="/admin/tier-table" element={
          <ProtectedRoute>
            <PlaceholderPage title="서열표 관리 (Admin)" />
          </ProtectedRoute>
        } />

        {/* ── 404: 정의되지 않은 경로는 홈으로 ── */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
