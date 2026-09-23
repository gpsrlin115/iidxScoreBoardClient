import { useCallback, useRef, useState } from 'react';
import clsx from 'clsx';
import { layoutAnalysisApi } from '../api/layoutAnalysis';
import { GEOMETRY_SOURCE_LABEL } from '../features/layoutAnalysis/detector';
import { detectGeometryMultiFrame } from '../features/layoutAnalysis/geometryPipeline';
import { analysisStartSeconds } from '../features/layoutAnalysis/videoSampling';
import { recognizeChartText } from '../features/layoutAnalysis/ocr';
import { candidateKey, chartIdentity, SUPPORTED_DIFFICULTIES } from '../features/layoutAnalysis/candidates';
import { describeMatch, selectionAfterRematch } from '../features/layoutAnalysis/matchResult';
import { resetAnalysisArtifacts } from '../features/layoutAnalysis/sessionReset';
import { extractionProblem } from '../features/layoutAnalysis/observedNotes';
import { startAnalysis } from '../features/layoutAnalysis/analysisRun';
import ResultPanel from '../components/layout-analysis/ResultPanel';
import MediaSourcePanel from '../components/layout-analysis/MediaSourcePanel';
import GeometryFields from '../components/layout-analysis/GeometryFields';
import { useAnalysisMedia } from '../features/layoutAnalysis/useAnalysisMedia';
import { supportsRecordedCapture } from '../features/layoutAnalysis/recordedCapture';

const fieldClass = 'w-full border border-line-strong bg-night px-3 py-2 text-sm text-ink outline-none focus:border-accent';
const buttonClass = 'border border-line-strong px-3 py-2 text-xs text-text2 transition hover:border-accent hover:text-ink disabled:cursor-not-allowed disabled:opacity-40';
const errorMessage = (error) => error?.appError?.message || error?.message || String(error);
const MIN_ANALYSIS_SECONDS = 15;

