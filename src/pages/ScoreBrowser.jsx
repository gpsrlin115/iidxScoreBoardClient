import { useId, useState } from 'react';
import useScores from '../hooks/useScores';
import useScoreTiers from '../hooks/useScoreTiers';
import { useScoresStore } from '../store/scoresStore';
import { useAuthStore } from '../store/authStore';
import { useScopeStore } from '../store/scopeStore';
import { SCORE_BROWSER_MOCK } from '../constants/scoreBrowser';
import ScoreFilters from '../components/scores/ScoreFilters';
import ScoreCard from '../components/scores/ScoreCard';
import ScoreLoadMore from '../components/scores/ScoreLoadMore';
import SongScoreDialog from '../components/tier-table/SongScoreDialog';
import { toScoreDialogSong, getScoreDialogDifficultyLabel } from '../utils/scoreDialog';
import { FullPageSpinner } from '../components/common/Spinner';
import ErrorView from '../components/common/ErrorView';

export default function ScoreBrowser() {
  const userId = useAuthStore((state) => state.user?.id);
  const playStyle = useScopeStore((state) => state.playStyle);
  // A remount invalidates selection and in-flight work, including round trips.
  return <ScoreBrowserContent key={`${userId}:${playStyle}`} />;
}

function ScoreBrowserContent() {
  const filters = useScoresStore();
  const data = useScores();
  const getTier = useScoreTiers(data.scores, data.playStyle);
  const [selected, setSelected] = useState(null);
  const userId = useAuthStore((state) => state.user?.id);
  const selectedScore = selected?.userId === userId && selected?.playStyle === data.playStyle ? selected.score : null;
  const dialogId = useId();

  return (
    <section className="px-[30px] pt-[26px] pb-[70px] max-md:px-4">
      {SCORE_BROWSER_MOCK && <p role="status" className="mb-4 border border-amber-400 p-3 text-sm text-amber-200">스코어 검증용 모의 데이터 · 실제 계정 기록이 아닙니다.</p>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[21px] font-normal text-ink">스코어 목록</h1>
          <p className="mt-1 text-[13px] text-muted" aria-live="polite">
            총 <span className="font-num tnum">{data.totalElements.toLocaleString()}</span>개 · <span className="font-num tnum">{data.scores.length.toLocaleString()}</span>개 표시 중
          </p>
        </div>
        <label className="flex min-w-0 flex-1 items-center gap-2 border-b border-line-strong pb-1 sm:flex-none">
          <span className="shrink-0 text-xs text-muted">검색</span>
          <input aria-label="곡 제목·아티스트 검색" type="search" value={filters.q}
            onChange={(event) => filters.setFilter({ q: event.target.value })}
            placeholder="곡 제목 · 아티스트" className="w-full min-w-0 bg-transparent text-[13px] text-ink focus:outline-none sm:w-[190px]" />
        </label>
      </div>
      <ScoreFilters filters={filters} setFilter={filters.setFilter} setSort={filters.setSort}
        seriesOptions={data.seriesOptions} seriesLoading={data.seriesLoading}
        seriesError={data.seriesError} refetchSeries={data.refetchSeries} />
      {data.isLoading ? <div className="flex justify-center py-20"><FullPageSpinner /></div>
        : data.error ? <ErrorView status={data.error.status} message={data.error.message} variant="page"
          onRetry={data.error.retryable ? data.refetch : undefined} />
          : data.scores.length === 0 ? <p className="py-20 text-center text-sm text-muted">조건에 맞는 스코어가 없습니다.</p>
            : <>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(316px,1fr))] gap-3 max-md:grid-cols-1">
                {data.scores.map((score) => <ScoreCard key={score.id} score={score} tier={getTier(score)}
                  onClick={() => setSelected({ score, userId, playStyle: data.playStyle })} aria-haspopup="dialog" aria-expanded={selectedScore?.id === score.id}
                  aria-controls={selectedScore?.id === score.id ? dialogId : undefined}
                  aria-label={`${score.song?.title} ${score.chart?.playStyle} ${score.chart?.chartType} 상세 점수 보기`} />)}
              </div>
              {data.loadMoreError ? <div role="alert" className="mt-5 text-center text-sm text-muted">
                <p>다음 스코어를 불러오지 못했습니다.</p>
                <button type="button" className="mt-2 underline" onClick={data.loadMore}>다시 시도</button>
              </div> : <ScoreLoadMore hasMore={data.hasMore} shownCount={data.scores.length}
                totalCount={data.totalElements} onLoadMore={data.loadMore} isLoading={data.isLoadingMore} />}
            </>}
      {selectedScore && <SongScoreDialog key={selectedScore.id} id={dialogId} song={toScoreDialogSong(selectedScore)}
        difficultyLabel={getScoreDialogDifficultyLabel(selectedScore)} onClose={() => setSelected(null)} />}
    </section>
  );
}
