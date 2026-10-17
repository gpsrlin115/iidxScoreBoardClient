import { useEffect, useState } from 'react';
import { noteRadarApi } from './api';
import { categoryLabel, dateLabel, decimal, errorMessage, finiteNumber, scoreRate, signed } from './model.js';
import { RadarButton, RadarError, RadarIssues } from './RadarUi';

const inputClass = 'min-h-10 rounded border border-line bg-[#0a0e1d] px-3 py-2 text-sm text-ink focus-visible:outline-accent';
const recordLabel = (song) => finiteNumber(song.currentExScore) ? `EX ${song.currentExScore}${scoreRate(song.currentExScore, song.noteCount) != null ? ` · ${decimal(scoreRate(song.currentExScore, song.noteCount))}%` : ''}` : '기록 없음';
const basisLabel = (basis) => ({ SIMILAR_PLAYERS: '비슷한 사용자의 기록', PERSONAL_LEVEL: '같은 레벨·속성의 내 기록', PEERS: '비슷한 사용자의 기록', SIMILAR_USERS: '비슷한 사용자의 기록', PERSONAL: '같은 레벨의 내 기록', PERSONAL_MEDIAN: '같은 레벨의 내 기록' })[basis] ?? basis;

function RecommendationCard({ song, onSelect, exploration = false, hasGoal = false }) {
  return <article className="flex flex-col gap-3 rounded border border-line bg-white/[.025] p-4">
    <div className="flex items-start justify-between gap-3"><div><h4 className="font-medium leading-relaxed text-ink">{song.title}</h4><p className="text-xs text-muted">SP {song.chartType} · ☆{song.level} · {song.noteCount ?? '—'} NOTES</p></div>{!exploration && <p className="shrink-0 text-right text-accent"><span className="block text-[10px] text-muted">평균 상승</span>{signed(song.gain)}</p>}</div>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
      <div><dt className="text-muted">저장된 내 기록</dt><dd className="mt-1 text-ink">{recordLabel(song)}</dd></div>
      <div><dt className="text-muted">추천 목표</dt><dd className="mt-1 text-ink">{song.targetExScore != null ? `EX ${song.targetExScore} · ${decimal(scoreRate(song.targetExScore, song.noteCount) ?? song.targetRate)}%` : '직접 목표 입력'}</dd></div>
      {finiteNumber(song.currentExScore) && song.targetExScore != null && <div><dt className="text-muted">{song.currentScoreComparable ? '필요한 EX 갱신' : '저장된 EX와 차이'}</dt><dd className="mt-1 text-ink">{song.targetExScore <= song.currentExScore ? '기존 최고점으로 재도전 가능' : `+${song.targetExScore - song.currentExScore}`}</dd></div>}
      <div><dt className="text-muted">곡 획득값</dt><dd className="mt-1 text-ink">{decimal(song.radarValue)}</dd></div>
    </dl>
    {finiteNumber(song.currentExScore) && <p className="text-[11px] text-muted">기록 갱신 시각 {dateLabel(song.currentScoreAt)} · {song.currentScoreComparable ? '현재 작품 기록' : '저장된 누적 최고점, 현재 작품과 다를 수 있습니다.'}</p>}
    {hasGoal && Object.hasOwn(song, 'goalExScore') && <p className="text-xs text-ink">{song.goalExScore != null ? `카테고리 목표 단독 달성: EX ${song.goalExScore}` : '여러 곡 갱신 필요'}</p>}
    {song.displacedTitle && <p className="text-xs text-muted">교체 대상: {song.displacedTitle}</p>}
    <div className="space-y-1 text-xs leading-relaxed text-muted">
      {song.basis && <p>{basisLabel(song.basis)}{song.peerCount ? ` · 참고 ${song.peerCount}명` : song.sampleCount ? ` · 참고 ${song.sampleCount}개 기록` : ''}</p>}
      {song.rangeLowExScore != null && <p>참고 점수 범위 EX {song.rangeLowExScore}~{song.rangeHighExScore} · 달성 확률을 뜻하지 않습니다.</p>}
      {(song.reasons ?? []).map((reason, index) => <p key={index}>{typeof reason === 'string' ? reason : reason.message}</p>)}
    </div>
    <RadarButton primary onClick={() => onSelect(song)}>{exploration ? '목표 점수 입력' : '점수 조정 · 목표 저장'}</RadarButton>
  </article>;
}

function Top10({ category }) {
  const changes = category.changes ?? {};
  return <div className="space-y-3">
    {['entered', 'left', 'updated'].map((key) => changes[key]?.length > 0 && <p key={key} className="text-xs leading-relaxed text-muted">{{ entered: '새로 진입', left: '집계에서 제외', updated: '기록 갱신' }[key]}: {changes[key].map((song) => `${song.title} ${song.chartType ?? ''}`).join(', ')}</p>)}
    <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-left text-sm"><caption className="sr-only">{categoryLabel(category.category)} 공식 상위 10곡</caption><thead><tr className="border-b border-line text-xs text-muted"><th className="p-3">순위</th><th className="p-3">곡명 / 난이도</th><th className="p-3 text-right">획득값</th></tr></thead><tbody>{category.top10.map((song, index) => <tr key={`${song.chartId ?? song.title}-${index}`} className="border-b border-line/60"><td className="p-3 font-num text-muted">{index + 1}</td><td className="p-3 text-ink">{song.title}<span className="ml-2 text-xs text-muted">{song.chartType}</span>{song.chartId == null && <span className="ml-2 text-xs text-amber-200">보면 연결 미확인</span>}</td><td className="p-3 text-right font-num text-accent">{decimal(song.value)}</td></tr>)}</tbody></table>{category.top10.length === 0 && <p className="p-5 text-sm text-muted">아직 가져온 집계곡이 없습니다.</p>}</div>
  </div>;
}

