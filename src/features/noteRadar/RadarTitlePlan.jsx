import { decimal } from './model.js';
import { bundleTargets, itemScore } from './planBundle.js';
import { titleName } from './titles.js';
import { labelFor } from './titleLabels.js';
import { useBundleSimulation } from './useBundleSimulation.js';
import { RadarButton, RadarError } from './RadarUi';
import RadarBundleResult from './RadarBundleResult';
import RadarBundleSave from './RadarBundleSave';

const note = 'rounded border border-line p-3 text-sm leading-6 text-text2';

function Banner({ plan, filtersActive, onClearFilters }) {
  if (plan.status === 'ESTIMATED_REACHED') return <p role="status" className={note}>모든 단계 목표를 내면 하한에 도달할 것으로 예상됩니다(추정). 실제 칭호는 공식 기록을 다시 가져와 확인하세요.</p>;
  if (plan.status === 'PARTIAL') return <p role="status" className={note}>{`계획대로 내도 하한까지 ${decimal(plan.remainingGap)} 남습니다(추정). 칭호가 불가능하다는 뜻은 아닙니다.`}</p>;
  if (plan.status === 'NO_CANDIDATES') return <div role="status" className={note}><p>현재 조건에서 계획을 만들 후보가 없습니다.</p>
    {filtersActive && onClearFilters && <RadarButton className="mt-2" onClick={onClearFilters}>필터 해제</RadarButton>}</div>;
  return <p role="status" className={note}>{labelFor('planStatus', plan.status)}</p>;
}

function Step({ item, index, serverStep, edited, dispatch, onSelect, locked }) {
  const max = item.noteCount !== null && item.noteCount !== undefined && Number.isFinite(Number(item.noteCount)) ? Number(item.noteCount) * 2 : null;
  const valid = itemScore(item) !== null;
  const helpId = `bundle-help-${item.chartId}`;
  return <li className="min-w-0 rounded border border-line bg-surface p-4">
    <p className="break-words text-sm text-ink"><span className="mr-2 font-num text-accent">{index + 1}</span>{item.title}</p>
    <p className="mt-1 text-xs text-muted">SP {item.chartType} · ☆{item.level}{item.origin === 'card' && ' · 카드에서 추가'}</p>
    <div className="mt-2 flex flex-wrap items-end gap-x-5 gap-y-2 text-xs text-muted">
      <label className="grid gap-1">목표 EX
        <input type="text" inputMode="numeric" value={item.input} aria-invalid={!valid} aria-describedby={helpId}
          disabled={locked} onChange={(event) => dispatch({ type: 'edit', chartId: item.chartId, input: event.target.value })}
          className="min-h-11 w-28 rounded border border-line-strong bg-panel px-3 font-num text-base text-ink focus-visible:outline-accent" /></label>
      {!edited && serverStep && <>
        <span>누적 예상 <span className="font-num text-ink">{decimal(serverStep.after)}</span></span>
        <span>남은 값 <span className="font-num text-ink">{decimal(serverStep.remainingGap)}</span></span></>}
    </div>
    <p id={helpId} className={`mt-1 text-xs ${valid ? 'text-muted' : 'text-red-200'}`}>{max !== null ? `0~${max} 정수` : '0 이상의 정수'}</p>
    {!edited && !!serverStep?.replaced?.length && <p className="mt-1 break-words text-xs text-muted">누적 교체곡: {serverStep.replaced.map((song) => song?.title ?? '확인 필요').join(', ')}</p>}
    <div className="mt-2 flex flex-wrap justify-end gap-2">
      {onSelect && item.origin === 'plan' && !edited && <RadarButton disabled={locked} onClick={() => onSelect({ chartId: item.chartId, title: item.title, chartType: item.chartType,
        level: item.level, noteCount: item.noteCount, targetExScore: serverStep?.targetExScore ?? item.exScore, minExScore: null })}>이 단계 목표 조정</RadarButton>}
      <RadarButton disabled={locked} onClick={() => dispatch({ type: 'remove', chartId: item.chartId })}>빼기</RadarButton>
    </div>
  </li>;
}

export default function RadarTitlePlan({ data, bundle, dispatch, locked = false, onSavingChange, categoryId, onGoalsSaved, filtersActive = false, onClearFilters, onSelect }) {
  const plan = data?.plan;
  const targets = bundleTargets(bundle);
  const sim = useBundleSimulation(bundle.version, targets);
  if (!plan || plan.status === 'BLOCKED' || plan.status === 'ALREADY_ACHIEVED' || data.goal?.status === 'BLOCKED') return null;
  const edited = bundle.edited;
  const serverSteps = plan.status === 'NO_CANDIDATES' ? [] : plan.steps ?? [];
  const numericGoal = !data.goal?.requestedTitle;
  return <section aria-label="칭호 계획" className="space-y-3">
    <h3 className="text-base text-ink">칭호 계획</h3>
    {!edited && <Banner plan={plan} filtersActive={filtersActive} onClearFilters={onClearFilters} />}
    {edited && !sim.result && <p role="status" className={note}>수정됨 · 다시 계산해 확인하세요</p>}
    {!!bundle.items.length && <ol className="space-y-3">{bundle.items.map((item, index) => <Step key={item.chartId} item={item} index={index}
      serverStep={serverSteps.find((step) => step.chartId === item.chartId)} edited={edited} dispatch={dispatch} onSelect={onSelect} locked={locked} />)}</ol>}
    {!bundle.items.length && edited && <p className={note}>묶음이 비어 있습니다. 카드의 &apos;묶음에 추가&apos;로 채보를 담거나 서버 계획으로 되돌려 주세요.</p>}
    <div className="flex flex-wrap gap-2">
      <RadarButton primary disabled={!targets || sim.busy || locked} aria-describedby={!targets && bundle.items.length ? 'bundle-invalid-help' : undefined} onClick={sim.run}>{sim.busy ? '계산 중…' : '묶음 다시 계산'}</RadarButton>
      {edited && <RadarButton disabled={locked} onClick={() => dispatch({ type: 'reset' })}>서버 계획으로 되돌리기</RadarButton>}
    </div>
    {!targets && !!bundle.items.length && <p id="bundle-invalid-help" className="text-xs text-red-200">모든 목표 EX를 올바른 정수로 입력해야 계산할 수 있습니다.</p>}
    <RadarError error={sim.error} />
    {sim.result && <RadarBundleResult result={sim.result} categoryId={categoryId} goalTarget={data.goal?.targetValue} numericGoal={numericGoal} />}
    <RadarBundleSave key={bundle.version} items={targets ? bundle.items : []} category={categoryId} onGoalsSaved={onGoalsSaved} onBusyChange={onSavingChange} />
    <div className="space-y-1 text-xs leading-5 text-muted">
      {!edited && <p>최종 예상 칭호 {titleName(plan.estimatedTitle) ?? '확인 필요'}(추정) · 예상 값 {decimal(plan.after)}</p>}
      <p>단계 결과는 앞 단계를 모두 달성했다고 가정한 누적값이며 곡별 상승량을 더한 값이 아닙니다.</p>
      {filtersActive && <p>현재 필터(레벨·난이도·기록) 안에서 계산한 계획입니다.</p>}
    </div>
  </section>;
}
