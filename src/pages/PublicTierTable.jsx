import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Starfield from '../components/background/Starfield';
import Tag from '../components/common/Tag';
import ErrorView from '../components/common/ErrorView';
import { FullPageSpinner } from '../components/common/Spinner';
import TierRows from '../components/tier-table/TierRows';
import TierLegend from '../components/tier-table/TierLegend';
import { tierShareApi } from '../api/tierShares';
import { toAppError } from '../utils/httpError';
import {
  calculateTierProgress,
  createLatestRequestGuard,
  publicTierItemsToRows,
  scopeFromSearchParams,
  scopeToSearchParams,
} from '../utils/tierShare';

const LEVELS = [10, 11, 12];

const PublicTierTable = () => {
  const { shareId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = useMemo(() => scopeFromSearchParams(searchParams), [searchParams]);
  const canonicalSearch = scopeToSearchParams(scope).toString();
  const requestKey = `${shareId ?? ''}:${scope.level}:${scope.playStyle}`;
  const [requestGuard] = useState(() => createLatestRequestGuard());
  const [state, setState] = useState({ requestKey: null, data: null, error: null });

  useEffect(() => {
    if (searchParams.toString() !== canonicalSearch) {
      setSearchParams(canonicalSearch, { replace: true });
    }
  }, [canonicalSearch, searchParams, setSearchParams]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = requestGuard.next();

    tierShareApi.getPublicTierTable(shareId, scope.level, scope.playStyle, controller.signal)
      .then((data) => {
        if (!requestGuard.isCurrent(requestId)) return;
        setState({ requestKey, data, error: null });
      })
      .catch((error) => {
        if (controller.signal.aborted || !requestGuard.isCurrent(requestId)) return;
        setState({
          requestKey,
          data: null,
          error: toAppError(error, { fallback: '공유 서열표를 불러오지 못했습니다.' }),
        });
      });

    return () => controller.abort();
  }, [requestGuard, requestKey, scope.level, scope.playStyle, shareId]);

  const isLoading = state.requestKey !== requestKey;
  const data = isLoading ? null : state.data;
  const error = isLoading ? null : state.error;

  const tiers = useMemo(
    () => publicTierItemsToRows(data?.tierItems ?? []),
    [data]
  );
  const progress = useMemo(() => calculateTierProgress(tiers), [tiers]);

  const updateScope = (patch) => {
    setSearchParams(scopeToSearchParams({ ...scope, ...patch }), { replace: true });
  };

  return (
    <div className="relative min-h-screen">
      <Starfield litRatio={progress.total > 0 ? progress.cleared / progress.total : 0.5} />
      <main className="relative z-[1] mx-auto min-h-screen max-w-[1440px] px-5 py-8 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
          <div>
            <Link className="font-mono text-[9px] uppercase tracking-[.24em] text-label" to="/">
              iidx score board · shared tier table
            </Link>
            <h1 className="mt-2 font-num text-[24px] font-semibold text-ink">
              {data?.ownerUsername ?? '—'} · {'☆'}{scope.level} {scope.playStyle}
              {!isLoading && !error && (
                <span className="ml-2 text-accent">{progress.percent}%</span>
              )}
            </h1>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex gap-[5px]">
              {['SP', 'DP'].map((playStyle) => (
                <Tag
                  key={playStyle}
                  active={scope.playStyle === playStyle}
                  onClick={() => updateScope({ playStyle })}
                >
                  {playStyle}
                </Tag>
              ))}
            </div>
            <div className="flex gap-[5px]">
              {LEVELS.map((level) => (
                <Tag key={level} active={scope.level === level} onClick={() => updateScope({ level })}>
                  {'☆'}{level}
                </Tag>
              ))}
            </div>
            <div className="flex gap-[5px]">
              <Tag active={scope.mode === 'chips'} onClick={() => updateScope({ mode: 'chips' })}>칩</Tag>
              <Tag active={scope.mode === 'dense'} onClick={() => updateScope({ mode: 'dense' })}>조밀</Tag>
            </div>
          </div>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-24"><FullPageSpinner /></div>
        ) : error ? (
          <div className="py-12">
            <ErrorView status={error.status} message={error.message} variant="page" />
          </div>
        ) : tiers.length > 0 ? (
          <>
            <div className="mt-4 flex justify-end font-num tnum text-[12px] text-muted">
              {progress.cleared} / {progress.total}
            </div>
            <TierRows tiers={tiers} dense={scope.mode === 'dense'} readOnly />
            <TierLegend className="mt-6" />
          </>
        ) : (
          <div className="mt-10 border border-line bg-surface py-24 text-center text-muted">
            이 범위에는 공개할 서열표 데이터가 없습니다.
          </div>
        )}
      </main>
    </div>
  );
};

export default PublicTierTable;
