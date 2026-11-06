import { decimal } from './model.js';
import { titleName } from './titles.js';
import { labelFor } from './titleLabels.js';
import { RadarButton } from './RadarUi';

const note = 'rounded border border-line p-3 text-sm leading-6 text-text2';

function Banner({ plan, filtersActive, onClearFilters }) {
  if (plan.status === 'ESTIMATED_REACHED') return <p role="status" className={note}>모든 단계 목표를 내면 하한에 도달할 것으로 예상됩니다(추정). 실제 칭호는 공식 기록을 다시 가져와 확인하세요.</p>;
  if (plan.status === 'PARTIAL') return <p role="status" className={note}>{`계획대로 내도 하한까지 ${decimal(plan.remainingGap)} 남습니다(추정). 칭호가 불가능하다는 뜻은 아닙니다.`}</p>;
  if (plan.status === 'NO_CANDIDATES') return <div role="status" className={note}><p>현재 조건에서 계획을 만들 후보가 없습니다.</p>
    {filtersActive && onClearFilters && <RadarButton className="mt-2" onClick={onClearFilters}>필터 해제</RadarButton>}</div>;
  return <p role="status" className={note}>{labelFor('planStatus', plan.status)}</p>;
}

export default function RadarTitlePlan({ data, filtersActive = false, onClearFilters, onSelect }) {
  const plan = data?.plan;
  if (!plan || plan.status === 'BLOCKED' || plan.status === 'ALREADY_ACHIEVED' || data.goal?.status === 'BLOCKED') return null;
  const steps = plan.status === 'NO_CANDIDATES' ? [] : plan.steps ?? [];
  return <section aria-label="칭호 계획" className="space-y-3">
    <h3 className="text-base text-ink">칭호 계획</h3>
    <Banner plan={plan} filtersActive={filtersActive} onClearFilters={onClearFilters} />
    {!!steps.length && <ol className="space-y-3">{steps.map((step, index) => <li key={`${step.chartId}-${index}`} className="min-w-0 rounded border border-line bg-surface p-4">
      <p className="break-words text-sm text-ink"><span className="mr-2 font-num text-accent">{index + 1}</span>{step.title}</p>
      <p className="mt-1 text-xs text-muted">SP {step.chartType} · ☆{step.level}</p>
      <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <span>목표 EX <span className="font-num text-ink">{step.targetExScore}</span></span>
        <span>누적 예상 <span className="font-num text-ink">{decimal(step.after)}</span></span>
        <span>남은 값 <span className="font-num text-ink">{decimal(step.remainingGap)}</span></span></p>
      {!!step.replaced?.length && <p className="mt-1 break-words text-xs text-muted">누적 교체곡: {step.replaced.map((song) => song?.title ?? '확인 필요').join(', ')}</p>}
      {onSelect && <div className="mt-2 flex justify-end"><RadarButton onClick={() => onSelect({ chartId: step.chartId, title: step.title, chartType: step.chartType,
        level: step.level, noteCount: step.noteCount, targetExScore: step.targetExScore, minExScore: null })}>이 단계 목표 조정</RadarButton></div>}
    </li>)}</ol>}
    <div className="space-y-1 text-xs leading-5 text-muted">
      <p>최종 예상 칭호 {titleName(plan.estimatedTitle) ?? '확인 필요'}(추정) · 예상 값 {decimal(plan.after)}</p>
      <p>단계 결과는 앞 단계를 모두 달성했다고 가정한 누적값이며 곡별 상승량을 더한 값이 아닙니다.</p>
      {filtersActive && <p>현재 필터(레벨·난이도·기록) 안에서 계산한 계획입니다.</p>}
    </div>
  </section>;
}
