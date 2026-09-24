import { useCallback, useEffect, useRef, useState } from 'react';
import { layoutAnalysisApi } from '../../api/layoutAnalysis';
import { attachStream, parseYouTubeVideoId, requestYouTubeTab, stopCapture } from './capture';
import { defaultGeometry } from './detector';
import { sampleLiveFrames } from './liveSampling';
import { supportsRecordedCapture } from './recordedCapture';
import { detectContentRect, validContentRect } from './contentRegion';

const EMPTY_SIZE = { width: 0, height: 0, duration: 0, fps: 60 };
const SHARE_GUIDE = '영상을 재생한 뒤 “분석용 화면 연결”을 누르고, 공유 목록에서 이 ScoreBoard 탭을 선택하세요.';
const errorMessage = (error) => error?.appError?.message || error?.message || String(error);
const captureSnapshot = (frame, width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(frame, 0, 0);
  return { src: canvas.toDataURL('image/webp', 0.88), pixels: context.getImageData(0, 0, width, height) };
};

/** Owns each input session, including metadata requests and the share picker. */
export const useAnalysisMedia = ({ stopRun, resetAnalysis, setStatus, setSearch }) => {
  const fileVideoRef = useRef(null);
  const captureVideoRef = useRef(null);
  const captureTargetRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const objectUrlRef = useRef(null);
  const generation = useRef(0);
  const playerWindowRef = useRef(null);
  const needsPlayerWindow = typeof globalThis.MediaStreamTrackProcessor !== 'function';
  const shareGuide = needsPlayerWindow
    ? '“영상 공유 창 열기”로 영상을 재생하고, “분석용 화면 연결”에서 그 창을 선택하세요.' : SHARE_GUIDE;
  const [mode, setMode] = useState('file');
  const [fileUrl, setFileUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtube, setYoutube] = useState(null);
  const [captureReady, setCaptureReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [connectionError, setConnectionError] = useState(false);
  const [size, setSize] = useState(EMPTY_SIZE);
  const [geometry, setGeometry] = useState(null);
  const [contentRect, setContentRect] = useState(null);
  const [previewSrc, setPreviewSrc] = useState('');

  const stopTab = useCallback(() => {
    generation.current += 1;
    stopCapture(streamRef.current);
    streamRef.current = null;
    if (captureVideoRef.current) {
      captureVideoRef.current.onresize = null;
      captureVideoRef.current.srcObject = null;
    }
    setCaptureReady(false);
    setConnecting(false);
    setConnectionMessage('');
    setConnectionError(false);
    setContentRect(null);
    setPreviewSrc('');
  }, []);

  useEffect(() => () => {
    stopRun();
    stopTab();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, [stopRun, stopTab]);

  const resetInput = () => {
    stopRun();
    stopTab();
    resetAnalysis();
    setSize(EMPTY_SIZE);
    setGeometry(null);
    setSearch('');
  };
  const switchMode = (value) => {
    if (value === mode) return;
    resetInput();
    setMode(value);
    setStatus(value === 'youtube' ? 'YouTube 링크를 입력하고 영상을 불러오세요.' : '로컬 MP4 파일을 준비하세요.');
  };
  const chooseFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== 'video/mp4' && !file.name.toLowerCase().endsWith('.mp4')) {
      setStatus('MP4 파일만 지원합니다.');
      return;
    }
    resetInput();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    fileRef.current = file;
    setFileUrl(objectUrlRef.current);
    setStatus('영상 정보를 읽는 중입니다…');
  };
  const onFileMetadata = () => {
    const video = fileVideoRef.current;
    if (!video) return;
    if (video.videoWidth < 1280 || video.videoHeight < 720) {
      setSize(EMPTY_SIZE);
      setGeometry(null);
      setStatus('최소 720p 영상이 필요합니다.');
      return;
    }
    setSize({ width: video.videoWidth, height: video.videoHeight, duration: video.duration, fps: 60 });
    setGeometry(defaultGeometry(video.videoWidth, video.videoHeight));
    setStatus('“영역 실측”을 누르거나 분석 영역을 직접 보정하세요.');
  };

  const loadYouTube = async () => {
    let videoId;
    try { videoId = parseYouTubeVideoId(youtubeUrl); }
    catch (error) { setStatus(errorMessage(error)); return; }
    resetInput();
    const request = generation.current;
    setYoutube({ videoId, metadataAvailable: false });
    setStatus(shareGuide);
    try {
      const metadata = await layoutAnalysisApi.getYouTubeMetadata(youtubeUrl.trim());
      // Sharing or switching inputs must not be overwritten by a late response.
      if (request !== generation.current) return;
      setYoutube({ ...metadata, videoId });
      if (metadata.title) setSearch(metadata.title);
      setStatus(metadata.metadataAvailable ? shareGuide : `제목 정보를 가져오지 못했지만 분석할 수 있습니다. ${shareGuide}`);
    } catch {
      if (request === generation.current) setStatus(`제목 정보를 가져오지 못했지만 분석할 수 있습니다. ${shareGuide}`);
    }
  };

  const openPlayerWindow = () => {
    if (!youtube) return;
    playerWindowRef.current = window.open(`/layout-analysis-player.html?videoId=${youtube.videoId}`,
      'iidx-layout-player', 'popup,width=1280,height=760');
    if (!playerWindowRef.current) {
      setConnectionError(true);
      setConnectionMessage('영상 공유 창을 열지 못했습니다. 이 사이트의 팝업을 허용한 뒤 다시 누르세요.');
    } else {
      setConnectionError(false);
      setConnectionMessage('별도 창에서 영상을 재생한 뒤 “분석용 화면 연결”에서 그 창을 선택하세요.');
    }
  };

  const shareTab = async () => {
    if (connecting) return;
    if (!youtube || !captureVideoRef.current) {
      setConnectionMessage('영상을 불러온 뒤 다시 연결하세요.');
      setConnectionError(true);
      return;
    }
    stopTab();
    const request = generation.current;
    setSize(EMPTY_SIZE);
    setGeometry(null);
    resetAnalysis();
    setConnecting(true);
    const reportConnection = (message) => { setConnectionMessage(message); setStatus(message); };
    try {
      if (needsPlayerWindow && !supportsRecordedCapture()) {
        throw new Error('공유 영상 분석에는 최신 데스크톱 Firefox·Chrome·Edge가 필요합니다.');
      }
      reportConnection(needsPlayerWindow ? '공유 목록에서 별도로 연 IIDX 영상 공유 창을 선택하세요.' : '공유 목록에서 이 ScoreBoard 탭을 선택하세요.');
      const stream = await requestYouTubeTab(navigator.mediaDevices, captureTargetRef.current, { preferWindow: needsPlayerWindow });
      if (request !== generation.current) { stopCapture(stream); return; }
      streamRef.current = stream;
      reportConnection('공유 화면을 열고 프레임 수신을 확인하는 중입니다…');
      const track = stream.getVideoTracks()[0];
      track.addEventListener('ended', () => {
        if (streamRef.current !== stream) return;
        stopRun();
        stopTab();
        setSize(EMPTY_SIZE);
        setGeometry(null);
        setStatus('탭 공유가 종료됐습니다. “분석용 화면 연결”로 다시 연결하세요.');
      }, { once: true });
      await attachStream(captureVideoRef.current, stream);
      if (request !== generation.current) return;
      const video = captureVideoRef.current;
      const nextSize = { width: video.videoWidth, height: video.videoHeight, duration: 30, fps: 60 };
      video.onresize = () => {
        if (streamRef.current !== stream || !video.videoWidth || !video.videoHeight) return;
        if (video.videoWidth === nextSize.width && video.videoHeight === nextSize.height) return;
        stopRun();
        stopTab();
        setSize(EMPTY_SIZE);
        setGeometry(null);
        setStatus('공유 창 크기가 바뀌었습니다. 창 크기를 고정하고 화면을 다시 연결하세요.');
      };
      // Cropped capture size follows the displayed player, not YouTube's codec resolution.
      let region;
      await sampleLiveFrames(track, 1, (index, frame) => {
        const snapshot = captureSnapshot(frame, nextSize.width, nextSize.height);
        setPreviewSrc(snapshot.src);
        region = needsPlayerWindow
          ? detectContentRect(snapshot.pixels, (boxes) => { if (import.meta.env.DEV) console.info('layout content markers', JSON.stringify(boxes)); })
          : { x: 0, y: 0, width: nextSize.width, height: nextSize.height };
      }, { width: nextSize.width, height: nextSize.height });
      if (request !== generation.current) return;
      setSize(nextSize);
      setGeometry(defaultGeometry(nextSize.width, nextSize.height));
      setContentRect(region || null);
      setCaptureReady(true);
      setConnectionMessage(region ? '분석용 화면과 영상 영역이 연결됐습니다.' : '분석용 화면이 연결됐습니다. 아래 공유 이미지에서 게임 영상을 드래그해 지정하세요.');
      setStatus(region ? '게임 영상 영역을 확인했습니다. 노트가 내려오는 장면에서 영역 실측과 OCR을 실행하세요.'
        : '게임 영상 영역을 자동으로 찾지 못했습니다. 공유 이미지에서 게임 영상을 드래그해 지정하세요.');
    } catch (error) {
      if (request !== generation.current) return;
      stopTab();
      const message = error?.name === 'NotAllowedError'
        ? '화면 공유가 취소되거나 허용되지 않았습니다. “분석용 화면 연결”을 다시 누르세요.' : errorMessage(error);
      setConnectionError(true);
      reportConnection(message);
    } finally {
      if (request === generation.current) setConnecting(false);
    }
  };

  const refreshPreview = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !captureReady) return;
    const request = generation.current;
    try {
      await sampleLiveFrames(track, 1, (index, frame) => {
        if (request !== generation.current) return;
        const snapshot = captureSnapshot(frame, size.width, size.height);
        setPreviewSrc(snapshot.src);
        if (!contentRect && needsPlayerWindow) {
          const region = detectContentRect(snapshot.pixels);
          if (region) {
            setContentRect(region);
            setStatus('게임 영상 영역을 확인했습니다. 영역 실측과 OCR을 실행하세요.');
          }
        }
      }, { width: size.width, height: size.height });
    } catch (error) {
      if (request === generation.current) setStatus(`공유 이미지 새로고침: ${errorMessage(error)}`);
    }
  };

  const selectContentRect = (rect) => {
    if (!validContentRect(rect, size.width, size.height)) {
      setStatus('게임 영상 영역이 너무 작거나 화면 밖에 있습니다. 다시 지정하세요.');
      return;
    }
    generation.current += 1;
    resetAnalysis();
    setContentRect(rect);
    setGeometry(defaultGeometry(size.width, size.height));
    setConnectionMessage('게임 영상 영역을 직접 지정했습니다.');
    setStatus('게임 영상 영역을 지정했습니다. 노트가 내려오는 장면에서 영역 실측과 OCR을 실행하세요.');
  };

  return {
    mode, switchMode, fileUrl, youtubeUrl, setYoutubeUrl, youtube, captureReady, connecting, connectionMessage, connectionError,
    size, geometry, setGeometry, contentRect, previewSrc, selectContentRect, refreshPreview,
    fileVideoRef, captureVideoRef, captureTargetRef, streamRef, fileRef,
    chooseFile, onFileMetadata, loadYouTube, shareTab, stopTab, needsPlayerWindow, openPlayerWindow,
    mediaReady: Boolean(size.width && (mode === 'file' || (captureReady && contentRect))),
    activeVideo: () => mode === 'file' ? fileVideoRef.current : captureVideoRef.current,
    sessionGuard: () => { const token = generation.current; return () => token === generation.current; },
  };
};
