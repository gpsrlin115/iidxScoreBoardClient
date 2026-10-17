import { useCallback, useEffect, useRef, useState } from 'react';
import { BookmarkletInstall } from './BookmarkletInstall';
import { RADAR_URL } from './protocol.js';
import { importsApi } from './importsApi.js';
import { importError } from './importErrors.js';
import { PARSER_VERIFIED } from './parserSource.js';

export function ImportControl({ onImported }) {
  const [attempt, setAttempt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [expired, setExpired] = useState(false);
  const startRequest = useRef(null);
  const readRequest = useRef(null);
  const currentAttempt = useRef(null);
  const checking = useRef(false);

  const check = useCallback(async () => {
    if (!attempt || checking.current || currentAttempt.current !== attempt.attemptId) return;
    checking.current = true;
    const controller = new AbortController();
    readRequest.current = controller;
    try {
      const current = await importsApi.current({ signal: controller.signal });
      if (controller.signal.aborted || currentAttempt.current !== attempt.attemptId) return;
      if (current?.attemptId === attempt.attemptId && current.status === 'COMPLETED') {
        setAttempt(null);
        setError(null);
        onImported?.();
      } else if (current?.attemptId !== attempt.attemptId || current.status !== 'PENDING') {
        setExpired(true);
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(importError(failure));
    } finally {
      checking.current = false;
    }
  }, [attempt, onImported]);

  useEffect(() => {
    if (!attempt) return undefined;
    const timeout = window.setTimeout(() => setExpired(true), Math.max(0, Date.parse(attempt.expiresAt) - Date.now()));
    window.addEventListener('focus', check);
    return () => { window.clearTimeout(timeout); window.removeEventListener('focus', check); readRequest.current?.abort(); };
  }, [attempt, check]);
  useEffect(() => () => { startRequest.current?.abort(); readRequest.current?.abort(); }, []);

  async function begin() {
    if (busy) return;
    setBusy(true);
    setError(null);
    startRequest.current?.abort();
    readRequest.current?.abort();
    currentAttempt.current = null;
    const controller = new AbortController();
    startRequest.current = controller;
    try {
      const next = await importsApi.start({ signal: controller.signal });
      if (!controller.signal.aborted) { currentAttempt.current = next.attemptId; setAttempt(next); setExpired(false); }
    } catch (failure) {
      if (!controller.signal.aborted) setError(importError(failure));
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }

  return (
    <section className="rounded border border-line-strong bg-surface p-4 text-sm" aria-label="공식 레이더 가져오기">
      <h2 className="font-bold text-ink">공식 레이더 가져오기</h2>
      <p className="mt-2 text-muted">로그인한 공식 페이지의 여섯 SP 카테고리를 가져옵니다. 공식 페이지의 기록과 저장된 EX 기록은 각각 관리합니다.</p>
      <button type="button" onClick={begin} disabled={busy || !PARSER_VERIFIED}
        className="mt-3 rounded border border-line-strong px-4 py-2 text-ink disabled:opacity-50">
        {busy ? '가져오기 준비 중…' : attempt ? '새 가져오기 시작' : '공식 레이더 가져오기'}
      </button>
      {!PARSER_VERIFIED && <p className="mt-2 text-muted">공식 페이지 구조를 검증하고 있습니다.</p>}
      {attempt && !expired && <div className="mt-4 space-y-3">
        <ol className="list-inside list-decimal space-y-2 text-text2">
          <li>아래 링크를 브라우저 북마크바로 끌어다 놓습니다.</li>
          <li>공식 노트레이더 페이지를 열고 본인 계정으로 로그인합니다.</li>
          <li>저장한 북마클릿을 누르고 새 창에서 계정과 수치를 확인합니다.</li>
        </ol>
        <BookmarkletInstall />
        <p><a href={RADAR_URL} target="_blank" rel="noreferrer" className="text-accent underline">공식 노트레이더 페이지 열기</a></p>
        <p className="text-xs text-muted">모바일에서는 북마크를 만든 뒤 주소에 위 링크 주소를 붙여 넣고 공식 페이지에서 실행해 주세요. 비밀번호·쿠키·페이지 HTML은 사이트로 보내지 않습니다.</p>
        <button type="button" onClick={check} className="rounded border border-line px-3 py-2">가져오기 결과 확인</button>
      </div>}
      {expired && <p role="status" className="mt-3 text-muted">가져오기 시도가 만료됐거나 새 시도로 바뀌었습니다. 다시 시작해 주세요.</p>}
      {error && <p role="alert" className="mt-3 text-danger">{error}</p>}
    </section>
  );
}
