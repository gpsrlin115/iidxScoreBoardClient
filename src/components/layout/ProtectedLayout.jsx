import { Suspense, useEffect, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { RouteContentSpinner } from '../common/Spinner';
import ErrorBoundary from '../common/ErrorBoundary';
import Starfield from '../background/Starfield';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import useTierStore from '../../store/tierStore';
import { isClearTypeCleared } from '../../utils/clearTypes';

/**
 * App shell for every authenticated route: night-sky background, the
 * left sidebar nav, the top bar, and the routed page in <main>.
 *
 * ErrorBoundary + Suspense stay inside <main> (not wrapping the whole
 * shell) so a page-level render error still leaves the sidebar usable —
 * the user can navigate away instead of losing the whole app.
 */
const ProtectedLayout = () => {
  const location = useLocation();
  const enrichedTierData = useTierStore((state) => state.enrichedTierData);

  // Share of songs currently cleared, used to light up the background
  // starfield. Reads whatever tierStore already has — this layout never
  // triggers the fetch itself, that's each page's own responsibility.
  // React Router keeps the scroll position across navigations, so arriving at a
  // new page from halfway down a long list would drop you mid-page. Reset here
  // rather than in Sidebar so it also covers in-page links (a dashboard tier row
  // opening the tier table, pagination jumps) and not just the nav.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const litRatio = useMemo(() => {
    if (!enrichedTierData || enrichedTierData.length === 0) return 0.5;

    let total = 0;
    let cleared = 0;
    enrichedTierData.forEach((tierGroup) => {
      tierGroup.songs.forEach((song) => {
        total += 1;
        if (isClearTypeCleared(song.clearType)) cleared += 1;
      });
    });

    return total > 0 ? cleared / total : 0.5;
  }, [enrichedTierData]);

  return (
    <div className="relative min-h-screen">
      <Starfield litRatio={litRatio} flareable />
      <div className="relative z-[1] grid min-h-screen grid-cols-[186px_minmax(0,1fr)] max-md:grid-cols-1">
        <Sidebar />
        <div
          className="min-h-screen min-w-0"
          style={{ background: 'rgba(5,8,19,.65)' }}
        >
          <TopBar />
          <main>
            <ErrorBoundary resetKey={`${location.pathname}${location.search}`}>
              <Suspense fallback={<RouteContentSpinner />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  );
};

export default ProtectedLayout;
