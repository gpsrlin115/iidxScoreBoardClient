import { useEffect, useState } from 'react';
import { noteRadarApi } from './api';
import { categoryLabel, decimal, errorMessage, finiteNumber } from './model.js';
import { RadarButton, RadarError, RadarIssues } from './RadarUi';
import RadarSong from './RadarSong';

export const radarInput = 'min-h-11 min-w-0 rounded border border-line-strong bg-panel px-3 py-2 text-sm text-ink focus-visible:outline-accent';

function Top10({ category }) {
  const changes = category.changes ?? {};
  const contains = (items = [], song) => items.some((item) => item.title === song.title && item.chartType === song.chartType);
  return <div className="space-y-4">
    <ol className="divide-y divide-line">{category.top10.map((song, index) => <li key={`${song.chartId ?? song.title}-${index}`} className="grid grid-cols-[24px_minmax(0,1fr)_70px] items-center gap-3 py-4">
      <span className="font-num text-muted">{index + 1}</span><div className="min-w-0"><p className="break-words text-sm text-ink">{song.title}</p><p className="mt-1 text-xs text-muted">SP {song.chartType}</p><p className="mt-1 text-xs text-accent">{contains(changes.entered, song) ? '새로 진입' : contains(changes.updated, song) ? '기록 갱신' : ''}</p>{song.chartId == null && <p className="text-xs text-amber-200">채보 연결 확인 필요</p>}</div>
      <div className="text-right"><p className="text-[10px] text-muted">곡 획득값</p><p className="font-num text-lg text-ink">{decimal(song.value)}</p></div>
    </li>)}</ol>
    {!category.top10.length && <p className="text-sm text-muted">가져온 집계곡이 없습니다.</p>}
    {!!changes.left?.length && <div className="rounded border border-line p-4"><h3 className="text-sm text-text2">이전 TOP10에서 제외</h3><ul className="mt-2 space-y-2 text-xs text-muted">{changes.left.map((song, index) => <li key={index} className="break-words">{song.title} · {song.chartType} · 곡 획득값 {decimal(song.value)}</li>)}</ul></div>}
  </div>;
}

export default function RadarCategory({ category, tab, onTabChange, onSelect, preview, goal,
  filters = { level: '', chartType: '', record: '' }, onFilterChange, onRecommendations, catalogAvailable = true }) {
  const [localFilters, setLocalFilters] = useState(filters);
  const activeFilters = onFilterChange ? filters : localFilters;
  const [filtered, setFiltered] = useState({ key: '', loading: false, data: null, error: '' });
  const [retry, setRetry] = useState(0);
  const hasGoal = finiteNumber(goal) && Number(goal) >= 0 && Number(goal) <= 200;
  const query = { ...activeFilters, ...(hasGoal ? { goal: Number(goal) } : {}) };
  const requestKey = JSON.stringify([category.category, query, retry]);
  const customQuery = Object.values(activeFilters).some(Boolean) || hasGoal || retry;
  useEffect(() => {
    if (!category.complete || !catalogAvailable || !customQuery || tab === 'top10') return undefined;
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(async () => {
      setFiltered({ key: requestKey, loading: true, data: null, error: '' });
      try {
        const data = await noteRadarApi.getRecommendations(category.category, JSON.parse(requestKey)[1], controller.signal);
        if (active && !controller.signal.aborted) {
          setFiltered({ key: requestKey, loading: false, data, error: '' });
          onRecommendations?.(category.category, data);
        }
      } catch (error) {
        if (active && !controller.signal.aborted) setFiltered({ key: requestKey, loading: false, data: null, error: errorMessage(error) });
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [category.category, category.complete, catalogAvailable, customQuery, requestKey, tab, onRecommendations]);
  const result = customQuery ? filtered.key === requestKey ? filtered : { loading: true } : preview ?? { loading: true };
  const change = (key, value) => onFilterChange ? onFilterChange(key, value) : setLocalFilters((current) => ({ ...current, [key]: value }));
  const songs = [...(result.data?.recommendations ?? [])].sort((a, b) => Number(b.gain ?? -Infinity) - Number(a.gain ?? -Infinity));
  return <section aria-label={`${categoryLabel(category.category)} 상세`} className="space-y-4">
    <div className="flex gap-2 border-b border-line pb-3" role="tablist" aria-label="카테고리 상세">{[['recommendations', '추천곡'], ['top10', '현재 TOP10']].map(([key, label]) => <RadarButton key={key} id={`radar-${key}-tab`} role="tab" aria-selected={tab === key} aria-controls="radar-category-panel" primary={tab === key} onClick={() => onTabChange(key)}>{label}</RadarButton>)}</div>
    <RadarIssues issues={category.issues} />
    <div id="radar-category-panel" role="tabpanel" aria-labelledby={`radar-${tab}-tab`}>
      {tab === 'top10' ? <Top10 category={category} /> : <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-xs text-muted">레벨<select value={activeFilters.level} onChange={(event) => change('level', event.target.value)} className={radarInput}><option value="">전체 레벨</option>{Array.from({ length: 12 }, (_, i) => i + 1).map((level) => <option key={level} value={level}>☆{level}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-muted">난이도<select value={activeFilters.chartType} onChange={(event) => change('chartType', event.target.value)} className={radarInput}><option value="">전체 난이도</option>{['BEGINNER', 'NORMAL', 'HYPER', 'ANOTHER', 'LEGGENDARIA'].map((type) => <option key={type}>{type}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-muted">내 기록<select value={activeFilters.record} onChange={(event) => change('record', event.target.value)} className={radarInput}><option value="">전체</option><option value="present">기록 있음</option><option value="absent">기록 없음</option></select></label>
        </div>
        <p className="text-xs leading-5 text-muted">추천 목표 달성 시 평균 상승량 내림차순입니다. 공식 반영 전 추정값이며 공식 현재값은 재가져오기 후 바뀝니다.</p>
        {!category.complete || !catalogAvailable ? <p role="status" className="rounded border border-amber-300/30 p-4 text-sm text-amber-100">계산 보류 · {!catalogAvailable ? '검증된 기준 데이터가 준비되지 않았습니다.' : '일부 공식 집계곡의 채보를 확인해야 합니다.'} 현재 TOP10은 계속 볼 수 있습니다.</p> : <>
          {result.loading && <p role="status" className="p-4 text-sm text-muted">추천곡을 계산하고 있습니다…</p>}
          <RadarError error={result.error} onRetry={() => setRetry((value) => value + 1)} />
          <RadarIssues issues={result.data?.issues} />
          {!result.loading && !result.error && result.data && !songs.length && <p className="rounded border border-line p-4 text-sm text-muted">이 조건의 추천곡이 없습니다. 필터를 바꾸거나 직접 목표를 입력할 곡을 탐색해 보세요.</p>}
          <div className="space-y-3">{songs.map((song) => <RadarSong key={song.chartId} song={song} category={category.category} onSelect={onSelect} hasGoal={hasGoal} />)}</div>
          {!!result.data?.exploration?.length && <section className="space-y-3 border-t border-line pt-5"><h3 className="text-base text-ink">직접 목표를 입력할 곡 탐색</h3><p className="text-xs text-muted">추정 자료가 부족한 곡입니다. 목표 EX를 직접 입력해 계산할 수 있습니다.</p>{result.data.exploration.map((song) => <RadarSong key={song.chartId} song={song} category={category.category} exploration onSelect={onSelect} hasGoal={hasGoal} />)}</section>}
        </>}
      </div>}
    </div>
  </section>;
}
