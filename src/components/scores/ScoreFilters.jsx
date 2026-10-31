import Tag from '../common/Tag';
import { CLEAR_ORDER, CLEAR_TYPE_LABELS } from '../../utils/clearTypes';

const CHARTS = ['', 'BEGINNER', 'NORMAL', 'HYPER', 'ANOTHER', 'LEGGENDARIA'];
const SORTS = [['ex', 'EX'], ['clear', '클리어'], ['date', '최근'],
  ['series_desc', '최신 시리즈순'], ['series_asc', '오래된 시리즈순']];
const GROUP = 'flex flex-wrap items-center gap-[5px]';
const SELECT = 'max-w-full min-w-0 border border-line bg-night px-2 py-1 text-[12px] text-ink';

export default function ScoreFilters({ filters, setFilter, setSort, seriesOptions, seriesLoading, seriesError, refetchSeries }) {
  return (
    <div className="my-5 flex flex-wrap items-center gap-4 border-y border-line py-3">
      <label className={GROUP}>
        <span className="text-xs text-muted">레벨</span>
        <select aria-label="레벨" className={SELECT} value={filters.level ?? ''}
          onChange={(event) => setFilter({ level: event.target.value === '' ? '' : Number(event.target.value) })}>
          <option value="">전체 레벨</option>
          {Array.from({ length: 12 }, (_, index) => index + 1).map((level) => (
            <option key={level} value={level}>☆{level}</option>
          ))}
        </select>
      </label>
      <div className="flex max-w-full flex-wrap items-center gap-2">
        <label className={`${GROUP} max-w-full`}>
          <span className="text-xs text-muted">시리즈</span>
          <select aria-label="시리즈" className={SELECT} value={filters.series} disabled={seriesLoading}
            onChange={(event) => setFilter({ series: event.target.value })}>
            <option value="">{seriesLoading ? '시리즈 불러오는 중' : '전체 시리즈'}</option>
            {filters.series && !seriesOptions.some((option) => option.value === filters.series) && (
              <option value={filters.series}>{filters.series}</option>
            )}
            {seriesOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {seriesError && <span role="alert" className="text-xs text-muted">시리즈를 불러오지 못했습니다.{' '}
          <button type="button" className="underline" onClick={refetchSeries}>다시 시도</button>
        </span>}
      </div>
      <div role="group" aria-label="채보 종류" className={GROUP}>
        {CHARTS.map((chart) => <Tag key={chart} className="font-mono-ko" active={filters.chart === chart}
          onClick={() => setFilter({ chart })}>{chart || '전체'}</Tag>)}
      </div>
      <div role="group" aria-label="클리어" className={GROUP}>
        {['', ...CLEAR_ORDER].map((clear) => <Tag key={clear} className="font-mono-ko" active={filters.clear === clear}
          onClick={() => setFilter({ clear })}>{clear ? CLEAR_TYPE_LABELS[clear] : '전체'}</Tag>)}
      </div>
      <div role="group" aria-label="정렬" className={GROUP}>
        {SORTS.map(([sort, label]) => <Tag key={sort} className="font-mono-ko" active={filters.sort === sort}
          onClick={() => setSort(sort)}>{label}</Tag>)}
      </div>
    </div>
  );
}