const LayoutAnalysis = () => {
  const runRef = useRef(null);
  const observedNotesRef = useRef(null);

  const [ocr, setOcr] = useState({ titles: [], difficulties: [] });
  const [search, setSearch] = useState('');
  const [manualDifficulty, setManualDifficulty] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('로컬 MP4 파일 또는 YouTube 링크를 준비하세요.');
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [result, setResult] = useState(null);
  const [actionNotice, setActionNotice] = useState('');

  const resetAnalysis = useCallback(
    () => {
      resetAnalysisArtifacts({ setResult, setCandidates, setSelected, observedNotesRef });
      setProgress(0);
      setOcr({ titles: [], difficulties: [] });
      setManualDifficulty('');
      setActionNotice('');
    },
    [],
  );

  const stopRun = useCallback(() => {
    runRef.current?.cancel();
    runRef.current = null;
    setRunning(false);
  }, []);

  const media = useAnalysisMedia({ stopRun, resetAnalysis, setStatus, setSearch });
  const { mode, youtube, captureReady, size, geometry, setGeometry, activeVideo,
    stopTab, fileRef, streamRef, mediaReady } = media;
  const busy = running || recognizing || detecting || media.connecting;

  const findGeometry = async () => {
    if (!mediaReady) return;
    const current = media.sessionGuard();
    setDetecting(true);
    setActionNotice('');
    setStatus('여러 프레임에서 플레이필드와 판정선을 재는 중입니다…');
    try {
      const measured = await detectGeometryMultiFrame(activeVideo(), { contentRect: media.contentRect,
        onProgress: (ratio) => current() && setProgress(Math.round(ratio * 100)) });
      if (!current()) return;
      setGeometry(measured);
      setStatus('판정선과 노트가 보이는 구간까지 실측했습니다. 좌표를 확인하세요.');
    } catch (error) {
      if (current()) { setStatus(errorMessage(error)); setActionNotice(`영역 실측: ${errorMessage(error)}`); }
    } finally {
      setDetecting(false);
      setProgress(0);
    }
  };

  const runOcr = async () => {
    const video = activeVideo();
    if (!mediaReady || !video) return;
    const current = media.sessionGuard();
    setRecognizing(true);
    setActionNotice('');
    setProgress(0);
    setStatus('곡 제목과 난이도 표시를 브라우저에서 인식하는 중입니다…');
    try {
      const value = await recognizeChartText(video, (valueProgress) => current() && setProgress(valueProgress * 100), media.contentRect);
      if (!current()) return;
      setOcr(value);
      if (!search.trim() && value.titles[0]) setSearch(value.titles[0]);
      setStatus(value.titles.length
        ? `읽은 곡명 후보: ${value.titles.slice(0, 3).join(' / ')}${value.difficulties.length ? ` · 난이도 ${value.difficulties.join(', ')}` : ''}`
        : value.raw?.some(Boolean) ? '글자는 읽었지만 제목을 확인하지 못했습니다. OCR 원문을 확인하거나 곡명을 직접 검색하세요.'
          : '문자를 읽지 못했습니다. 곡명을 직접 검색하세요.');
      if (!value.titles.length) setActionNotice('곡·난이도 OCR: 제목을 확인하지 못했습니다. 아래 OCR 원문을 확인하세요.');
    } catch (error) {
      if (current()) { setStatus(errorMessage(error)); setActionNotice(`곡·난이도 OCR: ${errorMessage(error)}`); }
    } finally {
      setRecognizing(false);
      setProgress(0);
    }
  };

  const findCandidates = async () => {
    try {
      setStatus('ScoreBoard 곡 목록에서 후보를 찾는 중입니다…');
      const response = await layoutAnalysisApi.findCandidates({
        videoId: mode === 'youtube' ? youtube?.videoId : null, query: search, titles: ocr.titles,
        difficulties: ocr.difficulties, difficulty: manualDifficulty || null,
      });
      setCandidates(response.candidates || []);
      setSelected(null);
      setStatus(response.candidates?.length ? '정확한 곡과 채보를 선택하세요.' : response.warnings?.[0] || '후보를 찾지 못했습니다.');
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const analyze = async () => {
    const video = activeVideo();
    if (!mediaReady || !video || !geometry || !candidateKey(selected) || (mode === 'youtube' && !captureReady)) {
      setStatus('영상, 분석 영역과 정확한 채보를 모두 준비하세요.');
      return;
    }
    if (mode === 'file' && !('VideoDecoder' in window)) {
      setStatus('로컬 MP4 분석은 Chrome·Edge 94 이상, Firefox 130 이상, Safari 16.4 이상에서 됩니다.');
      return;
    }
    if (mode === 'youtube' && typeof globalThis.MediaStreamTrackProcessor !== 'function' && !supportsRecordedCapture()) {
      setStatus('공유 영상 분석에는 최신 데스크톱 Firefox·Chrome·Edge가 필요합니다.');
      return;
    }
    if (geometry.source === 'browser-auto-fallback') {
      setStatus('자동 검출하거나 좌표 하나를 수정해 플레이필드 영역을 확인하세요.');
      return;
    }
    let source;
    let durationMs = 30_000;
    if (mode === 'file') {
      const startSeconds = analysisStartSeconds(video);
      const remaining = video.duration - startSeconds;
      if (remaining < MIN_ANALYSIS_SECONDS) {
        setStatus(`남은 구간이 ${remaining.toFixed(1)}초뿐입니다. 최소 ${MIN_ANALYSIS_SECONDS}초가 필요합니다. 재생바를 앞쪽으로 옮기세요.`);
        return;
      }
      durationMs = Math.min(30_000, remaining * 1000);
      source = { kind: 'file', file: fileRef.current, startSeconds };
    } else {
      source = { kind: 'stream', track: streamRef.current?.getVideoTracks()[0] };
    }
    stopRun();
    setRunning(true);
    setResult(null);
    setProgress(0);
    setStatus(mode === 'file'
      ? `${Math.round(source.startSeconds)}초부터 ${Math.round(durationMs / 1000)}초 구간을 파일에서 바로 읽는 중입니다. 다른 창을 봐도 됩니다…`
      : media.needsPlayerWindow ? '공유 영상을 30초간 수집한 뒤 분석합니다. 영상 공유 창의 재생을 유지하세요…'
        : '영상은 브라우저에 둔 채 노트 이벤트를 추출하는 중입니다…');
    const run = startAnalysis({
      source, geometry, width: video.videoWidth, height: video.videoHeight, durationMs,
      onProgress: (ratio) => setProgress(ratio * 100),
    });
    runRef.current = run;

    let observedNotes;
    try {
      observedNotes = await run.result;
    } catch (error) {
      if (error?.name === 'AbortError') return;
      setStatus(errorMessage(error));
      stopRun();
      if (mode === 'youtube') stopTab();
      return;
    }
    runRef.current = null;
    observedNotesRef.current = observedNotes;
    const problem = extractionProblem(observedNotes);
    if (problem) {
      setResult({ status: 'NOT_SENT', clientProblem: problem });
      setStatus(problem);
      stopRun();
      if (mode === 'youtube') stopTab();
      return;
    }
    setStatus('5,040개 배열 후보를 비교하는 중입니다…');
    try {
      const match = await layoutAnalysisApi.match({
        inputSource: mode === 'file' ? 'LOCAL_FILE' : 'YOUTUBE_TAB',
        videoId: mode === 'youtube' ? youtube?.videoId : null,
        ...chartIdentity(selected),
        observedNotes,
      });
      setResult(match);
      setProgress(100);
      setStatus(describeMatch(match));
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      stopRun();
      if (mode === 'youtube') stopTab();
    }
  };

  const rematchSuggested = async () => {
    const observedNotes = observedNotesRef.current;
    const textageChartKey = result?.suggestedTextageChartKey;
    if (!observedNotes || !textageChartKey) return;
    setStatus('제안된 채보로 다시 대조하는 중입니다…');
    try {
      const match = await layoutAnalysisApi.match({
        inputSource: mode === 'file' ? 'LOCAL_FILE' : 'YOUTUBE_TAB',
        videoId: mode === 'youtube' ? youtube?.videoId : null,
        textageChartKey,
        observedNotes,
      });
      setResult(match);
      setSelected(selectionAfterRematch(match) ?? selected);
      setStatus(describeMatch(match));
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const cancel = () => {
    stopRun();
    if (mode === 'youtube') stopTab();
    setStatus('분석을 취소했습니다.');
  };

  return (
    <div className="mx-auto grid w-full max-w-[1320px] gap-5 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="grid min-w-0 gap-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[.22em] text-accent">video stays in your browser</p>
          <h1 className="mt-1 text-2xl font-medium text-ink">IIDX 랜덤 배치 분석</h1>
          <p className="mt-2 text-sm text-muted">영상 프레임은 업로드하지 않고 시간·레인 이벤트만 서버에서 정규 채보와 비교합니다.</p>
        </div>

        <MediaSourcePanel media={media} busy={busy} />

        <div className="flex flex-wrap items-center gap-2 border border-line bg-panel p-4">
          <button className={buttonClass} type="button" onClick={findGeometry} disabled={!mediaReady || busy}>영역 실측</button>
          <button className={buttonClass} type="button" onClick={runOcr} disabled={!mediaReady || busy}>곡·난이도 OCR</button>
          <input className={clsx(fieldClass, 'min-w-[220px] flex-1')} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="곡명 직접 검색" disabled={running} />
          <select className={fieldClass} value={manualDifficulty} onChange={(event) => setManualDifficulty(event.target.value)} disabled={running} aria-label="난이도 직접 선택">
            <option value="">난이도 자동</option>
            {SUPPORTED_DIFFICULTIES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <button className={buttonClass} type="button" onClick={findCandidates} disabled={busy}>채보 후보 찾기</button>
        </div>

        {actionNotice && <p role="alert" className="border-l-2 border-danger px-3 text-xs text-danger">{actionNotice}</p>}
        {mode === 'youtube' && ocr.raw?.length > 0 && <details className="border border-line p-3 text-xs text-text2"><summary>OCR 원문 보기</summary><pre className="mt-2 whitespace-pre-wrap break-all">{ocr.raw.join('\n---\n').slice(0, 2000)}</pre></details>}

        {candidates.length > 0 && <div className="grid gap-2 md:grid-cols-3">{candidates.map((candidate) => (
          <label key={candidateKey(candidate)} className={clsx('cursor-pointer border bg-panel p-4', candidateKey(selected) === candidateKey(candidate) ? 'border-accent' : 'border-line')}>
            <input type="radio" name="layout-analysis-candidate" className="mr-2 accent-accent" checked={candidateKey(selected) === candidateKey(candidate)} onChange={() => setSelected(candidate)} />
            <strong className="text-sm text-ink">{candidate.title}</strong>
            <span className="mt-2 block font-mono text-[10px] text-muted">{candidate.chartType} · ☆{candidate.level} · {Math.round(candidate.score * 100)}%</span>
            <span className="mt-1 block truncate text-[10px] text-faint">{[candidate.artist, candidate.version].filter(Boolean).join(' · ')}</span>
          </label>
        ))}</div>}

        <div className="flex items-center gap-3 border border-line bg-panel p-4">
          <div className="min-w-0 flex-1"><strong className="block text-sm text-ink">{status}</strong><progress className="mt-2 h-1.5 w-full accent-accent" value={progress} max="100" /></div>
          {running ? <button className={buttonClass} type="button" onClick={cancel}>취소</button> : <button className={clsx(buttonClass, 'border-accent text-accent')} type="button" onClick={analyze} disabled={!mediaReady || !candidateKey(selected) || !geometry || geometry.source === 'browser-auto-fallback' || busy}>30초 분석</button>}
        </div>

        <ResultPanel
          result={result}
          canRematch={Boolean(observedNotesRef.current)}
          onRematch={rematchSuggested}
          busy={running}
          observedNotes={observedNotesRef.current}
          videoId={mode === 'youtube' ? youtube?.videoId ?? null : null}
        />
      </section>

      <aside className="h-fit border border-line bg-panel p-4 lg:sticky lg:top-20">
        <h2 className="text-sm font-medium text-ink">분석 영역</h2>
        <p className="my-3 text-xs text-muted">SUDDEN+·HIDDEN+·LIFT 수치를 추측하지 않고 실제 보이는 영역과 판정선을 사용합니다.</p>
        {geometry && <p className={clsx('mb-3 font-mono text-[10px]', geometry.source === 'browser-auto-fallback' ? 'text-danger' : 'text-accent')}>
          {GEOMETRY_SOURCE_LABEL[geometry.source] || geometry.source}
        </p>}
        <GeometryFields geometry={geometry} size={size} onChange={setGeometry} disabled={busy} />
        <div className="mt-4 border-l-2 border-accent bg-night p-3 text-[11px] leading-relaxed text-muted">서버 요청에는 영상·Blob·이미지가 포함되지 않습니다. YouTube 공유 트랙은 완료·취소·화면 전환 시 정지됩니다.</div>
      </aside>
    </div>
  );
};

export default LayoutAnalysis;
