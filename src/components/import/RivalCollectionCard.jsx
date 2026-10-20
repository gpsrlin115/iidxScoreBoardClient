import { useState } from 'react';
import MonoButton from '../common/MonoButton';
import IidxLinkGuide from './IidxLinkGuide';
import RivalJobList from './RivalJobList';
import { useAuthStore } from '../../store/authStore';
import {
  formatServerTime, formatUtcTime, isLinkedBinding, isRequestActive, requestJobs, SOURCE_LABELS,
} from '../../utils/rivalCrawler';

const formatCount = (value) => Number(value).toLocaleString();

// One request may collect SP, DP, or both; the server runs SP first, then DP.
const STYLE_CHOICES = [
  ['BOTH', 'SP·DP 둘 다', ['SP', 'DP']],
  ['SP', 'SP만', ['SP']],
  ['DP', 'DP만', ['DP']],
];
const JOB_TIME_KEYS = ['queuedAt', 'startedAt', 'finishedAt', 'estimatedStartAt', 'estimatedFinishAt', 'nextRequestAt'];

const RivalCollectionCard = ({
  state, onEnqueue, onCancel, onUnlink, onRefresh, onStartRegistration, onCancelRegistration,
}) => {
  const username = useAuthStore((s) => s.user?.username);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [styleChoice, setStyleChoice] = useState('BOTH');
  const binding = state.binding;
  const linked = isLinkedBinding(binding);
  const jobs = requestJobs(state.status);
  // Locked while any job of the latest request (SP or DP) is still queued or running.
  const active = isRequestActive(state.status);
  const busy = state.action != null;
  const collectionDisabled = busy || active || state.loading || !state.ready || !linked || state.status?.enabled !== true || state.status?.cooldownUntil != null || state.retryBlockedAction === 'enqueue';
  const selectedStyles = STYLE_CHOICES.find(([key]) => key === styleChoice)[2];

  const requestUnlink = () => {
    setConfirmUnlink(false);
    onUnlink?.();
  };

  // registeredAt is a UTC instant, so it is formatted apart and stays out of the server-time note.
  const registeredAt = formatUtcTime(binding?.registeredAt);
  const needsServerTimeNote = (binding?.verified === true && binding?.verifiedAt != null)
    || (state.status?.cooldownUntil != null)
    || jobs.some((job) => JOB_TIME_KEYS.some((key) => job[key] != null));

  return (
    <section aria-labelledby="rival-collection-title" className="rounded-[4px] border border-line bg-surface px-[18px] py-[18px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[8.5px] uppercase tracking-[.14em] text-accent">server collection</p>
          <h2 id="rival-collection-title" className="mt-1 text-[15px] text-ink">IIDX 코드로 내 기록 수집</h2>
          <p className="mt-1 text-[12px] text-muted">SP·DP · 작품 34까지</p>
        </div>
        {state.ready && state.status?.enabled === true && (
          <span className="rounded-sm border border-[rgba(76,154,255,.3)] px-2 py-1 font-mono text-[9px] tracking-wide text-info">기능 활성화</span>
        )}
      </div>

      <p className="mt-3 text-[12px] text-muted">이번 수집은 MISS COUNT를 갱신하지 않으며 기존 기록은 유지됩니다.</p>

      <aside className="mt-3 rounded-[4px] border border-line bg-night/40 px-3 py-3">
        <h3 className="text-[12px] text-accent">CSV로 더 자세하게 가져오기</h3>
        <p className="mt-1 text-[11px] text-muted">CSV를 이용하면 더 빠르게, 더 많은 기록 정보를 입력할 수 있습니다.</p>
        <a className="mt-2 inline-block text-[11px] text-accent underline underline-offset-2" href="#csv-upload">CSV 업로드로 이동 →</a>
      </aside>

      <div className="mt-4 rounded-[4px] border border-line-strong bg-night/40 p-4" aria-live="polite">
        {linked ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] text-faint">연결된 IIDX ID</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[16px] text-ink">
                {binding.iidxId}
                {binding.verified === true && <span className="rounded-sm border border-[rgba(76,154,255,.3)] px-2 py-[2px] text-[10px] tracking-wide text-info">확인됨</span>}
              </p>
              {SOURCE_LABELS[binding.source] && <p className="mt-1 text-[11px] text-faint">연결 방법 · {SOURCE_LABELS[binding.source]}</p>}
              {registeredAt && <p className="mt-1 text-[11px] text-faint">연결 시각 · {registeredAt}</p>}
              {binding.verified === true && binding.verifiedAt != null && <p className="mt-1 text-[11px] text-faint">확인 시각 · {formatServerTime(binding.verifiedAt)}</p>}
            </div>
            <MonoButton variant="ghost" disabled={busy} onClick={() => setConfirmUnlink((value) => !value)}>
              연결 해제
            </MonoButton>
            <p className="w-full text-[11px] text-faint">코드를 바꾸려면 연결을 해제한 뒤 다시 등록해 주세요.</p>
          </div>
        ) : (
          // The bookmarklet is the only way to link from this screen. The older cookie
          // check stays in the API for existing VERIFIED bindings but is not offered here.
          <IidxLinkGuide state={state} username={username} onStartRegistration={onStartRegistration} onCancelRegistration={onCancelRegistration} />
        )}

      {confirmUnlink && linked && (
          <div className="mt-4 border-t border-line pt-3" role="group" aria-label="연결 해제 확인">
            <p className="text-[12px] text-text2">연결을 해제하면 진행 중인 기록 수집 작업도 취소됩니다. 이미 저장된 점수는 유지됩니다.</p>
            <div className="mt-3 flex gap-2">
              <MonoButton disabled={state.action === 'unlink'} onClick={requestUnlink}>{state.action === 'unlink' ? '해제 중…' : '연결 해제 확인'}</MonoButton>
              <MonoButton variant="ghost" disabled={busy} onClick={() => setConfirmUnlink(false)}>돌아가기</MonoButton>
            </div>
          </div>
        )}
      </div>

      {state.error && (
        <div className="mt-3 rounded-[4px] border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger" role="alert">
          {state.error.message}
          {state.error.retryAfterSeconds != null && <span className="ml-1">서버 재시도 대기 안내: {formatCount(state.error.retryAfterSeconds)}초</span>}
        </div>
      )}

      {state.status?.cooldownUntil != null && (
        <p className="mt-3 text-[12px] text-muted" aria-live="polite">다음 수집 가능 시각 · {formatServerTime(state.status.cooldownUntil)}</p>
      )}
      {needsServerTimeNote && <p className="mt-2 text-[10px] text-faint">서버 시각 · 시간대 미확정</p>}

      {state.status?.enabled === false ? (
        <div className="mt-4 border-l-2 border-line-strong pl-3 text-[12px] text-muted">
          서버 내 기록 수집을 현재 사용할 수 없습니다. 아래 CSV 업로드를 이용해 주세요.
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <fieldset className="flex w-full flex-wrap items-center gap-x-4 gap-y-2" disabled={busy || active}>
            <legend className="mb-1 w-full text-[11px] text-faint">수집할 플레이 스타일</legend>
            {STYLE_CHOICES.map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5 text-[12px] text-text2">
                <input type="radio" name="rival-play-styles" value={key} checked={styleChoice === key}
                  onChange={() => setStyleChoice(key)} />
                {label}
              </label>
            ))}
          </fieldset>
          <MonoButton disabled={collectionDisabled} onClick={() => onEnqueue?.(selectedStyles)} trailing="→">
            {state.action === 'enqueue' ? '요청 중…' : '내 기록 수집 요청'}
          </MonoButton>
          {state.status?.enabled === true && !linked && <p className="text-[11px] text-faint">IIDX 코드를 연결한 뒤 수집을 요청할 수 있습니다.</p>}
          {state.status?.enabled === true && linked && !active && <p className="text-[11px] text-faint">연결된 IIDX 코드로 요청합니다. 쿠키를 입력할 필요가 없습니다.</p>}
          {state.status?.enabled === true && <p className="w-full text-[11px] text-faint">서버 준비 상태에 따라 요청이 거절될 수 있습니다.</p>}
          {state.status?.enabled == null && !state.loading && (
            <p className="text-[11px] text-faint">서버 상태를 확인할 수 없습니다. CSV 업로드를 이용해 주세요.</p>
          )}
        </div>
      )}

      {active && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <MonoButton variant="ghost" disabled={busy} onClick={() => onCancel?.()}>
            {state.action === 'cancel' ? '취소 중…' : '수집 취소'}
          </MonoButton>
          <p className="text-[11px] text-faint">진행 중인 SP·DP 수집을 모두 멈춥니다. 이미 저장된 기록은 유지됩니다.</p>
        </div>
      )}

      <button type="button" className="mt-3 text-[11px] text-info underline underline-offset-2" disabled={busy || state.loading} onClick={() => onRefresh?.()}>
        연결·작업 상태 새로고침
      </button>

      <RivalJobList status={state.status} />
    </section>
  );
};

export default RivalCollectionCard;
