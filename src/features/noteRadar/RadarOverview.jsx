import { CATEGORIES, CATEGORY_DESCRIPTIONS, categoryLabel, dateLabel, decimal, signed, finiteNumber } from './model.js';
import { RadarButton, RadarIssues } from './RadarUi';

const point = (index, radius) => {
  const angle = (-90 + index * 60) * Math.PI / 180;
  return [180 + radius * Math.cos(angle), 160 + radius * Math.sin(angle)];
};
const polygon = (radius) => CATEGORIES.map((_, index) => point(index, radius).join(',')).join(' ');

function RadarChart({ categories }) {
  const available = categories.length === 6 && categories.every((item) => finiteNumber(item.current));
  const scale = Math.max(200, ...categories.map((item) => Number(item.current) || 0));
  const shape = categories.map((item, index) => point(index, 100 * (Number(item.current) || 0) / scale).join(',')).join(' ');
  return <svg viewBox="0 0 360 320" role="img" aria-label={`SP 노트레이더: ${categories.map((item) => `${categoryLabel(item.category)} ${decimal(item.current)}`).join(', ')}`} className="mx-auto max-h-80 w-full max-w-sm overflow-visible">
    {[.25, .5, .75, 1].map((ratio) => <polygon key={ratio} points={polygon(100 * ratio)} fill="none" stroke="rgba(236,234,244,.14)" />)}
    {CATEGORIES.map((category, index) => { const [x, y] = point(index, 100); const [lx, ly] = point(index, 132); return <g key={category}>
      <line x1="180" y1="160" x2={x} y2={y} stroke="rgba(236,234,244,.1)" />
      <text x={lx} y={ly} textAnchor="middle" fill="#bcb5ca" fontSize="10">{categoryLabel(category)}</text>
      <text x={lx} y={ly + 16} textAnchor="middle" fill="#eceaf4" fontSize="13">{decimal(categories[index]?.current)}</text>
    </g>; })}
    {available && <polygon points={shape} fill="rgba(231,155,187,.2)" stroke="#e79bbb" strokeWidth="2" />}
    {!available && <text x="180" y="160" textAnchor="middle" fill="#8f96b0" fontSize="12">일부 수치 확인 필요</text>}
  </svg>;
}

export default function RadarOverview({ summary, previews, selectedCategory, onSelect, onRetry }) {
  return <section aria-label="노트레이더 현황" className="space-y-5">
    <div className="grid items-center rounded border border-line bg-white/[.025] p-4 lg:grid-cols-[minmax(300px,1fr)_1fr]">
      <RadarChart categories={summary.categories} />
      <div className="space-y-3 p-3">
        <p className="font-mono text-xs tracking-widest text-accent">SP · {summary.release ? `${summary.release} 작품` : '현재 작품'}</p>
        <h2 className="text-xl text-ink">다음 갱신에 도전할 곡을 찾아보세요</h2>
        <p className="text-sm leading-relaxed text-muted">공식 기록의 상위 10곡과 목표 점수를 비교해 카테고리 평균이 얼마나 오르는지 계산합니다.</p>
        <dl className="space-y-2 text-xs text-muted">
          <div><dt className="inline">공식 기록 가져온 시각 </dt><dd className="inline text-ink">{dateLabel(summary.importedAt)}</dd></div>
          {summary.previousImportedAt && <div><dt className="inline">이전 기록 </dt><dd className="inline">{dateLabel(summary.previousImportedAt)}</dd></div>}
          {summary.catalog?.updatedAt && <div><dt className="inline">보면 데이터 갱신 </dt><dd className="inline">{dateLabel(summary.catalog.updatedAt)}</dd></div>}
          {summary.catalog?.source && <div><dt className="inline">보면 데이터 출처 </dt><dd className="inline break-all">{summary.catalog.source}</dd></div>}
        </dl>
        <p className="text-xs leading-relaxed text-muted">EX 기록은 저장된 최고점과 기록 시점을 참고합니다. 공식 현재값은 다시 가져온 기록으로만 갱신합니다.</p>
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{summary.categories.map((item) => <article key={item.category} className={`flex flex-col gap-3 rounded border p-4 ${selectedCategory === item.category ? 'border-accent/70 bg-accent/5' : 'border-line bg-white/[.025]'}`}>
      <div className="flex items-start justify-between gap-3"><div><h3 className="font-mono text-sm text-ink">{categoryLabel(item.category)}</h3><p className="mt-1 text-xs text-muted">{CATEGORY_DESCRIPTIONS[item.category]}</p></div><span className="text-xs text-accent">{item.title}</span></div>
      <p className="font-num text-3xl text-ink">{decimal(item.current)} {item.delta !== null && <span className="text-xs text-accent">{signed(item.delta)}</span>}</p>
      <p className="text-xs text-muted">{item.current == null ? '현재 수치 확인 필요' : item.nextThreshold != null ? `다음 칭호까지 ${decimal(Math.max(0, item.nextThreshold - item.current))}` : '최고 칭호 · 추가 상승에 도전하세요'}</p>
      <div className="min-h-16 flex-1 text-xs text-muted">{!item.complete || summary.catalog?.available === false ? <div className="space-y-2"><p>계산 보류 · 공식 집계 규칙 또는 기준 데이터를 확인해야 합니다.</p><RadarIssues issues={item.issues} /></div> : previews[item.category]?.loading ? <p role="status">추천곡 계산 중…</p> : previews[item.category]?.error ? <p>추천을 가져오지 못했습니다.</p> : previews[item.category]?.data?.recommendations?.length ? <ol className="space-y-2">{previews[item.category].data.recommendations.slice(0, 3).map((song) => <li key={song.chartId} className="flex justify-between gap-2"><span className="truncate">{song.title}</span><span className="shrink-0 text-accent">{signed(song.gain)}</span></li>)}</ol> : <p>기록이 부족하면 목표 점수를 직접 입력해 탐색할 수 있습니다.</p>}</div>
      {previews[item.category]?.error && <RadarButton onClick={() => onRetry?.(item.category)}>추천 다시 시도</RadarButton>}
      <div className="grid grid-cols-2 gap-2"><RadarButton onClick={() => onSelect(item.category, 'recommendations')}>추천곡 보기</RadarButton><RadarButton onClick={() => onSelect(item.category, 'top10')}>현재 집계곡 보기</RadarButton></div>
    </article>)}</div>
  </section>;
}
