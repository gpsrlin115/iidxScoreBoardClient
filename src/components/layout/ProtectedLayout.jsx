import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { RouteContentSpinner } from '../common/Spinner';
import ErrorBoundary from '../common/ErrorBoundary';
import Header from './Header';

/**
 * 🎓 학습 포인트: Layout 컴포넌트 패턴
 *
 * 모든 보호된 페이지는 공통적으로 Header를 가집니다.
 * 이를 매 페이지마다 <Header />를 쓰지 않고,
 * ProtectedLayout 하나로 묶어 관리합니다.
 *
 * 구조:
 * <ProtectedLayout>
 *   ├── <Header />           ← 모든 페이지에 공통
 *   └── <main>               ← 페이지마다 다른 콘텐츠
 *         <Outlet />          ← 자식 라우트가 여기에 렌더링
 *       </main>
 *
 * 🎓 Outlet이란?
 * React Router v6의 핵심 개념입니다.
 * 중첩 라우트(Nested Routes)에서 자식 컴포넌트를 표시하는 "자리 표시자"입니다.
 *
 * App.jsx에서:
 *   <Route element={<ProtectedLayout />}>
 *     <Route path="/" element={<Dashboard />} />       ← Outlet 위치에 렌더링
 *     <Route path="/scores" element={<Scores />} />    ← Outlet 위치에 렌더링
 *   </Route>
 */
const ProtectedLayout = () => {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-bg-darker flex flex-col">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8">
        {/**
         * 🎓 Outlet = "이 자리에 자식 라우트가 들어옵니다"
         * /scores 접속 시 → Scores 컴포넌트가 Outlet 자리에 렌더링됩니다.
         * /profile 접속 시 → Profile 컴포넌트가 Outlet 자리에 렌더링됩니다.
         * Header는 공통으로 유지됩니다.
         *
         * 🎓 ErrorBoundary가 왜 여기(Header 바깥이 아니라 main 안)에 있나요?
         * 페이지 렌더 중 에러가 나도 Header는 살아 있어야 사용자가 다른 메뉴로
         * 빠져나갈 수 있습니다. App.jsx 최상위에도 백스톱 ErrorBoundary가
         * 있지만, 그건 Header까지 통째로 날아갑니다.
         */}
        <ErrorBoundary resetKey={`${location.pathname}${location.search}`}>
          <Suspense fallback={<RouteContentSpinner />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
};

export default ProtectedLayout;
