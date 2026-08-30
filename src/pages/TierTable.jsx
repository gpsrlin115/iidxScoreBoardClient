import { useEffect, useRef, useState } from 'react';
import { toBlob } from 'html-to-image';
import toast from 'react-hot-toast';
import { useScopeStore } from '../store/scopeStore';
import { useAuthStore } from '../store/authStore';
import useTierStore from '../store/tierStore';
import TierRows from '../components/tier-table/TierRows';
import TierLegend from '../components/tier-table/TierLegend';
import TierShareActions from '../components/tier-table/TierShareActions';
import TierShareCard from '../components/tier-table/TierShareCard';
import { FullPageSpinner } from '../components/common/Spinner';
import ErrorView from '../components/common/ErrorView';
import Tag from '../components/common/Tag';
import { isClearTypeCleared } from '../utils/clearTypes';
import { buildTierImageFilename } from '../utils/tierShare';

const TierTable = () => {
  const level = useScopeStore((state) => state.level);
  const playStyle = useScopeStore((state) => state.playStyle);
  const username = useAuthStore((state) => state.user?.username ?? 'user');
  const { enrichedTierData, viewMode, isLoading, error, setViewMode, fetchTierData } =
    useTierStore();
  const exportRef = useRef(null);
  const [capture, setCapture] = useState(null);

  useEffect(() => {
    fetchTierData(level, playStyle);
  }, [level, playStyle, fetchTierData]);

  useEffect(() => {
    if (!capture || !exportRef.current) return undefined;
    let cancelled = false;

    const runCapture = async () => {
      try {
        await document.fonts?.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (cancelled || !exportRef.current) return;

        const node = exportRef.current;
        const blob = await toBlob(node, {
          backgroundColor: '#050813',
          pixelRatio: 1,
          skipFonts: true,
          width: node.scrollWidth,
          height: node.scrollHeight,
        });
        if (!blob) throw new Error('PNG blob was empty');

        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = buildTierImageFilename(capture.username, capture, capture.generatedAt);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        toast.success('서열표 PNG를 저장했습니다.');
      } catch (error) {
        console.error('Failed to export tier table PNG', error);
        toast.error('서열표 PNG를 만들지 못했습니다.');
      } finally {
        if (!cancelled) setCapture(null);
      }
    };

    runCapture();
    return () => {
      cancelled = true;
    };
  }, [capture]);

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

        <div className="flex flex-wrap gap-[5px]">
          <Tag active={viewMode === 'chips'} onClick={() => setViewMode('chips')}>
            칩
          </Tag>
          <Tag active={viewMode === 'dense'} onClick={() => setViewMode('dense')}>
            조밀
          </Tag>
          <TierShareActions
            level={level}
            playStyle={playStyle}
            mode={viewMode}
            disabled={isLoading || Boolean(error) || enrichedTierData.length === 0}
            downloading={Boolean(capture)}
            onDownload={() => setCapture({
              generatedAt: new Date(),
              username,
              level,
              playStyle,
              mode: viewMode,
              tiers: enrichedTierData,
            })}
          />
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

          <TierLegend className="mt-6" />
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

      {capture && (
        <div
          ref={exportRef}
          aria-hidden="true"
          inert
          style={{ position: 'fixed', left: -10000, top: 0, width: 1280, zIndex: -1 }}
        >
          <TierShareCard
            username={capture.username}
            level={capture.level}
            playStyle={capture.playStyle}
            mode={capture.mode}
            tiers={capture.tiers}
            generatedAt={capture.generatedAt}
          />
        </div>
      )}
    </div>
  );
};

export default TierTable;
