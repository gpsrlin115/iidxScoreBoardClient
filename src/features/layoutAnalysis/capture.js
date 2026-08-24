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

export const requestYouTubeTab = async (mediaDevices = navigator.mediaDevices, captureElement = null) => {
  if (!mediaDevices?.getDisplayMedia) throw new Error('최신 Chrome 또는 Edge에서만 탭 공유를 지원합니다.');
  const stream = await mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 60, max: 60 } },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
    surfaceSwitching: 'exclude',
  });
  const track = stream.getVideoTracks()[0];
  const surface = track?.getSettings?.().displaySurface;
  if (!track || (surface && surface !== 'browser')) {
    stopCapture(stream);
    throw new Error('YouTube가 재생 중인 브라우저 탭을 선택하세요.');
  }
  let elementRestricted = false;
  try {
    if (captureElement && window.RestrictionTarget?.fromElement && typeof track.restrictTo === 'function') {
      const target = await window.RestrictionTarget.fromElement(captureElement);
      await track.restrictTo(target);
      elementRestricted = true;
    }
  } catch (error) {
    stopCapture(stream);
    throw new Error(`YouTube 플레이어 영역을 캡처하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
  Object.defineProperty(stream, 'iidaranElementRestricted', { value: elementRestricted });
  return stream;
};

export const attachStream = async (video, stream) => {
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  if (video.readyState < 1) {
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('공유 탭 영상을 열지 못했습니다.')), 5_000);
      video.addEventListener('loadedmetadata', () => {
        window.clearTimeout(timeout);
        resolve();
      }, { once: true });
    });
  }
  await video.play();
};