export default function RadarCategory({ category, tab, onTabChange, onSelect, preview, goal }) {
  const [filters, setFilters] = useState({ level: '', chartType: '', record: '' });
  const [filtered, setFiltered] = useState({ loading: false, data: null, error: '' });
  const [retry, setRetry] = useState(0);
  const hasGoal = finiteNumber(goal) && Number(goal) >= 0 && Number(goal) <= 200;
  const filteredRequest = Object.values(filters).some(Boolean) || hasGoal;
  useEffect(() => {
    if (!category.complete || (!filteredRequest && !retry)) return undefined;
    const controller = new AbortController();
    const fetch = async () => {
      setFiltered({ loading: true, data: null, error: '' });
      try {
        const data = await noteRadarApi.getRecommendations(category.category, { ...filters, ...(hasGoal ? { goal: Number(goal) } : {}) }, controller.signal);
        if (!controller.signal.aborted) setFiltered({ loading: false, data, error: '' });
      } catch (error) {
        if (!controller.signal.aborted) setFiltered({ loading: false, data: null, error: errorMessage(error) });
      }
    };
    fetch();
    return () => controller.abort();
  }, [category.category, category.complete, filters, filteredRequest, retry, hasGoal, goal]);
  const result = filteredRequest || retry ? filtered : preview ?? { loading: false };
  const changeFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  return <section aria-label={`${categoryLabel(category.category)} 상세`} className="space-y-4 rounded border border-line bg-[#080b18]/70 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg text-ink">{categoryLabel(category.category)} <span className="font-num text-accent">{decimal(category.current)}</span></h2><div className="flex gap-2" role="tablist" aria-label="카테고리 상세"><RadarButton id="radar-recommendations-tab" role="tab" aria-selected={tab === 'recommendations'} aria-controls="radar-category-panel" primary={tab === 'recommendations'} onClick={() => onTabChange('recommendations')}>추천곡</RadarButton><RadarButton id="radar-top10-tab" role="tab" aria-selected={tab === 'top10'} aria-controls="radar-category-panel" primary={tab === 'top10'} onClick={() => onTabChange('top10')}>현재 TOP10</RadarButton></div></div>
    <RadarIssues issues={category.issues} />
    <div id="radar-category-panel" role="tabpanel" aria-labelledby={`radar-${tab}-tab`}>
      {tab === 'top10' ? <Top10 category={category} /> : <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-xs text-muted">레벨<select value={filters.level} onChange={(event) => changeFilter('level', event.target.value)} className={inputClass}><option value="">전체 레벨</option>{Array.from({ length: 12 }, (_, index) => index + 1).map((level) => <option key={level} value={level}>☆{level}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-muted">난이도<select value={filters.chartType} onChange={(event) => changeFilter('chartType', event.target.value)} className={inputClass}><option value="">전체 난이도</option>{['BEGINNER', 'NORMAL', 'HYPER', 'ANOTHER', 'LEGGENDARIA'].map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-muted">내 기록<select value={filters.record} onChange={(event) => changeFilter('record', event.target.value)} className={inputClass}><option value="">전체</option><option value="present">기록 있음</option><option value="absent">기록 없음</option></select></label>
        </div>
        <p className="text-xs text-muted">추천 목표 달성 시 평균 상승량이 큰 순서입니다. 상승량은 공식 반영 전 추정값이며, 참고 기록으로 목표 점수를 제안합니다.</p>
        {!category.complete ? <p className="rounded border border-line p-4 text-sm text-muted">집계곡을 모두 확인한 뒤 교체 대상과 상승량을 계산합니다. 공식 기록을 다시 가져와 주세요.</p> : <>
          {result.loading && <p role="status" className="p-4 text-sm text-muted">추천곡을 계산하고 있습니다…</p>}
          <RadarError error={result.error} onRetry={() => setRetry((value) => value + 1)} />
          <RadarIssues issues={result.data?.issues} />
          {!result.loading && !result.error && result.data?.recommendations?.length === 0 && <p className="p-3 text-sm text-muted">이 조건에서 평균을 올릴 추천곡이 없습니다. 필터를 바꾸거나 아래 탐색 목록에서 점수를 입력해 보세요.</p>}
          <div className="grid gap-3 lg:grid-cols-2">{result.data?.recommendations?.map((song) => <RecommendationCard key={song.chartId} song={song} onSelect={onSelect} hasGoal={hasGoal} />)}</div>
          {!!result.data?.exploration?.length && <details className="rounded border border-line p-4"><summary className="cursor-pointer text-sm text-ink">직접 목표를 입력할 곡 탐색 ({result.data.exploration.length})</summary><p className="my-3 text-xs text-muted">목표 점수 추정에 필요한 기록이 부족한 곡입니다. 점수를 직접 입력하면 상승량을 계산할 수 있습니다.</p><div className="grid gap-3 lg:grid-cols-2">{result.data.exploration.map((song) => <RecommendationCard key={song.chartId} song={song} exploration onSelect={onSelect} hasGoal={hasGoal} />)}</div></details>}
        </>}
      </div>}
    </div>
  </section>;
}
