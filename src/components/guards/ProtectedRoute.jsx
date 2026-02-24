import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

/**
 * 🎓 학습 포인트: Route Guard (라우트 가드)란?
 *
 * 웹앱에는 "로그인한 사용자만 볼 수 있는 페이지"가 있습니다.
 * → 예: 대시보드, 스코어 페이지, 프로필 페이지
 *
 * 이런 페이지를 보호하는 방법이 Route Guard입니다.
 * - 로그인 O → 요청한 페이지를 보여줌
 * - 로그인 X → 로그인 페이지로 강제 이동
 *
 * 🎓 컴포넌트가 컴포넌트를 감싸는 패턴 (Wrapper Pattern)
 *
 * 사용 예시:
 * <ProtectedRoute>
 *   <Dashboard />     ← 이 컴포넌트를 보호합니다
 * </ProtectedRoute>
 *
 * children prop은 "감싼 컴포넌트"를 의미합니다.
 */
const ProtectedRoute = ({ children }) => {
  // authStore에서 상태를 읽어옵니다
  const { user, isLoading } = useAuthStore();

  /**
   * 🎓 왜 isLoading 처리가 필요할까요?
   *
   * 앱이 시작될 때:
   * 1. authStore의 user는 null (초기값)
   * 2. 백엔드에 "로그인 되어있나?" 확인 중 (isLoading: true)
   * 3. 아직 응답이 안 왔는데 user === null 이라고 로그인 페이지로 보내면?
   *    → 로그인된 사용자인데 로그인 페이지로 튕겨버리는 버그 발생!
   *
   * 그래서 로딩 중에는 아무것도 렌더링하지 않고 기다립니다.
   * (실제로는 Spinner를 보여주는 것이 더 좋은 UX)
   */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-darker">
        <div className="text-text-light text-lg animate-pulse">Loading...</div>
      </div>
    );
  }

  /**
   * 🎓 Navigate 컴포넌트란?
   *
   * React Router에서 제공하는 컴포넌트입니다.
   * 렌더링되는 순간 해당 경로로 리다이렉트합니다.
   *
   * replace={true}를 주면:
   * - 브라우저 히스토리에 현재 페이지가 남지 않습니다
   * - 즉, 뒤로가기를 눌러도 보호된 페이지로 돌아오지 못합니다
   */
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 로그인 상태 → 자식 컴포넌트(보호된 페이지)를 그대로 렌더링
  return children;
};

export default ProtectedRoute;
