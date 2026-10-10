import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import MonoButton from '../common/MonoButton';
import { bookmarkletHref, PROFILE_URL } from '../../features/rivalCrawler/bookmarklet';
import { formatUtcTime, isActiveJob } from '../../utils/rivalCrawler';

const REGISTRATION_NOTES = {
  EXPIRED: '연결 시도가 5분이 지나 만료됐습니다. 아래에서 다시 시작해 주세요.',
  CANCELLED: '지난 연결 시도가 취소됐거나 새 시도로 바뀌었습니다. 필요하면 다시 시작해 주세요.',
  FAILED: '지난 연결 시도가 실패로 끝났습니다. 다시 시작해 주세요.',
  COMPLETED: '연결이 완료됐습니다. 아래 "연결·작업 상태 새로고침"으로 확인해 주세요.',
};

function Step({ number, title, children }) {
  return (
    <li className="flex gap-3">
      <span className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-strong font-mono text-[10px] text-accent" aria-hidden="true">{number}</span>
      <div className="min-w-0 flex-1">
        <h4 className="text-[13px] text-ink">{title}</h4>
        <div className="mt-1 space-y-2 text-[12px] text-muted">{children}</div>
      </div>
    </li>
  );
}

const subscribeNothing = () => () => {};
const readHref = () => bookmarkletHref(window.location.origin);
// undefined on the server render, where there is no window; null when this origin cannot host one.
const readServerHref = () => undefined;

function BookmarkletInstall() {
  const linkRef = useRef(null);
  const href = useSyncExternalStore(subscribeNothing, readHref, readServerHref);
  const [copyResult, setCopyResult] = useState(null);

  useEffect(() => {
    // React 19 drops javascript: URLs passed as the href prop, so set the attribute directly.
    if (href && linkRef.current) linkRef.current.setAttribute('href', href);
  }, [href]);

  if (href === null) {
    return <p className="text-text2">이 주소에서는 북마클릿을 만들 수 없습니다. https 주소로 접속한 사이트에서 다시 시도해 주세요.</p>;
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href);
      setCopyResult('복사했습니다.');
    } catch {
      setCopyResult('복사하지 못했습니다. 입력칸을 선택해 직접 복사해 주세요.');
    }
  };

  return (
    <>
      <p>
        아래 링크를 브라우저 즐겨찾기 막대로 끌어다 놓아 주세요.
        {' '}
        <a
          ref={linkRef}
          draggable="true"
          onClick={(event) => event.preventDefault()}
          className="inline-block rounded-sm border border-accent px-2 py-1 text-accent"
        >
          IIDX 코드 연결
        </a>
      </p>
      <p>끌어다 놓기가 어렵다면 아래 주소를 복사해 새 즐겨찾기를 만들고 URL 칸에 붙여 넣어 주세요. 이 링크는 여기서 눌러도 실행되지 않습니다.</p>
      <textarea
        readOnly
        rows={3}
        aria-label="북마클릿 주소"
        value={href || ''}
        onFocus={(event) => event.target.select()}
        className="w-full resize-none break-all border border-line bg-night/60 p-2 font-mono text-[10px] text-text2"
      />
      <div className="flex flex-wrap items-center gap-3">
        <MonoButton variant="ghost" disabled={!href} onClick={copy}>주소 복사</MonoButton>
        {copyResult && <span className="text-[11px] text-faint" role="status">{copyResult}</span>}
      </div>
    </>
  );
}

const IidxLinkGuide = ({ state, username, onStartRegistration, onCancelRegistration }) => {
  const registration = state.registration;
  const pending = registration?.status === 'PENDING';
  const activeJob = isActiveJob(state.status?.latestJob);
  const blockedUntil = state.registrationBlockedUntil;
  const blockedAt = blockedUntil != null && Number.isFinite(blockedUntil) ? formatUtcTime(new Date(blockedUntil).toISOString()) : null;
  const startDisabled = !state.ready || state.loading || state.action != null || activeJob
    || state.status?.enabled !== true || blockedUntil != null;
  const expiresAt = formatUtcTime(registration?.expiresAt);

  return (
    <div>
      <p className="text-[13px] text-ink">
        현재 사이트 계정 · <span className="font-mono">{username || '확인 중'}</span>
      </p>
      <p className="mt-1 text-[12px] text-muted">북마클릿을 실행하면 이 계정에 IIDX 코드가 연결됩니다.</p>
      <p className="mt-1 text-[11px] text-faint">쿠키나 비밀번호는 입력하지 않으며, 개발자 도구나 확장 프로그램도 필요 없습니다.</p>
      {REGISTRATION_NOTES[registration?.status] && (
        <p className="mt-3 border-l-2 border-line-strong pl-3 text-[12px] text-text2" role="status">{REGISTRATION_NOTES[registration.status]}</p>
      )}

      <ol className="mt-4 space-y-4">
        <Step number={1} title="북마클릿 설치 (처음 한 번)">
          <BookmarkletInstall />
        </Step>

        <Step number={2} title="연결 시작">
          <p>시작 버튼을 누른 뒤 5분 안에 아래 3, 4단계를 마쳐 주세요.</p>
          <div className="flex flex-wrap items-center gap-3">
            <MonoButton disabled={startDisabled} onClick={() => onStartRegistration?.()}>
              {state.action === 'register' ? '시작 중…' : pending ? '다시 시작' : '연결 시작'}
            </MonoButton>
            {pending && <span className="text-[11px] text-faint">다시 시작하면 지금 시도는 무효가 되고 횟수에 포함됩니다.</span>}
          </div>
          {activeJob && <p className="text-faint">수집 작업이 끝난 뒤 시작할 수 있습니다.</p>}
          {state.ready && state.status?.enabled === false && <p className="text-faint">내 기록 수집을 사용할 수 없는 동안에는 연결을 시작할 수 없습니다.</p>}
          {blockedUntil != null && (
            <p className="text-text2">다시 시작 가능 시각 · {blockedAt || '잠시 후'}</p>
          )}
          <p className="text-[11px] text-faint">시작은 한 시간에 3번까지 할 수 있습니다(실패·취소·만료 포함).</p>
        </Step>

        <Step number={3} title="본인 프로필 열기">
          {/* The popup only finishes an attempt started here, so offer the profile after start. */}
          {!pending && <p>연결을 시작하면 e-amusement 본인 프로필로 가는 링크가 여기에 나타납니다.</p>}
          {pending && (
            <>
              <p>
                <a className="text-info underline underline-offset-2" href={PROFILE_URL} target="_blank" rel="noopener noreferrer">
                  e-amusement 본인 프로필(DJ DATA) 열기 →
                </a>
              </p>
              <p className="text-text2">
                {expiresAt ? `만료 시각 · ${expiresAt} (5분 안에 완료)` : '5분 안에 완료해 주세요.'}
              </p>
              <MonoButton variant="ghost" disabled={state.action != null} onClick={() => onCancelRegistration?.()}>
                {state.action === 'cancelRegistration' ? '취소 중…' : '시도 취소'}
              </MonoButton>
            </>
          )}
        </Step>

        <Step number={4} title="북마클릿 실행">
          <p>프로필 페이지에서 설치한 북마클릿을 누르면 작은 연결 창이 열리고 결과를 보여 줍니다. 팝업이 차단되면 허용한 뒤 다시 실행해 주세요.</p>
          <p>끝나면 이 화면으로 돌아와 "연결·작업 상태 새로고침"으로 확인해 주세요.</p>
        </Step>
      </ol>
    </div>
  );
};

export default IidxLinkGuide;
