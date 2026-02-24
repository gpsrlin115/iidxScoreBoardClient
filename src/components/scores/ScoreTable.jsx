import clsx from 'clsx';
import { format } from 'date-fns';

/**
 * 🎓 학습 포인트: 데이터 표시 전용 컴포넌트
 *
 * ScoreTable은 "표시(Presentational) 컴포넌트"입니다.
 * - props로 받은 데이터를 보여주기만 합니다
 * - 상태(state)가 없습니다
 * - API를 직접 호출하지 않습니다
 *
 * 이런 컴포넌트는 스토리북 같은 도구로 독립적으로 미리보기 가능하고
 * 테스트하기도 매우 쉽습니다.
 */

/**
 * 클리어 타입에 따른 배지 색상 설정
 * IIDX 게임에서 사용하는 클리어 타입별 컬러를 CSS 변수로 정의한 값과 맞춥니다.
 */
const CLEAR_TYPE_STYLES = {
  FULL_COMBO:    'bg-yellow-400 text-gray-900',
  EX_HARD_CLEAR: 'bg-yellow-600 text-white',
  HARD_CLEAR:    'bg-slate-100 text-gray-900',
  CLEAR:         'bg-blue-500 text-white',
  EASY_CLEAR:    'bg-green-500 text-white',
  ASSIST_CLEAR:  'bg-purple-500 text-white',
  FAILED:        'bg-slate-600 text-slate-300',
};

const CLEAR_TYPE_LABEL = {
  FULL_COMBO:    'FC',
  EX_HARD_CLEAR: 'EX-H',
  HARD_CLEAR:    'HARD',
  CLEAR:         'CLR',
  EASY_CLEAR:    'EASY',
  ASSIST_CLEAR:  'ASS',
  FAILED:        'FAIL',
};

const DJ_LEVEL_STYLES = {
  AAA: 'text-yellow-400 font-bold',
  AA:  'text-slate-300 font-bold',
  A:   'text-amber-600 font-bold',
  B:   'text-slate-400',
  C:   'text-slate-500',
  D:   'text-slate-600',
  E:   'text-slate-700',
  F:   'text-red-600',
};

const ClearBadge = ({ type }) => (
  <span
    className={clsx(
      'inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold min-w-[40px]',
      CLEAR_TYPE_STYLES[type] ?? 'bg-slate-700 text-slate-400'
    )}
  >
    {CLEAR_TYPE_LABEL[type] ?? type}
  </span>
);

const ScoreTable = ({ scores }) => {
  if (scores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <p className="text-lg">스코어 데이터가 없습니다.</p>
        <p className="text-sm mt-1">CSV를 가져와서 데이터를 추가해보세요.</p>
      </div>
    );
  }

  return (
    /**
     * 🎓 overflow-x-auto란?
     * 테이블이 화면 너비보다 넓어질 때 가로 스크롤을 허용합니다.
     * 모바일에서 테이블이 잘리는 것을 방지하는 필수 패턴입니다.
     */
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-800/80 text-slate-400 text-xs uppercase tracking-wider">
          <tr>
            <th className="px-4 py-3">곡 제목</th>
            <th className="px-4 py-3">아티스트</th>
            <th className="px-4 py-3 text-center">스타일</th>
            <th className="px-4 py-3 text-center">Lv</th>
            <th className="px-4 py-3 text-center">차트</th>
            <th className="px-4 py-3 text-center">최고 클리어</th>
            <th className="px-4 py-3 text-right">최고 점수</th>
            <th className="px-4 py-3 text-center">DJ 레벨</th>
            <th className="px-4 py-3 text-center">MISS</th>
            <th className="px-4 py-3 text-center">플레이 수</th>
            <th className="px-4 py-3 text-right">최근 플레이</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {scores.map((score) => (
            <tr
              key={score.id}
              className="hover:bg-slate-800/40 transition group"
            >
              {/* 곡 제목 */}
              <td className="px-4 py-3 font-medium text-white max-w-[200px] truncate">
                {score.song.title}
              </td>
              {/* 아티스트 */}
              <td className="px-4 py-3 text-slate-400 max-w-[160px] truncate">
                {score.song.artist}
              </td>
              {/* 플레이 스타일 */}
              <td className="px-4 py-3 text-center">
                <span className="text-slate-300 font-mono text-xs">
                  {score.chart.playStyle}
                </span>
              </td>
              {/* 레벨 */}
              <td className="px-4 py-3 text-center">
                <span className="font-bold text-white">{score.chart.level}</span>
              </td>
              {/* 차트 타입 */}
              <td className="px-4 py-3 text-center">
                <span className="text-slate-400 text-xs">{score.chart.chartType}</span>
              </td>
              {/* 최고 클리어 타입 */}
              <td className="px-4 py-3 text-center">
                <ClearBadge type={score.bestClearType} />
              </td>
              {/* 최고 점수 */}
              <td className="px-4 py-3 text-right font-mono text-white">
                {score.bestScore?.toLocaleString() ?? '-'}
              </td>
              {/* DJ 레벨 */}
              <td className="px-4 py-3 text-center">
                <span className={clsx('font-mono', DJ_LEVEL_STYLES[score.bestDjLevel])}>
                  {score.bestDjLevel ?? '-'}
                </span>
              </td>
              {/* MISS 수 */}
              <td className="px-4 py-3 text-center text-slate-400 font-mono">
                {score.bestMissCount ?? '-'}
              </td>
              {/* 플레이 횟수 */}
              <td className="px-4 py-3 text-center text-slate-400">
                {score.playCount}
              </td>
              {/* 최근 플레이 */}
              <td className="px-4 py-3 text-right text-slate-500 text-xs">
                {/**
                 * 🎓 date-fns의 format 함수
                 * JS Date 객체를 원하는 형식의 문자열로 변환합니다.
                 * 'MM/dd HH:mm' → '02/24 14:30' 처럼 표시됩니다.
                 */}
                {score.bestPlayedAt
                  ? format(new Date(score.bestPlayedAt), 'yy/MM/dd')
                  : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ScoreTable;
