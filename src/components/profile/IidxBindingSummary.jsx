import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rivalCrawlerApi } from '../../api/rivalCrawler';
import { isLinkedBinding, normalizeIidxId, SOURCE_LABELS } from '../../utils/rivalCrawler';

// Read-only view. Linking and unlinking stay on the import screen, where the
// collection job state that gates them is shown.
const IidxBindingSummary = () => {
  const [binding, setBinding] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    rivalCrawlerApi.getBinding({ signal: abort.signal })
      .then((data) => { if (!abort.signal.aborted) setBinding(data ?? {}); })
      .catch(() => { if (!abort.signal.aborted) setFailed(true); });
    return () => abort.abort();
  }, []);

  const linked = isLinkedBinding(binding);

  return (
    <section className="mb-6 border border-line-strong bg-panel p-5 sm:p-7" aria-labelledby="profile-iidx-title">
      <h2 id="profile-iidx-title" className="mb-3 text-lg text-ink">IIDX 코드</h2>
      {failed && <p role="alert" className="text-sm text-muted">연결 상태를 불러오지 못했습니다.</p>}
      {!failed && !binding && <p role="status" className="text-sm text-muted">연결 상태를 확인하고 있습니다…</p>}
      {!failed && binding && (linked ? (
        <>
          <p className="text-sm text-ink">
            연결된 IIDX ID: <span className="font-mono">{normalizeIidxId(binding.iidxId)}</span>
            {binding.verified === true && <span className="ml-2 text-accent">확인됨</span>}
          </p>
          {SOURCE_LABELS[binding.source] && <p className="mt-2 text-xs text-muted">연결 방법 · {SOURCE_LABELS[binding.source]}</p>}
        </>
      ) : <p className="text-sm text-muted">연결 안 됨</p>)}
      <p className="mt-4 text-xs leading-5 text-muted">
        IIDX 코드는 직접 입력하지 않습니다. 연결과 해제는 가져오기 화면에서 할 수 있습니다.
        {' '}
        <Link to="/import/csv" className="text-info underline underline-offset-2">가져오기 화면으로 이동</Link>
      </p>
    </section>
  );
};

export default IidxBindingSummary;
