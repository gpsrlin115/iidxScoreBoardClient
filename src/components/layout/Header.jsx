import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { FiMusic, FiHome, FiList, FiUpload, FiUser, FiLogOut, FiMenu, FiX } from 'react-icons/fi';
import { RiTableLine } from 'react-icons/ri';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { useAuthStore } from '../../store/authStore';
import { authApi } from '../../api/auth';

/**
 * 🎓 학습 포인트: useLocation이란?
 *
 * React Router가 제공하는 Hook입니다.
 * 현재 URL 경로를 알 수 있습니다.
 * → 현재 페이지에 해당하는 네비게이션 링크를 "활성화(active)" 표시합니다.
 *
 * 예시: pathname이 '/scores'이면 스코어 메뉴를 파란색으로 강조합니다.
 */

const NAV_ITEMS = [
  { to: '/',           label: '대시보드',  Icon: FiHome },
  { to: '/scores',     label: '스코어',    Icon: FiList },
  { to: '/tier-table/12', label: '서열표', Icon: RiTableLine },
  { to: '/import/csv', label: '가져오기',  Icon: FiUpload },
];

const Header = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  /**
   * 🎓 모바일 메뉴 상태
   * isMenuOpen: 햄버거 버튼 클릭 시 모바일 메뉴를 토글합니다.
   * 작은 화면에서만 보이고, 데스크탑에서는 숨깁니다 (Tailwind `md:hidden`).
   */
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await authApi.logout();
      logout();                  // Store에서 user 제거
      toast.success('로그아웃 되었습니다.');
      navigate('/login');
    } catch {
      // 네트워크 오류라도 클라이언트 상태는 초기화
      logout();
      navigate('/login');
    }
  };

  /**
   * 🎓 isActive 함수: 현재 경로와 메뉴 경로를 비교
   *
   * '/' (대시보드)는 정확히 일치할 때만 활성화 (다른 경로도 '/'로 시작하기 때문)
   * 나머지는 해당 경로로 시작하면 활성화 (예: /scores, /scores?level=12 모두 포함)
   */
  const isActive = (to) =>
    to === '/' ? pathname === '/' : pathname.startsWith(to);

  return (
    <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">

        {/* 로고 */}
        <Link to="/" className="flex items-center gap-2 text-white font-bold text-lg hover:text-primary-500 transition">
          <FiMusic className="text-primary-500" />
          IIDX ScoreBoard
        </Link>

        {/* 데스크탑 네비게이션 */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition',
                isActive(to)
                  ? 'bg-primary-500/20 text-primary-400'   // 활성화: 파란 배경 + 파란 텍스트
                  : 'text-slate-400 hover:text-white hover:bg-slate-800' // 비활성화
              )}
            >
              <Icon className="text-base" />
              {label}
            </Link>
          ))}
        </nav>

        {/* 우측: 사용자 정보 + 로그아웃 */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            to="/profile"
            className="flex items-center gap-2 text-slate-400 hover:text-white transition"
          >
            <FiUser />
            <span className="text-sm">{user?.username}</span>
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-red-400 transition px-2 py-1.5 rounded-lg hover:bg-slate-800"
          >
            <FiLogOut />
            로그아웃
          </button>
        </div>

        {/* 모바일 햄버거 버튼 */}
        <button
          className="md:hidden text-slate-400 hover:text-white p-2"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          aria-label="메뉴 토글"
        >
          {isMenuOpen ? <FiX size={22} /> : <FiMenu size={22} />}
        </button>
      </div>

      {/**
       * 🎓 모바일 드롭다운 메뉴
       * isMenuOpen이 true일 때만 렌더링됩니다 (조건부 렌더링).
       * `&&` 연산자를 사용하면 앞이 true일 때만 뒤를 렌더링합니다.
       */}
      {isMenuOpen && (
        <div className="md:hidden border-t border-slate-800 bg-slate-900 px-4 pb-4">
          <nav className="flex flex-col gap-1 pt-2">
            {NAV_ITEMS.map(({ to, label, Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setIsMenuOpen(false)}
                className={clsx(
                  'flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition',
                  isActive(to)
                    ? 'bg-primary-500/20 text-primary-400'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                )}
              >
                <Icon />
                {label}
              </Link>
            ))}
            <hr className="border-slate-800 my-2" />
            <Link
              to="/profile"
              onClick={() => setIsMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <FiUser /> {user?.username}
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-slate-800 text-left"
            >
              <FiLogOut /> 로그아웃
            </button>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;
