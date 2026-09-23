import clsx from 'clsx';
import { youtubeEmbedUrl } from '../../features/layoutAnalysis/capture';
import CapturePreview from './CapturePreview';

const buttonClass = 'shrink-0 whitespace-nowrap border border-line-strong px-3 py-2 text-xs text-text2 transition hover:border-accent hover:text-ink disabled:cursor-not-allowed disabled:opacity-40';

const MediaSourcePanel = ({ media, busy }) => {
  const { mode, youtube, captureReady, connecting, connectionMessage, connectionError, size, fileUrl, youtubeUrl,
    previewSrc, contentRect, geometry, selectContentRect, refreshPreview,
    switchMode, chooseFile, setYoutubeUrl, loadYouTube, shareTab, onFileMetadata,
    fileVideoRef, captureTargetRef, captureVideoRef, needsPlayerWindow, openPlayerWindow } = media;
  return <>
    <div className="border border-line bg-panel p-4">
      <div className="mb-3 flex gap-2">
        {['file', 'youtube'].map((value) => <button key={value} type="button"
          className={clsx(buttonClass, mode === value && 'border-accent text-accent')}
          onClick={() => switchMode(value)} disabled={busy || connecting}>
          {value === 'file' ? '로컬 MP4' : 'YouTube 링크'}
        </button>)}
      </div>
      {mode === 'file' ? <input className="w-full border border-line-strong bg-night px-3 py-2 text-sm text-ink outline-none focus:border-accent" type="file" accept="video/mp4,.mp4"
        onChange={chooseFile} disabled={busy} /> : <>
        <div className="flex flex-wrap gap-2">
          <input className="min-w-0 flex-1 border border-line-strong bg-night px-3 py-2 text-sm text-ink"
            aria-label="YouTube 영상 링크" type="url" value={youtubeUrl}
            onChange={(event) => setYoutubeUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=..." disabled={busy || connecting} />
          <button className={buttonClass} type="button" onClick={loadYouTube} disabled={busy || connecting}>영상 불러오기</button>
        </div>
        {youtube && <div className="mt-3 grid gap-2 border-l-2 border-accent pl-3 text-sm text-text2">
          <p>{captureReady ? `화면 연결됨 · ${size.width}×${size.height}` : '영상이 보이더라도 분석하려면 화면 공유를 한 번 허용해야 합니다.'}</p>
          <p className="text-xs text-muted">{needsPlayerWindow
            ? '1. 영상 공유 창을 열고 재생하세요. 2. 화면 연결에서 그 창을 선택하세요. 3. 영역 실측·OCR 후 채보를 선택하세요.'
            : '1. 아래 영상을 재생하세요. 2. 화면을 연결하고 이 ScoreBoard 탭을 선택하세요. 3. 영역 실측·OCR 후 채보를 선택하세요.'}</p>
          {needsPlayerWindow && <>
            <button className={clsx(buttonClass, 'justify-self-start')} type="button" onClick={openPlayerWindow} disabled={busy || connecting}>영상 공유 창 열기</button>
            <p className="text-xs text-muted">Firefox에서는 공유 영상을 브라우저 안에서 잠시 저장한 뒤 읽습니다. 30초 수집 후 분석이 이어지며 영상은 서버에 보내지 않습니다.</p>
          </>}
          <button className={clsx(buttonClass, 'justify-self-start border-accent text-accent')} type="button"
            onClick={shareTab} disabled={busy || connecting}>
            {connecting ? '화면 연결 중…' : captureReady ? '분석용 화면 다시 연결' : '분석용 화면 연결'}
          </button>
          {connectionMessage && <p role={connectionError ? 'alert' : 'status'}
            className={clsx('text-xs', connectionError ? 'text-danger' : 'text-muted')}>{connectionMessage}</p>}
          {captureReady && size.height < 720 && <p className="text-xs text-muted">플레이어가 작으면 노트와 글자를 놓칠 수 있습니다. YouTube 화질을 높이고 브라우저 창을 넓힌 뒤 다시 연결하세요.</p>}
        </div>}
      </>}
    </div>
    <div className="relative grid min-h-[360px] place-items-center overflow-hidden border border-line bg-black">
      {mode === 'file' && fileUrl && <video ref={fileVideoRef} src={fileUrl} muted playsInline controls
        onLoadedMetadata={onFileMetadata} className="max-h-[70vh] w-full object-contain" />}
      {mode === 'youtube' && youtube && <div ref={captureTargetRef} className="isolate aspect-video w-full bg-black">
        <iframe title="YouTube IIDX 영상" src={youtubeEmbedUrl(youtube.videoId)}
          allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen className="h-full w-full border-0" />
      </div>}
      {mode === 'youtube' && <video ref={captureVideoRef} muted playsInline className="hidden" />}
      {((mode === 'file' && !fileUrl) || (mode === 'youtube' && !youtube)) && <span className="text-sm text-faint2">영상을 선택하세요.</span>}
    </div>
    {mode === 'youtube' && captureReady && previewSrc && <CapturePreview src={previewSrc}
      width={size.width} height={size.height} contentRect={contentRect} geometry={geometry}
      onSelect={selectContentRect} onRefresh={refreshPreview} disabled={busy || connecting} />}
  </>;
};

export default MediaSourcePanel;
