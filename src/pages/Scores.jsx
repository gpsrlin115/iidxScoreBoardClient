import { useEffect, useMemo } from 'react';
import { useScoresStore } from '../store/scoresStore';
import useScores from '../hooks/useScores';
import useTierStore from '../store/tierStore';
import Tag from '../components/common/Tag';
import ScoreCard from '../components/scores/ScoreCard';
import ScorePagination from '../components/scores/ScorePagination';
import { FullPageSpinner } from '../components/common/Spinner';
import ErrorView from '../components/common/ErrorView';
import { CLEAR_ORDER, CLEAR_TYPE_LABELS } from '../utils/clearTypes';

const CHART_FILTERS = [
  { value: '', label: '전체' },
  { value: 'ANOTHER', label: 'ANOTHER' },
  { value: 'LEGGENDARIA', label: 'LEGGENDARIA' },
  { value: 'HYPER', label: 'HYPER' },
];

const CLEAR_FILTERS = [
  { value: '', label: '전체' },
  ...CLEAR_ORDER.map((key) => ({ value: key, label: CLEAR_TYPE_LABELS[key] })),
];

const SORTS = [
  { value: 'ex', label: 'EX' },
  { value: 'clear', label: '클리어' },
  { value: 'date', label: '최근' },
];

const LEVELS = Array.from({ length: 12 }, (_, i) => i + 1);

const FILTER_GROUP_CLASS = 'flex items-center gap-[5px]';

/**
 * Builds a `title|chartType -> tier` lookup from tierStore's
 * enrichedTierData. The key shape mirrors tierStore's private
 * buildScoreKey (JSON.stringify([title, difficulty]) — confirmed by
 * reading fetchTierData in store/tierStore.js) exactly, since that helper
 * isn't exported. Song-title matching is exact-match only project-wide
 * (see memory note on normalizeTitleKey being an intentionally removed
 * dead export) — no fuzzy matching is introduced here.
 */
const buildTierMap = (enrichedTierData) => {
  const map = new Map();
  enrichedTierData.forEach(({ tier, songs }) => {
    songs.forEach((song) => {
      map.set(JSON.stringify([song.title ?? null, song.difficulty ?? null]), tier);
    });
  });
  return map;
};

const Scores = () => {
  const level = useScoresStore((state) => state.level);
  const chart = useScoresStore((state) => state.chart);
  const clear = useScoresStore((state) => state.clear);
  const q = useScoresStore((state) => state.q);
  const sort = useScoresStore((state) => state.sort);
  const setFilter = useScoresStore((state) => state.setFilter);
  const setSort = useScoresStore((state) => state.setSort);
  const setPage = useScoresStore((state) => state.setPage);

  const {
    scores,
    totalElements,
    totalPages,
    currentPage,
    isLoading,
    error,
    truncated,
    refetch,
    effectiveLevel,
    playStyle,
  } = useScores();

  const enrichedTierData = useTierStore((state) => state.enrichedTierData);
  const tierMap = useMemo(() => buildTierMap(enrichedTierData), [enrichedTierData]);

  // The TIER tags read tierStore, so this screen has to load it too — landing
  // here directly (bookmark, refresh) never passes through the dashboard or the
  // tier table, which are the only other callers. The store's fetchedKey memo
  // makes this a no-op when one of them already loaded the same scope.
  // Skipped for the "all levels" override, which has no single level to fetch.
  useEffect(() => {
    if (typeof effectiveLevel !== 'number') return;
    useTierStore.getState().fetchTierData(effectiveLevel, playStyle);
  }, [effectiveLevel, playStyle]);

  return (
    <section className="px-[30px] pt-[26px] pb-[70px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[21px] font-normal text-ink">스코어 목록</h1>
          <p className="mt-1 font-num tnum text-[13px] text-muted">
            총 {totalElements.toLocaleString()}개 · {currentPage + 1} / {totalPages} 페이지
          </p>
        </div>
        <label className="flex items-center gap-[6px] border-b border-line-strong pb-[5px] focus-within:border-accent">
          <span className="font-mono text-[9px] uppercase tracking-[.1em] text-label">search</span>
          <input
            type="text"
            value={q}
            onChange={(e) => setFilter({ q: e.target.value })}
            placeholder="곡 제목 · 아티스트"
            className="w-[190px] border-0 bg-transparent text-[13px] text-ink placeholder:text-faint2 focus:outline-none"
          />
        </label>
      </div>

      <div className="my-5 flex flex-wrap items-center gap-[18px] border-y border-line py-[13px]">
        <div className={FILTER_GROUP_CLASS}>
          <Tag active={level === null} onClick={() => setFilter({ level: null })}>
            scope 따름
          </Tag>
          <Tag active={level === ''} onClick={() => setFilter({ level: '' })}>
            전체
          </Tag>
          <select
            aria-label="레벨 직접 선택"
            value={typeof level === 'number' ? String(level) : ''}
            onChange={(e) => setFilter({ level: Number(e.target.value) })}
            className="border border-line bg-night px-2 py-[3px] font-mono text-[10px] uppercase tracking-[.1em] text-ink"
          >
            <option value="" disabled>
              ☆ 직접 선택
            </option>
            {LEVELS.map((lv) => (
              <option key={lv} value={lv}>
                ☆{lv}
              </option>
            ))}
          </select>
        </div>

        <div className={FILTER_GROUP_CLASS}>
          {CHART_FILTERS.map((opt) => (
            <Tag key={opt.value} active={chart === opt.value} onClick={() => setFilter({ chart: opt.value })}>
              {opt.label}
            </Tag>
          ))}
        </div>

        <div className={FILTER_GROUP_CLASS}>
          {CLEAR_FILTERS.map((opt) => (
            <Tag key={opt.value} active={clear === opt.value} onClick={() => setFilter({ clear: opt.value })}>
              {opt.label}
            </Tag>
          ))}
        </div>

        <div className={`${FILTER_GROUP_CLASS} ml-auto`}>
          {SORTS.map((opt) => (
            <Tag key={opt.value} active={sort === opt.value} onClick={() => setSort(opt.value)}>
              {opt.label}
            </Tag>
          ))}
        </div>
      </div>

      {truncated && (
        <p className="mb-4 font-mono text-[10px] text-danger">
          이 scope의 스코어가 1,000건을 초과해 일부만 표시됩니다.
        </p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <FullPageSpinner />
        </div>
      ) : error ? (
        <ErrorView
          status={error.status}
          message={error.message}
          variant="page"
          onRetry={error.retryable ? refetch : undefined}
        />
      ) : scores.length === 0 ? (
        <p className="py-20 text-center text-sm text-muted">조건에 맞는 스코어가 없습니다.</p>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(316px,1fr))] gap-3">
            {scores.map((score) => (
              <ScoreCard
                key={score.id}
                score={score}
                tier={tierMap.get(JSON.stringify([score.song?.title ?? null, score.chart?.chartType ?? null]))}
              />
            ))}
          </div>

          <ScorePagination
            totalPages={totalPages}
            currentPage={currentPage}
            onPageChange={setPage}
          />
        </>
      )}
    </section>
  );
};

export default Scores;
