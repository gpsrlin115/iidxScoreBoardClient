import { useReducer, useState } from 'react';
import { initialBundle, planBundleReducer } from './planBundle.js';
import RadarTitlePlan from './RadarTitlePlan';
import RadarTitleSong from './RadarTitleSong';

const LIMIT = '최대 100개까지 표시합니다.';

function Section({ title, items, variant, onSelect, bundle, dispatch, locked, numericGoal, children, className = '' }) {
  if (!items.length) return null;
  return <section aria-label={title} className={`space-y-3 ${className}`}>
    <h3 className="text-base text-ink">{title}</h3>
    {children}
    {items.length === 100 && <p className="text-xs text-muted">{LIMIT}</p>}
    {items.map((song, index) => <RadarTitleSong key={`${song.chartId}-${index}`} song={song} variant={variant} onSelect={onSelect} bundle={bundle} dispatch={dispatch} locked={locked} numericGoal={numericGoal} />)}
  </section>;
}

export default function RadarTitleSections({ data, categoryId, onGoalsSaved, filtersActive = false, onClearFilters, onSelect }) {
  const [bundle, dispatch] = useReducer(planBundleReducer, data?.plan, initialBundle);
  // While goals are being saved the bundle is frozen so the save report always matches what was sent.
  const [saving, setSaving] = useState(false);
  const status = data?.goal?.status;
  if (!data || status === 'BLOCKED' || status === 'MISSING_OFFICIAL') return null;
  const recommendations = data.recommendations ?? [];
  const refresh = data.refreshRequired ?? [];
  const exploration = data.exploration ?? [];
  const empty = !recommendations.length && !refresh.length && !exploration.length;
  // When only official-refresh rows remain, an empty plan adds nothing but a misleading "no candidates" note.
  const hidePlan = status === 'REFRESH_REQUIRED' && !(data.plan?.steps ?? []).length;
  const plan = data.plan;
  const planShown = !hidePlan && !!plan && !['BLOCKED', 'ALREADY_ACHIEVED'].includes(plan.status);
  const numericGoal = !data.goal?.requestedTitle;
  const shared = { bundle: planShown ? bundle : null, dispatch, locked: saving, numericGoal };
  return <div className="space-y-6">
    {!hidePlan && <RadarTitlePlan data={data} bundle={bundle} dispatch={dispatch} locked={saving} onSavingChange={setSaving} categoryId={categoryId} onGoalsSaved={onGoalsSaved} filtersActive={filtersActive} onClearFilters={onClearFilters} onSelect={onSelect} />}
    <Section title="재플레이 후보" items={recommendations} variant="play" onSelect={onSelect} {...shared} />
    <Section title="공식 갱신 확인" items={refresh} variant="refresh" numericGoal={numericGoal} className="rounded border border-amber-300/30 bg-amber-300/5 p-4">
      <p className="text-xs text-amber-100/90">공식 레이더를 다시 가져와 반영 여부를 확인하세요.</p>
    </Section>
    <Section title="탐색" items={exploration} variant="exploration" onSelect={onSelect} {...shared} className="border-t border-line pt-5" />
    {empty && status === 'NEEDS_PLAY' && (hidePlan || data.plan?.status !== 'NO_CANDIDATES') && <p className="rounded border border-line p-4 text-sm text-muted">조건에 맞는 후보가 없습니다. 필터를 바꾸거나 다른 목표를 입력해 보세요.</p>}
  </div>;
}
