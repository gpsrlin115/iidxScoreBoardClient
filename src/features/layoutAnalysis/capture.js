const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export const parseYouTubeVideoId = (rawUrl) => {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('올바른 YouTube 영상 URL을 입력하세요.');
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (url.searchParams.has('list')) throw new Error('재생목록 URL은 지원하지 않습니다.');
  if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/live/')) {
    throw new Error('Shorts와 라이브 영상은 지원하지 않습니다.');
  }
  let id = '';
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  if ((host === 'youtube.com' || host === 'm.youtube.com') && url.pathname === '/watch') {
    id = url.searchParams.get('v') || '';
  }
  if (!VIDEO_ID.test(id)) throw new Error('일반 YouTube 영상 URL만 지원합니다.');
  return id;
};

export const youtubeEmbedUrl = (videoId) => {
  if (!VIDEO_ID.test(videoId)) throw new Error('잘못된 YouTube 영상 ID입니다.');
  return `https://www.youtube.com/embed/${videoId}?enablejsapi=1&playsinline=1&rel=0`;
};

export const stopCapture = (stream) => stream?.getTracks?.().forEach((track) => track.stop());

export const requestYouTubeTab = async (mediaDevices = navigator.mediaDevices, captureElement = null, { preferWindow = false } = {}) => {
  if (!mediaDevices?.getDisplayMedia) throw new Error('화면 공유를 지원하는 최신 데스크톱 브라우저에서 HTTPS 또는 localhost로 접속하세요.');
  const stream = await mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 60, max: 60 }, ...(preferWindow ? { displaySurface: 'window' } : {}) },
    audio: false,
    ...(!preferWindow ? { preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude' } : {}),
  });
  const track = stream.getVideoTracks()[0];
  const settings = track?.getSettings?.() || {};
  // Firefox may omit both surface settings. Missing metadata must not reject
  // a source the user explicitly selected in the browser's sharing dialog.
  const surface = settings.displaySurface ?? ({ window: 'window', browser: 'browser', screen: 'monitor' }[settings.mediaSource]) ?? settings.mediaSource;
  if (!track || (surface && (preferWindow ? !['window', 'browser'].includes(surface) : surface !== 'browser'))) {
    stopCapture(stream);
    throw new Error(preferWindow ? '전체 화면 대신 별도로 연 IIDX 영상 공유 창을 선택하세요.' : 'YouTube가 재생 중인 브라우저 탭을 선택하세요.');
  }
  let elementRestricted = false;
  try {
    if (preferWindow) {
      // Firefox exposes window capture without Element/Region Capture. The
      // user selects the dedicated player window, never a recursive preview.
      elementRestricted = false;
    } else if (captureElement && globalThis.RestrictionTarget?.fromElement && typeof track.restrictTo === 'function') {
      const target = await globalThis.RestrictionTarget.fromElement(captureElement);
      await track.restrictTo(target);
      elementRestricted = true;
    } else if (captureElement && globalThis.CropTarget?.fromElement && typeof track.cropTo === 'function') {
      const target = await globalThis.CropTarget.fromElement(captureElement);
      await track.cropTo(target);
      elementRestricted = true;
    } else {
      throw new Error('플레이어 영역 공유를 지원하는 최신 데스크톱 Chrome 또는 Edge가 필요합니다.');
    }
  } catch (error) {
    stopCapture(stream);
    throw new Error(`플레이어 영역을 연결하지 못했습니다. 공유 목록에서 이 ScoreBoard 탭을 선택하세요. ${error instanceof Error ? error.message : String(error)}`);
  }
  Object.defineProperty(stream, 'iidaranElementRestricted', { value: elementRestricted });
  return stream;
};

export const attachStream = async (video, stream) => {
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  if (!video.videoWidth || video.readyState < 1) await waitForMetadata(video);
  await video.play();
};

const waitForMetadata = (video) => new Promise((resolve, reject) => {
  const cleanup = () => {
    clearTimeout(timer);
    video.removeEventListener('loadedmetadata', ready);
    video.removeEventListener('error', failed);
  };
  const ready = () => { cleanup(); resolve(); };
  const failed = () => { cleanup(); reject(new Error('공유 탭 영상을 열지 못했습니다. 공유할 영상을 재생하세요.')); };
  const timer = setTimeout(failed, 5_000);
  video.addEventListener('loadedmetadata', ready, { once: true });
  video.addEventListener('error', failed, { once: true });
});
