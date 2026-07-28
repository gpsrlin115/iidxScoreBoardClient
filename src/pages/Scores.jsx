import { useScoresStore } from '../store/scoresStore';
import useScores from '../hooks/useScores';
import ScoreFilter from '../components/scores/ScoreFilter';
import ScoreTable from '../components/scores/ScoreTable';
import { FullPageSpinner } from '../components/common/Spinner';
import ErrorView from '../components/common/ErrorView';

/**
 * 🎓 학습 포인트: 이 페이지의 역할 (컨테이너 컴포넌트)
 *
 * Scores.jsx는 "컨테이너(Container) 컴포넌트"입니다:
 * - 데이터를 가져오고 (useScores)
 * - 하위 컴포넌트들을 조합하고 (ScoreFilter + ScoreTable)
 * - 페이지 전체 레이아웃을 구성합니다
 *
 * 하위 컴포넌트(ScoreFilter, ScoreTable)는 스스로 API를 호출하지 않습니다.
 * 모든 데이터는 여기서 가져와 props로 전달합니다.
 * → "단방향 데이터 흐름(Unidirectional Data Flow)"이라고 합니다.
 */
const Scores = () => {
  const { setPage } = useScoresStore();
  const { scores, totalElements, totalPages, currentPage, isLoading, error, refetch } = useScores();

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">스코어 목록</h1>
          {!isLoading && (
            <p className="text-slate-400 text-sm mt-0.5">
              총 {totalElements.toLocaleString()}개
            </p>
          )}
        </div>
      </div>

      {/* 필터 */}
      <ScoreFilter />

      {/* 본문 */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <FullPageSpinner />
        </div>
      ) : error ? (
        /**
         * 🎓 에러 상태 UI
         * 상태 코드에 따라 문구와 재시도 버튼이 달라집니다.
         * (ErrorView가 403/404/5xx/네트워크를 각각 다르게 표현합니다)
         */
        <ErrorView
          status={error.status}
          message={error.message}
          variant="page"
          onRetry={error.retryable ? refetch : undefined}
        />
      ) : (
        <>
          <ScoreTable scores={scores} />

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 pt-4">
              <button
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage === 0}
                className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white
                           hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                ← 이전
              </button>

              {/**
               * 🎓 Array.from으로 페이지 버튼 목록 생성
               * totalPages가 5이면 [0,1,2,3,4] 배열 생성 → 5개 버튼 렌더링
               * 페이지가 많을 경우 실전에서는 "..." 생략 처리를 추가합니다.
               */}
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition ${
                    i === currentPage
                      ? 'bg-primary-500 text-white font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {i + 1}
                </button>
              ))}

              <button
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages - 1}
                className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white
                           hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                다음 →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Scores;
