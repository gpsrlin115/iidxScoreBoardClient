import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { layoutAnalysisApi } from '../api/layoutAnalysis';
import { attachStream, parseYouTubeVideoId, requestYouTubeTab, stopCapture, youtubeEmbedUrl } from '../features/layoutAnalysis/capture';
import { defaultGeometry, detectGeometry, sanitizeGeometry } from '../features/layoutAnalysis/detector';
import { recognizeChartText } from '../features/layoutAnalysis/ocr';
import { candidateKey, describeMatch } from '../features/layoutAnalysis/candidates';

const fieldClass = 'w-full border border-line-strong bg-night px-3 py-2 text-sm text-ink outline-none focus:border-accent';
const buttonClass = 'border border-line-strong px-3 py-2 text-xs text-text2 transition hover:border-accent hover:text-ink disabled:cursor-not-allowed disabled:opacity-40';
const errorMessage = (error) => error?.appError?.message || error?.message || String(error);

const seek = (video, seconds) => new Promise((resolve, reject) => {
  const timeout = window.setTimeout(() => reject(new Error('영상의 시작 위치로 이동하지 못했습니다.')), 5_000);
  const done = () => { window.clearTimeout(timeout); resolve(); };
  video.addEventListener('seeked', done, { once: true });
  video.currentTime = seconds;
});

const GeometryFields = ({ geometry, size, onChange, disabled }) => {
  if (!geometry) return null;
  const fields = [
    ['X', 'x'], ['Y', 'y'], ['폭', 'width'], ['높이', 'height'],
    ['가시 상단', 'visibleTopY'], ['가시 하단', 'visibleBottomY'], ['판정선', 'judgementY'],
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {fields.map(([label, key]) => (
        <label key={key} className="grid gap-1 text-[11px] text-label">
          {label}
          <input
            className={fieldClass}
            type="number"
            value={geometry[key]}
            disabled={disabled}
            onChange={(event) => onChange(sanitizeGeometry({ ...geometry, [key]: Number(event.target.value), source: 'browser-manual', confidence: 1 }, size.width, size.height))}
          />
        </label>
      ))}
    </div>
  );
};

