import { lazy, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import { authApi } from './api/auth';
import ProtectedRoute from './components/guards/ProtectedRoute';
import ProtectedLayout from './components/layout/ProtectedLayout';
import GlobalLoadingOverlay from './components/common/GlobalLoadingOverlay';
import ErrorBoundary from './components/common/ErrorBoundary';
import NavigationBridge from './components/routing/NavigationBridge';
import NotFoundPage from './pages/errors/NotFoundPage';
import Login from './pages/Login';
import Signup from './pages/Signup';
import FindAccount from './pages/FindAccount';
import ResetPasswordConfirm from './pages/ResetPasswordConfirm';
import Ddr from './pages/Ddr';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Scores = lazy(() => import('./pages/Scores'));
const TierTable = lazy(() => import('./pages/TierTable'));
const CsvUpload = lazy(() => import('./pages/CsvUpload'));
const AdminTierTable = lazy(() => import('./pages/AdminTierTable'));

/**
 * 🎓 학습 포인트: 중첩 라우트 (Nested Routes) 패턴
 *
 * 이전 방식 (Wrapper 패턴):
 *   <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
 *   <Route path="/scores" element={<ProtectedRoute><Scores /></ProtectedRoute>} />
 *   → 각 라우트마다 ProtectedRoute와 Header를 반복해야 함
 *
 * 개선된 방식 (Layout 라우트 + Outlet):
 *   <Route element={<ProtectedRoute><ProtectedLayout /></ProtectedRoute>}>
 *     <Route path="/" element={<Dashboard />} />      ← Outlet에 렌더링
 *     <Route path="/scores" element={<Scores />} />   ← Outlet에 렌더링
 *   </Route>
 *   → 부모 라우트가 한 번에 인증 + 레이아웃을 처리
 *   → 자식 라우트는 순수한 콘텐츠만 담당
 */

// 임시 placeholder (차후 실제 페이지로 교체)
const PlaceholderPage = ({ title }) => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="text-center">
      <h1 className="text-3xl font-bold text-ink mb-2">{title}</h1>
      <p className="text-muted text-sm">개발 중입니다...</p>
    </div>
  </div>
);

/**
 * 라우트 정의 + 최상위 ErrorBoundary
 *
 * 🎓 왜 App에서 분리했나요?
 * useLocation()은 <Router> 안에서만 호출할 수 있는데, App 자신이 <Router>를
 * 렌더링하므로 App 레벨에서는 쓸 수 없습니다. 한 단계 안쪽 컴포넌트로 빼면
 * 현재 경로를 읽어 ErrorBoundary의 resetKey로 넘길 수 있습니다.
 */
function AppRoutes() {
  const location = useLocation();

  return (
    /**
     * resetKey에 경로를 넘기면 사용자가 다른 메뉴로 이동할 때 에러 상태가
     * 자동으로 풀립니다. 이게 없으면 한 페이지에서 렌더 에러가 난 뒤
     * 어디로 이동해도 계속 에러 화면에 갇힙니다.
     */
    <ErrorBoundary resetKey={`${location.pathname}${location.search}`}>
      <Routes>
        {/* ───────────────────────────────────────────────
         * 공개 라우트 (로그인 없이 접근 가능)
         * ─────────────────────────────────────────────── */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/find-account" element={<FindAccount />} />
        <Route path="/reset-password" element={<ResetPasswordConfirm />} />
        <Route path="/ddr" element={<Ddr />} />

        {/* ───────────────────────────────────────────────
         * 보호된 라우트 (로그인 필요)
         *
         * 🎓 이 구조를 읽는 법:
         * 1. ProtectedRoute: 로그인 확인 → 안 되면 /login으로
         * 2. ProtectedLayout: Header + Outlet 레이아웃
         * 3. 자식 Route들: Outlet 위치에 렌더링
         * ─────────────────────────────────────────────── */}
        <Route
          element={
            <ProtectedRoute>
              <ProtectedLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/scores" element={<Scores />} />
          <Route path="/tier-table" element={<TierTable />} />
          <Route path="/tier-table/:level" element={<Navigate to="/tier-table" replace />} />
          <Route path="/import" element={<Navigate to="/import/csv" replace />} />
          <Route path="/import/csv" element={<CsvUpload />} />
          <Route path="/profile/*" element={<PlaceholderPage title="프로필" />} />
          <Route
            path="/admin/tier-table"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdminTierTable />
              </ProtectedRoute>
            }
          />
        </Route>

        {/* 404: 정의되지 않은 경로 → 홈으로 조용히 보내지 않고 명시적으로 알립니다 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ErrorBoundary>
  );
}

function App() {
  /**
   * 앱 마운트 시 세션 복원
   * → 새로고침 후에도 로그인 상태를 유지합니다
   */
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const user = await authApi.getCurrentUser();
        useAuthStore.getState().setUser(user);
      } catch {
        // 비로그인 상태 → user: null 유지
      } finally {
        useAuthStore.getState().setLoading(false);
      }
    };
    restoreSession();
  }, []);

  return (
    <Router>
      {/**
       * NavigationBridge — axios 인터셉터처럼 React 밖에서 실행되는 코드가
       * SPA 이동을 할 수 있도록 navigate 함수를 등록합니다 (401 → /login).
       * 반드시 <Router> 안에 있어야 합니다.
       */}
      <NavigationBridge />

      {/* 전역 로딩 오버레이 — isLoading이 true일 때만 렌더링됩니다 */}
      <GlobalLoadingOverlay />

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#0a0e1d',
            color: '#eceaf4',
            border: '1px solid rgba(236,234,244,.14)',
            borderRadius: '4px',
            fontSize: '13px',
          },
        }}
      />

      <AppRoutes />
    </Router>
  );
}

export default App;
