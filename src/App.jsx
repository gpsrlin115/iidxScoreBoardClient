import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import { authApi } from './api/auth';
import ProtectedRoute from './components/guards/ProtectedRoute';
import ProtectedLayout from './components/layout/ProtectedLayout';
import Login from './pages/Login';
import Scores from './pages/Scores';
import CsvUpload from './pages/CsvUpload';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import TierTable from './pages/TierTable';

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
      <h1 className="text-3xl font-bold text-white mb-2">{title}</h1>
      <p className="text-slate-400 text-sm">개발 중입니다...</p>
    </div>
  </div>
);

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
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#1e293b', color: '#f1f5f9' },
        }}
      />

      <Routes>
        {/* ───────────────────────────────────────────────
         * 공개 라우트 (로그인 없이 접근 가능)
         * ─────────────────────────────────────────────── */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

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
          <Route path="/admin/tier-table" element={<PlaceholderPage title="서열표 관리 (Admin)" />} />
        </Route>

        {/* 404: 정의되지 않은 경로는 홈으로 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
