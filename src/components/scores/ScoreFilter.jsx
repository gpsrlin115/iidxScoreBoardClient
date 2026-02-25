import { useScoresStore } from '../../store/scoresStore';

/**
 * 🎓 학습 포인트: 필터 UI 컴포넌트의 역할
 *
 * ScoreFilter는 "순수 UI 컴포넌트"에 가깝습니다:
 * - 드롭다운 선택 → scoresStore의 setFilters 호출
 * - 상태 읽기/쓰기는 모두 scoresStore를 통해서만 합니다
 * - API 호출은 useScores 훅이 담당 (이 컴포넌트는 모름)
 *
 * 이렇게 분리하면 ScoreFilter를 다른 곳에서도 재사용하거나
 * 독립적으로 테스트할 수 있습니다.
 */

// 상수를 컴포넌트 밖에 선언 → 렌더링마다 재생성되지 않아 성능에 유리
const PLAY_STYLES = [
  { value: '', label: '전체 (SP/DP)' },
  { value: 'SP', label: 'SP' },
  { value: 'DP', label: 'DP' },
];

const LEVELS = [
  { value: '', label: '전체 레벨' },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: `Lv.${i + 1}`,
  })),
];

const CHART_TYPES = [
  { value: '', label: '전체 차트' },
  { value: 'BEGINNER', label: 'BEGINNER' },
  { value: 'NORMAL', label: 'NORMAL' },
  { value: 'HYPER', label: 'HYPER' },
  { value: 'ANOTHER', label: 'ANOTHER' },
  { value: 'LEGGENDARIA', label: 'LEGGENDARIA' },
];

const CLEAR_TYPES = [
  { value: '', label: '전체 클리어' },
  { value: 'FAILED', label: 'FAILED' },
  { value: 'ASSIST_CLEAR', label: 'ASSIST CLEAR' },
  { value: 'EASY_CLEAR', label: 'EASY CLEAR' },
  { value: 'CLEAR', label: 'CLEAR' },
  { value: 'HARD_CLEAR', label: 'HARD CLEAR' },
  { value: 'EX_HARD_CLEAR', label: 'EX-HARD CLEAR' },
  { value: 'FULL_COMBO', label: 'FULL COMBO' },
];

const FilterSelect = ({ label, value, options, onChange }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs text-slate-500 font-medium">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-2
                 border border-slate-700 focus:outline-none focus:border-primary-500
                 cursor-pointer transition"
    >
      {options.map(({ value: v, label: l }) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  </div>
);

const ScoreFilter = () => {
  const { filters, setFilters, resetFilters } = useScoresStore();
  const hasActiveFilter = Object.values(filters).some((v) => v !== '');

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
      <div className="flex flex-wrap gap-4 items-end">
        <FilterSelect
          label="플레이 스타일"
          value={filters.playStyle}
          options={PLAY_STYLES}
          onChange={(v) => setFilters({ playStyle: v })}
        />
        <FilterSelect
          label="레벨"
          value={filters.level}
          options={LEVELS}
          onChange={(v) => setFilters({ level: v })}
        />
        <FilterSelect
          label="차트 타입"
          value={filters.chartType}
          options={CHART_TYPES}
          onChange={(v) => setFilters({ chartType: v })}
        />
        <FilterSelect
          label="클리어 타입"
          value={filters.clearType}
          options={CLEAR_TYPES}
          onChange={(v) => setFilters({ clearType: v })}
        />

        {/**
          * 활성 필터가 있을 때만 리셋 버튼 표시
          * 🎓 이것이 "조건부 렌더링"입니다 (&&)
          */}
        {hasActiveFilter && (
          <button
            onClick={resetFilters}
            className="text-sm text-slate-400 hover:text-white px-3 py-2 rounded-lg
                       hover:bg-slate-700 transition mt-auto"
          >
            필터 초기화
          </button>
        )}
      </div>
    </div>
  );
};

export default ScoreFilter;
