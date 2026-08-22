import { useEffect } from 'react';
import { useScopeStore } from '../store/scopeStore';
import useTierStore from '../store/tierStore';
import TierRows from '../components/tier-table/TierRows';
import { FullPageSpinner } from '../components/common/Spinner';
import ErrorView from '../components/common/ErrorView';
import Tag from '../components/common/Tag';
import { CLEAR_ORDER, CLEAR_PALETTE, CLEAR_TYPE_LABELS, isClearTypeCleared } from '../utils/clearTypes';

const TierTable = () => {
  const level = useScopeStore((state) => state.level);
  const playStyle = useScopeStore((state) => state.playStyle);
  const { enrichedTierData, viewMode, isLoading, error, setViewMode, fetchTierData } =
    useTierStore();

  useEffect(() => {
    fetchTierData(level, playStyle);
  }, [level, playStyle, fetchTierData]);

  const totalSongs = enrichedTierData.reduce((acc, tierObj) => acc + tierObj.songs.length, 0);
  const clearedSongs = enrichedTierData.reduce(
    (acc, tierObj) => acc + tierObj.songs.filter((s) => isClearTypeCleared(s.clearType)).length,
    0
  );
  const pct = totalSongs > 0 ? Math.round((clearedSongs / totalSongs) * 100) : 0;

  return (
    <div className="px-[30px] pt-[26px] pb-[84px]">
      <div className="flex flex-wrap items-center gap-4 border-b border-line pb-4">
        <h1 className="font-num text-[22px] font-medium tracking-[-.015em] text-ink">
          {'☆'}
          {level} {playStyle} <span className="text-accent">{pct}%</span>
        </h1>

        <span className="relative h-[2px] min-w-[120px] flex-1 bg-[rgba(236,234,244,.09)]">
          <span
            className="absolute left-0 top-0 h-[2px] bg-accent"
            style={{ width: `${pct}%`, boxShadow: '0 0 10px rgba(231,155,187,.7)' }}
          />
        </span>

        <span className="font-num tnum text-[13px]">
          <span className="text-ink">{clearedSongs}</span>
          <span className="text-muted"> / {totalSongs}</span>
        </span>

        <div className="flex gap-[5px]">
          <Tag active={viewMode === 'chips'} onClick={() => setViewMode('chips')}>
            칩
          </Tag>
          <Tag active={viewMode === 'dense'} onClick={() => setViewMode('dense')}>
            조밀
          </Tag>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <FullPageSpinner />
        </div>
      ) : error ? (
        <ErrorView
          status={error.status}
          message={error.message}
          variant="page"
          onRetry={
            error.retryable ? () => fetchTierData(level, playStyle, { force: true }) : undefined
          }
        />
      ) : enrichedTierData.length > 0 ? (
        <>
          <TierRows tiers={enrichedTierData} dense={viewMode === 'dense'} />

          <div className="mt-6 flex flex-wrap items-center gap-x-[18px] gap-y-[10px] border-t border-line pt-4">
            <span className="font-mono text-[9px] uppercase tracking-[.2em] text-dim">
              legend
            </span>
            {CLEAR_ORDER.map((key) => (
              <span key={key} className="flex items-center gap-[6px]">
                <span
                  className="inline-block h-[9px] w-[9px]"
                  style={{
                    background: CLEAR_PALETTE[key].solid,
                    border: `1px solid ${CLEAR_PALETTE[key].bd}`,
                    borderRadius: '2px',
                  }}
                />
                <span className="font-mono text-[9.5px] text-text3">
                  {CLEAR_TYPE_LABELS[key]}
                </span>
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[4px] border border-line bg-surface py-24 text-center">
          <div className="text-5xl opacity-20">🫙</div>
          <h3 className="text-xl font-medium text-ink">No Data Available</h3>
          <p className="max-w-sm text-sm text-muted">
            There is currently no predefined tier data for Level {level} {playStyle}.
          </p>
        </div>
      )}
    </div>
  );
};

export default TierTable;
