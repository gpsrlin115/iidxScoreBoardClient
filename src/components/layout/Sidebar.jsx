import { Link, NavLink, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { useAuthStore } from '../../store/authStore';
import { useScopeStore } from '../../store/scopeStore';
import { authApi } from '../../api/auth';
import Tag from '../common/Tag';
import { ENABLE_LAYOUT_ANALYSIS } from '../../config/features';

const NAV_ITEMS = [
  { to: '/', label: '대시보드', end: true },
  { to: '/scores', label: '스코어' },
  { to: '/tier-table', label: '서열표' },
  { to: '/import/csv', label: '가져오기' },
  ...(ENABLE_LAYOUT_ANALYSIS ? [{ to: '/layout-analysis', label: '배치 분석' }] : []),
];

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/**
 * Left-hand fixed nav: logo, primary routes, global SP/DP switch, and the
 * user/session footer. Replaces the old top Header — every action that
 * used to live there (nav, style toggle, profile/admin links, logout) is
 * reproduced here, not layered on top of it.
 */
const Sidebar = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const playStyle = useScopeStore((state) => state.playStyle);
  const setPlayStyle = useScopeStore((state) => state.setPlayStyle);
  const isAdmin = user?.role?.toUpperCase() === 'ADMIN';

  const handleLogout = async () => {
    try {
      await authApi.logout();
      logout();
      toast.success('로그아웃 되었습니다.');
      navigate('/login');
    } catch {
      // Server session may already be gone (network error, expired cookie);
      // clear local state and leave anyway so the user isn't stuck.
      logout();
      navigate('/login');
    }
  };

  return (
    <aside
      className={clsx(
        'sticky top-0 h-screen self-start border-r border-line px-[18px] py-[22px]',
        'flex flex-col gap-8',
        'max-md:static max-md:h-auto max-md:flex-row max-md:items-center',
        'max-md:flex-wrap max-md:gap-4 max-md:border-r-0 max-md:border-b'
      )}
    >
      <Link to="/" className={clsx('flex items-center gap-2', FOCUS_RING)}>
        <img src="/favicon.png" alt="IIDX ScoreBoard 로고" className="h-[19px] w-[19px]" />
        <span className="font-mono text-[10px] uppercase tracking-[.15em] text-ink leading-tight">
          IIDX
          <br />
          ScoreBoard
        </span>
      </Link>

      <nav className={clsx('flex flex-col gap-[2px]', 'max-md:flex-row')}>
        {NAV_ITEMS.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              clsx(
                'text-[13px] px-[9px] py-[6px] transition-colors duration-200',
                // The active rail sits flush with the sidebar's left padding
                // edge while the label keeps the same reading position as
                // the inactive state — the negative margin offsets exactly
                // the padding it is nested inside. Do not remove.
                '-ml-[9px] border-l-2',
                FOCUS_RING,
                isActive
                  ? 'border-accent bg-[rgba(231,155,187,.07)] text-ink'
                  : 'border-transparent text-muted hover:text-ink'
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-[6px]">
        <span className="font-mono text-[8.5px] uppercase tracking-[.2em] text-label">
          style
        </span>
        <div className="flex gap-[5px]">
          <Tag active={playStyle === 'SP'} onClick={() => setPlayStyle('SP')}>
            SP
          </Tag>
          <Tag active={playStyle === 'DP'} onClick={() => setPlayStyle('DP')}>
            DP
          </Tag>
        </div>
      </div>

      <div
        className={clsx(
          'mt-auto flex flex-col gap-[3px]',
          'font-mono text-[8.5px] uppercase tracking-[.14em]',
          'max-md:mt-0 max-md:ml-auto'
        )}
      >
        {user?.username && <span className="text-muted">DJ {user.username}</span>}
        <Link to="/profile" className={clsx('text-faint2 hover:text-accent', FOCUS_RING)}>
          profile
        </Link>
        {isAdmin && (
          <Link
            to="/admin/tier-table"
            className={clsx('text-faint2 hover:text-accent', FOCUS_RING)}
          >
            admin
          </Link>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className={clsx('text-left text-faint2 hover:text-accent', FOCUS_RING)}
        >
          logout
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