const LayoutAnalysis = () => {
  const fileVideoRef = useRef(null);
  const captureVideoRef = useRef(null);
  const iframeRef = useRef(null);
  const streamRef = useRef(null);
  const workerRef = useRef(null);
  const frameCallbackRef = useRef(null);
  const finishingRef = useRef(false);
  const objectUrlRef = useRef(null);
  // Kept so a DIFFICULTY_MISMATCH can be re-matched against the suggested chart
  // without re-analysing the video, which would cost another tab share.
  const observedNotesRef = useRef(null);

  const [mode, setMode] = useState('file');
  const [fileUrl, setFileUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtube, setYoutube] = useState(null);
  const [captureReady, setCaptureReady] = useState(false);
  const [restrictedCapture, setRestrictedCapture] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0, duration: 0, fps: 60 });
  const [geometry, setGeometry] = useState(null);
  const [ocr, setOcr] = useState({ titles: [], difficulties: [] });
  const [search, setSearch] = useState('');
  const [manualDifficulty, setManualDifficulty] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('로컬 MP4 파일 또는 YouTube 링크를 준비하세요.');
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [result, setResult] = useState(null);

  const activeVideo = useCallback(() => mode === 'file' ? fileVideoRef.current : captureVideoRef.current, [mode]);

  const stopWorker = useCallback(() => {
    const video = activeVideo();
    if (video && frameCallbackRef.current !== null && 'cancelVideoFrameCallback' in video) {
      video.cancelVideoFrameCallback(frameCallbackRef.current);
    }
    frameCallbackRef.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
    finishingRef.current = false;
    setRunning(false);
  }, [activeVideo]);

  const stopTab = useCallback(() => {
    stopCapture(streamRef.current);
    streamRef.current = null;
    if (captureVideoRef.current) captureVideoRef.current.srcObject = null;
    setCaptureReady(false);
    setRestrictedCapture(false);
  }, []);

  useEffect(() => () => {
    stopWorker();
    stopTab();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, [stopTab, stopWorker]);

  const chooseFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== 'video/mp4' && !file.name.toLowerCase().endsWith('.mp4')) {
      setStatus('H.264 MP4 파일만 지원합니다.');
      return;
    }
    stopWorker();
    stopTab();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    setFileUrl(objectUrlRef.current);
    setResult(null);
    setCandidates([]);
    setSelected(null);
    setStatus('영상 정보를 읽는 중입니다…');
  };

  const onFileMetadata = () => {
    const video = fileVideoRef.current;
    if (!video) return;
    if (video.videoWidth < 1280 || video.videoHeight < 720) {
      setStatus('최소 720p 영상이 필요합니다.');
      return;
    }
    const nextSize = { width: video.videoWidth, height: video.videoHeight, duration: video.duration, fps: 60 };
    setSize(nextSize);
    setGeometry(defaultGeometry(nextSize.width, nextSize.height));
    setStatus('플레이 중인 프레임에서 분석 영역을 자동 검출하거나 직접 보정하세요.');
  };

  const loadYouTube = async () => {
    try {
      parseYouTubeVideoId(youtubeUrl);
      stopTab();
      setStatus('YouTube 메타데이터를 확인하는 중입니다…');
      const metadata = await layoutAnalysisApi.getYouTubeMetadata(youtubeUrl.trim());
      setYoutube(metadata);
      setSearch(metadata.title || '');
      setCandidates([]);
      setSelected(null);
      setStatus(metadata.metadataAvailable
        ? '영상을 처음부터 재생한 뒤 현재 탭 공유를 누르세요.'
        : '메타데이터를 가져오지 못했습니다. 영상 재생 후 OCR 또는 직접 검색을 사용하세요.');
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const shareTab = async () => {
    if (!youtube || !captureVideoRef.current) return;
    stopTab();
    try {
      setStatus('공유 목록에서 이 YouTube 탭을 선택하세요…');
      const stream = await requestYouTubeTab(navigator.mediaDevices, iframeRef.current);
      streamRef.current = stream;
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        stopWorker();
        stopTab();
        setStatus('탭 공유가 종료됐습니다.');
      }, { once: true });
      await attachStream(captureVideoRef.current, stream);
      const video = captureVideoRef.current;
      if (video.videoWidth < 1280 || video.videoHeight < 720) throw new Error('최소 720p로 공유되는 탭이 필요합니다.');
      const nextSize = { width: video.videoWidth, height: video.videoHeight, duration: 30, fps: 60 };
      setSize(nextSize);
      setGeometry(defaultGeometry(nextSize.width, nextSize.height));
      setCaptureReady(true);
      setRestrictedCapture(Boolean(stream.iidaranElementRestricted));
      setStatus(stream.iidaranElementRestricted
        ? 'YouTube 플레이어 영역만 연결했습니다. 실제 플레이 시작 지점에서 분석하세요.'
        : '전체 탭이 연결됐습니다. 영역 검출 결과를 반드시 확인하세요.');
    } catch (error) {
      stopTab();
      setStatus(errorMessage(error));
    }
  };

  const findGeometry = () => {
    try {
      setGeometry(detectGeometry(activeVideo()));
      setStatus('현재 프레임에서 플레이필드 후보를 찾았습니다. 좌표를 확인하세요.');
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const runOcr = async () => {
    const video = activeVideo();
    if (!video) return;
    setRecognizing(true);
    setProgress(0);
    setStatus('곡 제목과 난이도 표시를 브라우저에서 인식하는 중입니다…');
    try {
      const value = await recognizeChartText(video, (valueProgress) => setProgress(valueProgress * 100));
      setOcr(value);
      setSearch(value.titles[0] || search);
      setStatus(value.titles.length ? 'OCR 후보를 만들었습니다. 채보 후보를 확인하세요.' : '문자를 읽지 못했습니다. 곡명을 직접 검색하세요.');
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setRecognizing(false);
      setProgress(0);
    }
  };

  const findCandidates = async () => {
    try {
      setStatus('ScoreBoard 곡 목록에서 후보를 찾는 중입니다…');
      const difficulties = [...new Set([...ocr.difficulties, manualDifficulty].filter(Boolean))];
      const response = await layoutAnalysisApi.findCandidates({ videoId: youtube?.videoId, query: search, titles: ocr.titles, difficulties });
      setCandidates(response.candidates || []);
      setSelected(null);
      setStatus(response.candidates?.length ? '정확한 곡과 채보를 선택하세요.' : response.warnings?.[0] || '후보를 찾지 못했습니다.');
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const finishWorker = () => {
    if (finishingRef.current || !workerRef.current) return;
    finishingRef.current = true;
    const video = activeVideo();
    if (video && frameCallbackRef.current !== null) video.cancelVideoFrameCallback(frameCallbackRef.current);
    frameCallbackRef.current = null;
    video?.pause();
    workerRef.current.postMessage({ type: 'finish' });
    setStatus('5,040개 배열 후보를 비교하는 중입니다…');
  };

  const analyze = async () => {
    const video = activeVideo();
    if (!video || !geometry || !candidateKey(selected) || (mode === 'youtube' && !captureReady)) {
      setStatus('영상, 분석 영역과 정확한 채보를 모두 준비하세요.');
      return;
    }
    if (!('requestVideoFrameCallback' in video) || !('VideoFrame' in window)) {
      setStatus('최신 데스크톱 Chrome 또는 Edge가 필요합니다.');
      return;
    }
    if (geometry.source === 'browser-auto-fallback') {
      setStatus('자동 검출하거나 좌표 하나를 수정해 플레이필드 영역을 확인하세요.');
      return;
    }
    stopWorker();
    setRunning(true);
    setResult(null);
    setProgress(0);
    finishingRef.current = false;
    if (mode === 'file') {
      try { await seek(video, 0); } catch (error) { setStatus(errorMessage(error)); stopWorker(); return; }
    }
    const durationMs = mode === 'file' ? Math.min(30_000, video.duration * 1000) : 30_000;
    const worker = new Worker(new URL('../features/layoutAnalysis/detector.worker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.postMessage({ type: 'init', width: video.videoWidth, height: video.videoHeight, fps: size.fps, durationMs, geometry });
    worker.onmessage = async ({ data }) => {
      if (data.type === 'progress') setProgress(Math.min(100, data.timestampMs / durationMs * 100));
      if (data.type === 'error') { setStatus(data.message); stopWorker(); }
      if (data.type === 'result') {
        observedNotesRef.current = data.observedNotes;
        try {
          const match = await layoutAnalysisApi.match({
            inputSource: mode === 'file' ? 'LOCAL_FILE' : 'YOUTUBE_TAB',
            videoId: youtube?.videoId,
            chartId: selected.chartId ?? null,
            songKey: selected.songKey ?? null,
            observedNotes: data.observedNotes,
          });
          setResult(match);
          setProgress(100);
          setStatus(describeMatch(match));
        } catch (error) {
          setStatus(errorMessage(error));
        } finally {
          stopWorker();
          if (mode === 'youtube') stopTab();
        }
      }
    };
    const startedAt = performance.now();
    const sendFrame = (now, metadata) => {
      if (!workerRef.current || finishingRef.current) return;
      const timestampMs = mode === 'file' ? metadata.mediaTime * 1000 : now - startedAt;
      if (timestampMs >= durationMs || video.ended) { finishWorker(); return; }
      const frame = new VideoFrame(video, { timestamp: Math.round(timestampMs * 1000) });
      workerRef.current.postMessage({ type: 'frame', frame, timestampMs }, [frame]);
      frameCallbackRef.current = video.requestVideoFrameCallback(sendFrame);
    };
    frameCallbackRef.current = video.requestVideoFrameCallback(sendFrame);
    video.addEventListener('ended', finishWorker, { once: true });
    setStatus('영상은 브라우저에 둔 채 노트 이벤트를 추출하는 중입니다…');
    try { await video.play(); } catch (error) { setStatus(errorMessage(error)); stopWorker(); }
  };

  const rematchSuggested = async () => {
    const observedNotes = observedNotesRef.current;
    const songKey = result?.suggestedSongKey;
    if (!observedNotes || !songKey) return;
    setStatus('제안된 채보로 다시 대조하는 중입니다…');
    try {
      const match = await layoutAnalysisApi.match({
        inputSource: mode === 'file' ? 'LOCAL_FILE' : 'YOUTUBE_TAB',
        videoId: youtube?.videoId,
        chartId: result.suggestedChartId ?? null,
        songKey,
        observedNotes,
      });
      setResult(match);
      setStatus(describeMatch(match));
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const cancel = () => {
    workerRef.current?.postMessage({ type: 'cancel' });
    stopWorker();
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

        <div className="border border-line bg-panel p-4">
          <div className="mb-3 flex gap-2">
            {['file', 'youtube'].map((value) => <button key={value} type="button" className={clsx(buttonClass, mode === value && 'border-accent text-accent')} onClick={() => { stopWorker(); stopTab(); setMode(value); }} disabled={running}>{value === 'file' ? '로컬 MP4' : 'YouTube 링크'}</button>)}
          </div>
          {mode === 'file' ? (
            <input className={fieldClass} type="file" accept="video/mp4,.mp4" onChange={chooseFile} disabled={running} />
          ) : (
            <div className="flex gap-2">
              <input className={fieldClass} type="url" value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." disabled={running} />
              <button className={buttonClass} type="button" onClick={loadYouTube} disabled={running}>확인</button>
              <button className={buttonClass} type="button" onClick={shareTab} disabled={!youtube || running}>현재 탭 공유</button>
            </div>
          )}
        </div>

        <div className="relative grid min-h-[360px] place-items-center overflow-hidden border border-line bg-black">
          {mode === 'file' && fileUrl ? <video ref={fileVideoRef} src={fileUrl} muted playsInline onLoadedMetadata={onFileMetadata} className="max-h-[70vh] w-full object-contain" /> : null}
          {mode === 'youtube' && youtube ? <iframe ref={iframeRef} title="YouTube IIDX 영상" src={youtubeEmbedUrl(youtube.videoId)} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen className="aspect-video w-full border-0" /> : null}
          {mode === 'youtube' ? <video ref={captureVideoRef} muted playsInline className={restrictedCapture || !captureReady ? 'hidden' : 'max-h-[70vh] w-full object-contain'} /> : null}
          {((mode === 'file' && !fileUrl) || (mode === 'youtube' && !youtube)) && <span className="text-sm text-faint2">영상을 선택하세요.</span>}
        </div>

        <div className="flex flex-wrap items-center gap-2 border border-line bg-panel p-4">
          <button className={buttonClass} type="button" onClick={findGeometry} disabled={!size.width || running}>현재 프레임에서 영역 찾기</button>
          <button className={buttonClass} type="button" onClick={runOcr} disabled={!size.width || running || recognizing}>곡·난이도 OCR</button>
          <input className={clsx(fieldClass, 'min-w-[220px] flex-1')} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="곡명 직접 검색" disabled={running} />
          <select className={fieldClass} value={manualDifficulty} onChange={(event) => setManualDifficulty(event.target.value)} disabled={running} aria-label="난이도 직접 선택">
            <option value="">난이도 자동</option>
            {['BEGINNER', 'NORMAL', 'HYPER', 'ANOTHER', 'LEGGENDARIA'].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <button className={buttonClass} type="button" onClick={findCandidates} disabled={running || recognizing}>채보 후보 찾기</button>
        </div>

        {candidates.length > 0 && <div className="grid gap-2 md:grid-cols-3">{candidates.map((candidate) => (
          <label key={candidateKey(candidate)} className={clsx('cursor-pointer border bg-panel p-4', candidateKey(selected) === candidateKey(candidate) ? 'border-accent' : 'border-line')}>
            <input type="radio" name="layout-analysis-candidate" className="mr-2 accent-accent" checked={candidateKey(selected) === candidateKey(candidate)} onChange={() => setSelected(candidate)} />
            <strong className="text-sm text-ink">{candidate.title}</strong>
            <span className="mt-2 block font-mono text-[10px] text-muted">{candidate.chartType} · ☆{candidate.level} · {Math.round(candidate.score * 100)}%</span>
          </label>
        ))}</div>}

        <div className="flex items-center gap-3 border border-line bg-panel p-4">
          <div className="min-w-0 flex-1"><strong className="block truncate text-sm text-ink">{status}</strong><progress className="mt-2 h-1.5 w-full accent-accent" value={progress} max="100" /></div>
          {running ? <button className={buttonClass} type="button" onClick={cancel}>취소</button> : <button className={clsx(buttonClass, 'border-accent text-accent')} type="button" onClick={analyze}>30초 분석</button>}
        </div>

        {result && <div className="border border-line bg-panel p-5">
          <span className="font-mono text-xs font-bold text-accent">{result.status}</span>
          <h2 className="mt-3 text-lg text-ink">{result.chart?.title} · {result.chart?.chartType}</h2>
          {result.candidates?.map((candidate) => <div key={candidate.regularToPlayed} className="mt-3 border border-line bg-night p-4"><strong className="font-mono text-xl text-ink">{candidate.display || `S+1234567 → S+${candidate.playedLaneSources}`}</strong><p className="mt-1 text-xs text-muted">실제 각 레인에 들어온 정규 채보 키 순서 · 신뢰도 {candidate.confidenceBand}</p></div>)}
          {(result.laneMapping?.side || result.side) && <p className="mt-2 font-mono text-[11px] text-muted">플레이 사이드 {result.laneMapping?.side || result.side}</p>}
          {result.reason === 'DIFFICULTY_MISMATCH' && result.suggestedSongKey && observedNotesRef.current && (
            <button className={clsx(buttonClass, 'mt-3')} type="button" onClick={rematchSuggested}>
              제안된 채보({result.suggestedSongKey})로 다시 대조 · 분석 횟수 1회 사용
            </button>
          )}
          {result.warnings?.map((warning) => <p key={warning} className="mt-2 text-xs text-danger">{warning}</p>)}
          {result.reference && <p className="mt-4 break-all text-[11px] text-faint"><a href={result.reference.sourceUrl} target="_blank" rel="noreferrer">Textage 출처</a> · SHA-256 {result.reference.sourceSha256}</p>}
        </div>}
      </section>

      <aside className="h-fit border border-line bg-panel p-4 lg:sticky lg:top-20">
        <h2 className="text-sm font-medium text-ink">분석 영역</h2>
        <p className="my-3 text-xs text-muted">SUDDEN+·HIDDEN+·LIFT 수치를 추측하지 않고 실제 보이는 영역과 판정선을 사용합니다.</p>
        <GeometryFields geometry={geometry} size={size} onChange={setGeometry} disabled={running} />
        <div className="mt-4 border-l-2 border-accent bg-night p-3 text-[11px] leading-relaxed text-muted">서버 요청에는 영상·Blob·이미지가 포함되지 않습니다. YouTube 공유 트랙은 완료·취소·화면 전환 시 정지됩니다.</div>
      </aside>
    </div>
  );
};

export default LayoutAnalysis;
