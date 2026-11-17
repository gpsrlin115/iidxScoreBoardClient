import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import MonoButton from '../../../components/common/MonoButton';
import { normalizeIidxId } from '../../../utils/rivalCrawler';
import { BookmarkletInstall } from './BookmarkletInstall';
import { RADAR_URL } from './protocol.js';
import { importsApi } from './importsApi.js';
import { importError } from './importErrors.js';
import { PARSER_VERIFIED } from './parserSource.js';
import { formatTime } from '../../../i18n/format.js';
import { useLocale } from '../../../i18n/useLocale.js';

export function ImportControl({ onImported, iidxId, linked = true, expanded = true }) {
  useLocale();
  const [attempt, setAttempt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);
  const [expired, setExpired] = useState(false);
  const [completed, setCompleted] = useState(false);
  const startRequest = useRef(null);
  const readRequest = useRef(null);
  const currentAttempt = useRef(null);
  const mounted = useRef(true);
  const onImportedRef = useRef(onImported);
  useEffect(() => { onImportedRef.current = onImported; }, [onImported]);

  const check = useCallback(async () => {
    if (!attempt || readRequest.current || currentAttempt.current !== attempt.attemptId) return;
    const controller = new AbortController();
    readRequest.current = controller;
    setChecking(true);
    try {
      const current = await importsApi.current({ signal: controller.signal });
      if (!mounted.current || controller.signal.aborted || currentAttempt.current !== attempt.attemptId) return;
      if (current?.attemptId === attempt.attemptId && current.status === 'COMPLETED') {
        // Claim this completion synchronously so repeated focus events notify once.
        currentAttempt.current = null;
        setAttempt(null);
        setError(null);
        setCompleted(true);
        try { await onImportedRef.current?.(); }
        catch {
          if (mounted.current) setError('공식 기록은 저장했습니다. 현황을 불러오지 못했습니다. 현황을 새로고침해 주세요.');
        }
      } else if (current?.attemptId !== attempt.attemptId || current.status !== 'PENDING') {
        setExpired(true);
      } else {
        setError(null);
      }
    } catch (failure) {
      if (mounted.current && !controller.signal.aborted) setError(importError(failure));
    } finally {
      if (readRequest.current === controller) {
        readRequest.current = null;
        if (mounted.current) setChecking(false);
      }
    }
  }, [attempt]);

  useEffect(() => {
    if (!attempt) return undefined;
    const timeout = window.setTimeout(() => setExpired(true), Math.max(0, Date.parse(attempt.expiresAt) - Date.now()));
    window.addEventListener('focus', check);
    return () => { window.clearTimeout(timeout); window.removeEventListener('focus', check); };
  }, [attempt, check]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      currentAttempt.current = null;
      startRequest.current?.abort();
      readRequest.current?.abort();
    };
  }, []);

  async function begin() {
    if (!linked || startRequest.current) return;
    const controller = new AbortController();
    startRequest.current = controller;
    setBusy(true);
    setError(null);
    setCompleted(false);
    setAttempt(null);
    readRequest.current?.abort();
    readRequest.current = null;
    setChecking(false);
    currentAttempt.current = null;
    try {
      const next = await importsApi.start({ signal: controller.signal });
      if (mounted.current && !controller.signal.aborted) {
        currentAttempt.current = next.attemptId;
        setAttempt(next);
        setExpired(false);
      }
    } catch (failure) {
      if (mounted.current && !controller.signal.aborted) setError(importError(failure));
    } finally {
      if (startRequest.current === controller) {
        startRequest.current = null;
        if (mounted.current) setBusy(false);
      }
    }
  }

  return (
    <details open={expanded} className="border border-line-strong bg-surface p-4 text-sm sm:p-6">
      <summary className="cursor-pointer font-semibold text-ink">공식 레이더 가져오기</summary>
      <div className="mt-4 space-y-4" aria-label="공식 레이더 가져오기">
        <p className="leading-6 text-muted">공식 페이지의 SP 노트레이더를 가져와 성장 목표를 찾습니다. IIDX 코드 연결과 공식 기록 가져오기는 각각 진행합니다.</p>
        <ol className="space-y-4 text-text2">
          <li><strong className="text-ink">1. 연결된 IIDX 코드 확인</strong>
            <p className="mt-1 text-muted">{linked ? <>연결된 코드 <span className="font-mono text-ink">{normalizeIidxId(iidxId) ?? '확인 필요'}</span></> : '먼저 IIDX 코드를 연결해 주세요.'}</p>
            {!linked && <Link to="/import/csv" className="mt-2 inline-block text-accent underline underline-offset-4">IIDX 코드 연결하기</Link>}
          </li>
          <li><strong className="text-ink">2. 공식 노트레이더 페이지 열기·로그인</strong>
            <p className="mt-1 leading-6 text-muted">아래에서 가져오기를 시작한 뒤 공식 페이지에 로그인합니다.</p>
            {attempt && !expired && <a href={RADAR_URL} target="_blank" rel="noreferrer" className="mt-2 inline-block text-accent underline underline-offset-4">공식 노트레이더 페이지 열기 ↗</a>}
          </li>
          <li><strong className="text-ink">3. 전용 북마클릿 실행</strong>
            {attempt && !expired ? <div className="mt-3"><BookmarkletInstall /></div> : <p className="mt-1 text-muted">가져오기를 시작하면 설치할 북마클릿을 안내합니다.</p>}
          </li>
          <li><strong className="text-ink">4. 새 창에서 계정·작품·SP·여섯 수치 확인</strong></li>
          <li><strong className="text-ink">5. 확인 후 저장하고 현황 보기</strong>
            <p className="mt-1 leading-6 text-muted">기존 공식 수치는 확인 화면에서 저장한 뒤 갱신됩니다.</p>
          </li>
        </ol>
        <p className="text-xs leading-5 text-muted">비밀번호나 쿠키를 입력하지 않습니다. 북마클릿은 필요한 레이더 수치만 전달합니다.</p>
        <div className="flex flex-wrap gap-2">
          <MonoButton onClick={begin} disabled={busy || !linked || !PARSER_VERIFIED}>
            {busy ? '가져오기 준비 중…' : attempt ? '새 가져오기 시작' : '공식 레이더 가져오기'}
          </MonoButton>
          {attempt && <MonoButton variant="ghost" onClick={check} disabled={checking}>{checking ? '결과 확인 중…' : '가져오기 결과 확인'}</MonoButton>}
        </div>
        {!PARSER_VERIFIED && <p className="text-muted">공식 페이지 구조를 검증하고 있습니다.</p>}
        {attempt && !expired && <p role="status" className="text-muted">공식 페이지에서 북마클릿을 실행해 주세요. {formatTime(attempt.expiresAt)}까지 확인할 수 있습니다.</p>}
        {completed && <p role="status" className="text-accent">공식 기록을 저장했습니다. 현황을 새로 불러옵니다.</p>}
        {expired && <p role="status" className="text-muted">가져오기 시도가 만료됐거나 새 시도로 바뀌었습니다. 다시 시작해 주세요.</p>}
        {error && <p role="alert" className="text-danger">{error}</p>}
      </div>
    </details>
  );
}
