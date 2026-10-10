import { useEffect, useState, useSyncExternalStore } from 'react';
import { rivalCrawlerApi } from '../api/rivalCrawler';
import { createLinkSession } from '../features/rivalCrawler/linkSession';
import { useAuthStore } from '../store/authStore';
import { formatUtcTime, SOURCE_LABELS } from '../utils/rivalCrawler';

const IDLE = { phase: 'idle' };
const idleStore = { getSnapshot: () => IDLE, subscribe: () => () => {} };

const REGISTRATION_STATUS_TEXT = {
  NONE: '이 로그인에서 시작한 연결이 없습니다.',
  EXPIRED: '시작한 지 5분이 지나 연결 시도가 만료됐습니다.',
  CANCELLED: '연결 시도가 취소됐거나 새 시도로 바뀌었습니다.',
  COMPLETED: '이 연결 시도는 이미 처리됐습니다.',
  FAILED: '이 연결 시도는 실패로 끝났습니다.',
};

function Shell({ title, children }) {
  return (
    <main className="mx-auto min-h-screen max-w-md bg-night px-5 py-8 text-text2">
      <p className="font-mono text-[9px] uppercase tracking-[.2em] text-label">iidx code link</p>
      <h1 className="mt-2 text-[18px] text-ink">{title}</h1>
      <div className="mt-4 space-y-3 text-[13px] leading-6">{children}</div>
    </main>
  );
}

function LinkedSummary({ username, binding }) {
  return (
    <dl className="rounded-[4px] border border-line-strong bg-surface p-4 text-[13px]">
      <div className="flex justify-between gap-3"><dt className="text-faint">사이트 계정</dt><dd className="break-all text-ink">{username}</dd></div>
      <div className="mt-2 flex justify-between gap-3"><dt className="text-faint">연결된 IIDX ID</dt><dd className="font-mono text-ink">{binding?.iidxId}</dd></div>
      {binding?.source && <div className="mt-2 flex justify-between gap-3"><dt className="text-faint">연결 방법</dt><dd>{SOURCE_LABELS[binding.source] ?? binding.source}</dd></div>}
      {formatUtcTime(binding?.registeredAt) && <div className="mt-2 flex justify-between gap-3"><dt className="text-faint">연결 시각</dt><dd>{formatUtcTime(binding.registeredAt)}</dd></div>}
    </dl>
  );
}

const BACK = '이 창을 닫고 원래 사이트의 가져오기 화면에서 다시 시작해주세요.';

/**
 * Opened by the bookmarklet from the eagate profile page. Never starts an
 * attempt: it only finishes one the user started on the import screen in this
 * same login. Nothing from the exchange is put in the URL or browser storage.
 */
export default function IidxLinkPopup() {
  const user = useAuthStore((state) => state.user);
  const userId = user?.id;
  const authLoading = useAuthStore((state) => state.isLoading);
  const [session, setSession] = useState(null);
  const store = session ?? idleStore;
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot);

  useEffect(() => {
    // Keyed on the id: a refreshed user object must not restart a running exchange.
    if (authLoading || userId == null) return undefined;
    const next = createLinkSession({ api: rivalCrawlerApi, win: window });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the session is an external store owned by this effect
    setSession(next);
    void next.start();
    return () => { next.dispose(); setSession(null); };
  }, [authLoading, userId]);

  if (authLoading) return <Shell title="로그인 상태 확인 중"><p role="status">잠시만 기다려주세요…</p></Shell>;
  if (!user) {
    return (
      <Shell title="로그인이 필요합니다">
        <p>이 브라우저에서 사이트에 로그인돼 있지 않아 연결을 진행하지 않았습니다.</p>
        <p className="text-muted">연결 시도는 시작한 로그인에서만 이어집니다. 이 창에서 새로 로그인해도 앞서 시작한 시도는 쓸 수 없습니다. 원래 창에서 로그인한 뒤 연결을 처음부터 시작해주세요.</p>
      </Shell>
    );
  }

  switch (view.phase) {
    case 'done':
      return (
        <Shell title="IIDX 코드를 연결했습니다">
          <LinkedSummary username={user.username} binding={view.binding} />
          <p className="text-muted">북마클릿 연결은 코드 소유를 증명하지 않으므로 &lsquo;확인됨&rsquo;으로 표시되지 않습니다.</p>
          {view.bindingChecked === false && <p className="text-muted">현재 연결 상태는 다시 확인하지 못했습니다. 원래 화면에서 새로고침해 확인해주세요.</p>}
          {view.status?.enabled === true
            ? <p>원래 화면을 새로고침하면 내 기록 수집을 요청할 수 있습니다. 서버 상태에 따라 요청이 거절될 수 있습니다.</p>
            : <p className="text-muted">내 기록 수집 상태를 지금은 확인할 수 없습니다. 원래 화면에서 새로고침해 확인해주세요.</p>}
          <p className="text-muted">이 창은 닫아도 됩니다.</p>
        </Shell>
      );
    case 'changed':
      return (
        <Shell title="연결 상태가 바뀌었습니다">
          {view.binding?.iidxId ? (
            <>
              <p>연결 요청은 처리됐지만 지금은 다른 IIDX 코드가 연결돼 있습니다.</p>
              <LinkedSummary username={user.username} binding={view.binding} />
            </>
          ) : (
            <p>연결 요청은 처리됐지만 지금 이 계정에는 연결된 IIDX 코드가 없습니다. 다른 창에서 연결을 해제한 것으로 보입니다.</p>
          )}
          <p className="text-muted">{BACK}</p>
        </Shell>
      );
    case 'linked':
      return (
        <Shell title="이미 연결된 계정입니다">
          <LinkedSummary username={user.username} binding={view.binding} />
          <p className="text-muted">다른 코드로 바꾸려면 원래 화면에서 연결을 해제한 뒤 다시 등록해주세요. 이번 실행에서는 아무것도 보내지 않았습니다.</p>
        </Shell>
      );
    case 'not-pending':
      return (
        <Shell title="진행 중인 연결이 없습니다">
          <p>{REGISTRATION_STATUS_TEXT[view.registrationStatus] ?? '진행 중인 연결 시도를 찾지 못했습니다.'}</p>
          <p className="text-muted">현재 계정: <span className="text-ink">{user.username}</span></p>
          <p className="text-muted">{BACK}</p>
        </Shell>
      );
    case 'no-opener':
      return (
        <Shell title="프로필 창과 연결되지 않았습니다">
          <p>이 창은 e-amusement 프로필 페이지에서 북마클릿으로 열어야 합니다. 직접 열었거나, 브라우저 보안 설정 때문에 두 창의 연결이 끊긴 경우입니다.</p>
          <p className="text-muted">{BACK}</p>
        </Shell>
      );
    case 'failed':
      return (
        <Shell title="연결하지 못했습니다">
          <p role="alert" className="text-danger">{view.error?.message}</p>
          {view.binding?.iidxId && <LinkedSummary username={user.username} binding={view.binding} />}
          <p className="text-muted">{BACK}</p>
        </Shell>
      );
    case 'waiting':
    case 'completing':
      return (
        <Shell title="IIDX 코드를 연결하는 중">
          <p role="status">{view.phase === 'waiting' ? '프로필 창의 응답을 기다리고 있습니다…' : '서버에 연결을 요청하고 결과를 확인하고 있습니다…'}</p>
          <p className="text-muted">연결 대상 계정: <span className="text-ink">{user.username}</span></p>
        </Shell>
      );
    default:
      return <Shell title="연결 상태 확인 중"><p role="status">이 로그인에서 시작한 연결을 확인하고 있습니다…</p></Shell>;
  }
}
