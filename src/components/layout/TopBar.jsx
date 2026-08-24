import { useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { useScopeStore } from '../../store/scopeStore';
import Tag from '../common/Tag';

const LEVELS = [10, 11, 12];

// Screens whose scope (level + play style) actually drives what's on
// screen. Import/profile/admin ignore the global scope, so the level
// toggle and the trailing " · level style" suffix are both hidden there.
const SCOPED_LABELS = new Set(['dashboard', 'scores', 'tier table']);

const routeLabel = (pathname) => {
  if (pathname === '/') return 'dashboard';
  if (pathname.startsWith('/scores')) return 'scores';
  if (pathname.startsWith('/tier-table')) return 'tier table';
  if (pathname.startsWith('/import')) return 'import';
  if (pathname.startsWith('/layout-analysis')) return 'layout analysis';
  if (pathname.startsWith('/profile')) return 'profile';
  if (pathname.startsWith('/admin')) return 'admin';
  return '';
};

/**
 * Sticky top bar: current route label (with scope suffix on scoped
 * screens) on the left, global level toggle on the right.
 *
 * `h-16` (64px) is a fixed contract, not a stylistic choice: the tier
 * table's left column pins itself with `sticky top-16` so it settles
 * directly under this bar. Changing this height without updating that
 * sticky offset will reopen a gap (or overlap) there.
 */
const TopBar = () => {
  const { pathname } = useLocation();
  const level = useScopeStore((state) => state.level);
  const playStyle = useScopeStore((state) => state.playStyle);
  const setLevel = useScopeStore((state) => state.setLevel);

  const label = routeLabel(pathname);
  const showScopeSuffix = SCOPED_LABELS.has(label);
  const showLevelToggle = showScopeSuffix;

  return (
    <div
      className={clsx(
        'sticky top-0 z-[4] flex h-16 items-center justify-between gap-4',
        'border-b border-line px-[30px]',
        'bg-[rgba(5,8,19,.9)] backdrop-blur-[14px]'
      )}
    >
      <span className="font-mono text-[9.5px] uppercase tracking-[.24em] text-label">
        {label}
        {showScopeSuffix && ` · ☆${level} ${playStyle}`}
      </span>

      {showLevelToggle && (
        <div className="flex items-center gap-[8px]">
          <span className="font-mono text-[8.5px] uppercase tracking-[.2em] text-label">
            level
          </span>
          <div className="flex gap-[5px]">
            {LEVELS.map((lv) => (
              <Tag key={lv} active={level === lv} onClick={() => setLevel(lv)}>
                {'☆'}
                {lv}
              </Tag>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TopBar;
