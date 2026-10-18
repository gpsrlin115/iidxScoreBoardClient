import { useEffect, useState } from 'react';
import { rivalCrawlerApi } from '../../../api/rivalCrawler';
import { isLinkedBinding, normalizeIidxId } from '../../../utils/rivalCrawler';
import { importError } from './importErrors.js';

export function useImportBinding(userId) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (userId == null) return undefined;
    const controller = new AbortController();
    const finish = (patch) => {
      if (!controller.signal.aborted) setResult({ owner: userId, revision, ...patch });
    };
    const timer = window.setTimeout(() => {
      finish({ error: '연결된 IIDX 코드를 확인하지 못했습니다. 다시 확인해 주세요.' });
      controller.abort();
    }, 10000);
    rivalCrawlerApi.getBinding({ signal: controller.signal })
      .then((binding) => finish({ linked: isLinkedBinding(binding), iidxId: normalizeIidxId(binding?.iidxId) }))
      .catch((error) => finish({ error: importError(error) }))
      .finally(() => window.clearTimeout(timer));
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [userId, revision]);
  const current = result?.owner === userId && result?.revision === revision ? result : null;
  return { ...current, loading: !current, retry: () => setRevision((value) => value + 1) };
}
