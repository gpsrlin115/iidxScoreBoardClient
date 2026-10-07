import MonoButton from '../common/MonoButton';
import { formatKst, formatRemaining, formatUtc, usageText } from '../../utils/requestBudget';

function Row({ label, value, note }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line py-3 first:border-t-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm text-ink">
        {value}
        {note && <span className="ml-2 text-xs text-faint">{note}</span>}
      </dd>
    </div>
  );
}

const kst = (value) => formatKst(value) ?? '-';

/**
 * Pure view of GET /admin/crawler/request-budget. `budget.blocked` alone
 * decides the block state; the browser clock only feeds the "time left" text.
 */
export default function RequestBudgetPanel({ budget, nowMs, loading, releasing, onRefresh, onRelease }) {
  const blocked = budget.blocked === true;
  const remaining = blocked ? formatRemaining(budget.blockedUntil, nowMs) : null;
  const busy = loading || releasing;

  return (
    <div className="space-y-6">
      <section className="border border-line-strong bg-panel p-5 sm:p-7" aria-labelledby="budget-block-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="budget-block-title" className="text-lg text-ink">전역 차단</h2>
          <span className={blocked ? 'text-sm text-danger' : 'text-sm text-accent'} role="status">
            {blocked ? '차단 중' : '차단 없음'}
          </span>
        </div>
        {blocked && (
          <dl className="mt-4">
            <Row label="차단이 풀리는 시각 (KST)" value={kst(budget.blockedUntil)}
              note={formatUtc(budget.blockedUntil) && `UTC ${formatUtc(budget.blockedUntil)}`} />
            <Row label="남은 시간" value={remaining ?? '곧 풀림 — 새로고침으로 확인'} />
          </dl>
        )}
        <p className="mt-4 text-xs leading-5 text-muted">
          eagate가 429로 요청한 대기나 403·재시도 소진 뒤 휴식 동안 모든 서버 수집의 시작과 새 접수가 멈춥니다.
          eagate가 요청한 대기는 최대 {budget.maxUpstreamBackoffHours ?? '-'}시간까지만 따릅니다.
        </p>
        {blocked && (
          <div className="mt-5 border-t border-line pt-4">
            <MonoButton disabled={busy} onClick={() => onRelease?.()}>
              {releasing ? '해제 중…' : '차단 해제'}
            </MonoButton>
            <p className="mt-2 text-xs leading-5 text-muted">
              제보 등으로 비정상 값이 확인됐을 때만 씁니다. 요청 간격과 사용량은 그대로입니다.
            </p>
          </div>
        )}
      </section>

      <section className="border border-line-strong bg-panel p-5 sm:p-7" aria-labelledby="budget-usage-title">
        <h2 id="budget-usage-title" className="text-lg text-ink">요청 예산</h2>
        <dl className="mt-4">
          <Row label="시간당 사용" value={usageText(budget.hourUsed, budget.hourlyBudget)}
            note={`다시 차는 시각 ${kst(budget.hourResetAt)} KST`} />
          <Row label="하루 사용" value={usageText(budget.dayUsed, budget.dailyBudget)}
            note={`다시 차는 시각 ${kst(budget.dayResetAt)} KST`} />
          <Row label="다음 요청 허용 시각" value={`${kst(budget.nextAllowedAt)} KST`} />
        </dl>
      </section>

      <MonoButton variant="ghost" disabled={busy} onClick={() => onRefresh?.()}>
        {loading ? '불러오는 중…' : '새로고침'}
      </MonoButton>
    </div>
  );
}
