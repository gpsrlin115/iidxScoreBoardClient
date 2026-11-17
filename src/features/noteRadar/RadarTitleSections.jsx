import RadarTitlePlan from './RadarTitlePlan';
import RadarTitleSong from './RadarTitleSong';

const LIMIT = '최대 100개까지 표시합니다.';

function Section({ title, items, variant, onSelect, children, className = '' }) {
  if (!items.length) return null;
  return <section aria-label={title} className={`space-y-3 ${className}`}>
    <h3 className="text-base text-ink">{title}</h3>
    {children}
    {items.length === 100 && <p className="text-xs text-muted">{LIMIT}</p>}
    {items.map((song, index) => <RadarTitleSong key={`${song.chartId}-${index}`} song={song} variant={variant} onSelect={onSelect} />)}
  </section>;
}

export default function RadarTitleSections({ data, filtersActive = false, onClearFilters, onSelect }) {
  const status = data?.goal?.status;
  if (!data || status === 'BLOCKED' || status === 'MISSING_OFFICIAL') return null;
  const recommendations = data.recommendations ?? [];
  const refresh = data.refreshRequired ?? [];
  const exploration = data.exploration ?? [];
  const empty = !recommendations.length && !refresh.length && !exploration.length;
  // When only official-refresh rows remain, an empty plan adds nothing but a misleading "no candidates" note.
  const hidePlan = status === 'REFRESH_REQUIRED' && !(data.plan?.steps ?? []).length;
  return <div className="space-y-6">
    {!hidePlan && <RadarTitlePlan data={data} filtersActive={filtersActive} onClearFilters={onClearFilters} onSelect={onSelect} />}
    <Section title="재플레이 후보" items={recommendations} variant="play" onSelect={onSelect} />
    <Section title="공식 갱신 확인" items={refresh} variant="refresh" className="rounded border border-amber-300/30 bg-amber-300/5 p-4">
      <p className="text-xs text-amber-100/90">공식 레이더를 다시 가져와 반영 여부를 확인하세요.</p>
    </Section>
    <Section title="탐색" items={exploration} variant="exploration" onSelect={onSelect} className="border-t border-line pt-5" />
    {empty && status === 'NEEDS_PLAY' && (hidePlan || data.plan?.status !== 'NO_CANDIDATES') && <p className="rounded border border-line p-4 text-sm text-muted">조건에 맞는 후보가 없습니다. 필터를 바꾸거나 다른 목표를 입력해 보세요.</p>}
  </div>;
}
