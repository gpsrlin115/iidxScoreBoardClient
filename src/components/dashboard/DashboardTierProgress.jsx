import ErrorView from '../common/ErrorView';
import TierProgressList from './TierProgressList';

const DashboardTierProgress = ({
  level, playStyle, tierRows, tierTotals, ready, loading, error, onRetry,
}) => (
  <>
    {loading && <p role="status" className="text-sm text-muted">서열표를 불러오는 중입니다.</p>}
    {error && (
      <ErrorView
        status={error.status}
        message={error.message}
        variant="inline"
        showHomeLink={false}
        onRetry={error.retryable && !loading ? onRetry : undefined}
      />
    )}
    {ready && (
      <>
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
      </>
    )}
  </>
);

export default DashboardTierProgress;
