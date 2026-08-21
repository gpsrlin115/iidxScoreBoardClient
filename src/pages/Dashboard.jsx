import { useScopeStore } from '../store/scopeStore';
import useDashboard from '../hooks/useDashboard';
import { FullPageSpinner } from '../components/common/Spinner';
import ErrorView from '../components/common/ErrorView';
import TierProgressList from '../components/dashboard/TierProgressList';
import DistributionBar from '../components/dashboard/DistributionBar';
import TopScoreList from '../components/dashboard/TopScoreList';

// Stat strip items, in display order. `color` is omitted for `total` so it
// falls back to the `text-ink` token class; the other four are exact hex
// values fixed by the design spec (fullCombo/exHard/hard/clear match the
// DIST_GROUPS palette in utils/clearTypes.js).
const STAT_ITEMS = [
  { key: 'total', label: 'play count' },
  { key: 'fullCombo', label: 'full combo', color: '#f871a0' },
  { key: 'exHard', label: 'ex hard', color: '#ffc107' },
  { key: 'hard', label: 'hard', color: '#ffffff' },
  { key: 'clear', label: 'clear', color: '#4c9aff' },
];

const Dashboard = () => {
  const level = useScopeStore((state) => state.level);
  const playStyle = useScopeStore((state) => state.playStyle);
  const { stats, distribution, tierRows, tierTotals, topScores, isLoading, error, refetch } =
    useDashboard();

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <FullPageSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorView
        status={error.status}
        message={error.message}
        variant="page"
        onRetry={error.retryable ? refetch : undefined}
      />
    );
  }

  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(122px,1fr))] border-b border-line">
        {STAT_ITEMS.map((item) => (
          <div key={item.key} className="border-l border-line-weak px-4 py-[17px]">
            <p className="mb-[6px] font-mono text-[8.5px] uppercase tracking-[.2em] text-label">
              {item.label}
            </p>
            <p
              className={`font-num tnum text-[27px] font-medium leading-none${
                item.color ? '' : ' text-ink'
              }`}
              style={item.color ? { color: item.color } : undefined}
            >
              {stats[item.key].toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_300px] max-md:grid-cols-1">
        <div className="min-w-0 px-[30px] pt-[34px]">
          <div className="flex flex-wrap items-start gap-[30px]">
            <p className="font-num text-[124px] font-medium leading-[.82] tracking-[-.045em] tnum max-md:text-[68px]">
              {tierTotals.pct}
              <span className="ml-[2px] text-[42px] font-normal text-accent">%</span>
            </p>
            <div className="pt-3">
              <p className="font-num text-[16px] tnum">
                <span className="text-ink">{tierTotals.cleared}</span>
                <span className="text-muted"> / {tierTotals.total}</span>
              </p>
              <p className="font-mono text-[9.5px] uppercase tracking-[.22em] text-label">
                cleared · ☆{level} {playStyle}
              </p>
            </div>
          </div>
          <p className="mt-5 max-w-[520px] text-sm text-muted">
            {'☆'}
            {level} {playStyle} 서열표 {tierRows.length}단, 총 {tierTotals.total}곡 기준.
          </p>

          <TierProgressList tierRows={tierRows} />
          <DistributionBar distribution={distribution} />
        </div>

        <aside className="min-w-0 border-l border-line px-[22px] pt-[34px] max-md:border-l-0 max-md:border-t">
          <TopScoreList topScores={topScores} />
        </aside>
      </div>
    </div>
  );
};

export default Dashboard;
