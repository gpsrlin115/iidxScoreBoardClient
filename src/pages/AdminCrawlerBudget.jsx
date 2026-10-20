import { useCallback, useEffect, useRef, useState } from 'react';
import { adminCrawlerApi } from '../api/adminCrawler';
import RequestBudgetPanel from '../components/admin/RequestBudgetPanel';
import { budgetErrorMessage } from '../utils/requestBudget';

const RELEASE_CONFIRM = 'eagate가 요청한 대기를 무시하고 서버 수집을 다시 시작합니다.\n'
  + '제보 등으로 비정상 값이 확인됐을 때만 쓰세요. 계속할까요?';
// The block decision comes from the server; this only re-renders "time left".
const CLOCK_TICK_MS = 30000;

const isCancel = (error) => error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED';

export default function AdminCrawlerBudget() {
  const [budget, setBudget] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // A ref, not state: two clicks in the same tick must not both pass the check.
  const releaseLock = useRef(false);
  const readAbort = useRef(null);

  const load = useCallback(async () => {
    readAbort.current?.abort();
    const abort = new AbortController();
    readAbort.current = abort;
    setLoading(true);
    try {
      const data = await adminCrawlerApi.getRequestBudget({ signal: abort.signal });
      if (abort.signal.aborted) return;
      setBudget(data);
      setError(null);
      setNowMs(Date.now());
    } catch (err) {
      if (abort.signal.aborted || isCancel(err)) return;
      setError(budgetErrorMessage(err));
    } finally {
      if (readAbort.current === abort) {
        readAbort.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first read is this effect's job
    void load();
    return () => readAbort.current?.abort();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const release = async () => {
    if (releaseLock.current || !budget?.blocked) return;
    if (!window.confirm(RELEASE_CONFIRM)) return;
    releaseLock.current = true;
    readAbort.current?.abort();
    setReleasing(true);
    try {
      setBudget(await adminCrawlerApi.releaseBlock());
      setError(null);
      setNowMs(Date.now());
    } catch (err) {
      // Never retried automatically: the admin decides after reading the state again.
      setError(budgetErrorMessage(err));
    } finally {
      releaseLock.current = false;
      setReleasing(false);
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-6 sm:px-8 sm:py-8">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[.2em] text-label">admin · crawler</p>
      <h1 className="mb-3 text-2xl font-medium text-ink">eagate 요청 예산</h1>
      <p className="mb-8 text-sm leading-6 text-muted">서버 수집(개인·라이벌)이 함께 쓰는 eagate 요청 예산과 전역 차단 상태입니다.</p>
      {error && <p role="alert" className="mb-6 border border-line-strong bg-panel p-4 text-sm leading-6 text-danger">{error}</p>}
      {budget
        ? <RequestBudgetPanel budget={budget} nowMs={nowMs} loading={loading} releasing={releasing}
            onRefresh={load} onRelease={release} />
        : loading && <p role="status" className="text-sm text-muted">예산 상태를 불러오고 있습니다…</p>}
      {!budget && !loading && error && (
        <button type="button" className="mt-2 text-sm text-info underline underline-offset-2" onClick={() => load()}>다시 시도</button>
      )}
    </div>
  );
}
