import { useRef, useState } from 'react';
import clsx from 'clsx';
import { importApi } from '../api/import';
import { classifyImportError } from '../utils/importError';
import { useScopeStore } from '../store/scopeStore';
import useTierStore from '../store/tierStore';
import MonoButton from '../components/common/MonoButton';
import Spinner from '../components/common/Spinner';
import DropZone from '../components/import/DropZone';
import ImportErrorAlert from '../components/import/ImportErrorAlert';
import ImportResultPanel from '../components/import/ImportResultPanel';
import GuideAccordion from '../components/import/GuideAccordion';
import BasicCourseCard from '../components/import/BasicCourseCard';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * CSV import screen — state machine + composition only. Every visual piece
 * lives under components/import/*: the drop zone, the inline error alert,
 * the success summary, the prep-steps accordion, and the account-sync
 * card.
 *
 * State machine: idle (no file) -> idle (file selected, "ready") ->
 * uploading -> success | error. "파일 선택됨" is not a state of its own,
 * it's `uploadState === 'idle' && file != null`.
 */
const CsvUpload = () => {
  const level = useScopeStore((state) => state.level);

  const fileInputRef = useRef(null);

  const [uploadState, setUploadState] = useState('idle'); // 'idle' | 'uploading' | 'success' | 'error'
  // Deliberately local and deliberately null. Binding this to the global
  // scope pre-selected whatever the tier table was last showing, so a user
  // who never touched the control could send a DP export as SP and corrupt
  // their scores. It also meant picking a style here silently moved the
  // dashboard and tier table to a different scope. Neither is worth the
  // convenience: this one choice has to be made on purpose.
  const [playStyle, setPlayStyle] = useState(null);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  // True once the request body has fully reached the server, before its
  // response comes back. axios' onUploadProgress only measures the upload
  // leg -- everything after 100% is the backend parsing the CSV and writing
  // scores inside one transaction, with no signal of its own. This flag is
  // what lets the UI stop claiming "업로드 중" once that's no longer true.
  const [uploadComplete, setUploadComplete] = useState(false);
  const [result, setResult] = useState(null);
  const [errorInfo, setErrorInfo] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const showBasicCourse = import.meta.env.VITE_ENABLE_BASIC_COURSE === '1';

  const resetToIdle = () => {
    setFile(null);
    setUploadState('idle');
    setProgress(0);
    setUploadComplete(false);
    setResult(null);
    setErrorInfo(null);
  };

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      const ext = selectedFile.name.includes('.')
        ? `.${selectedFile.name.split('.').pop()}`
        : '확장자가 없는 파일';
      setFile(selectedFile);
      setResult(null);
      setErrorInfo({
        tag: 'wrong format',
        message: `CSV 파일만 올릴 수 있습니다. 선택한 파일은 ${ext} 형식입니다.`,
      });
      setUploadState('error');
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      const mb = (selectedFile.size / (1024 * 1024)).toFixed(1);
      setFile(selectedFile);
      setResult(null);
      setErrorInfo({
        tag: 'too large',
        message: `파일 크기가 ${mb}MB입니다. 10MB 이하만 올릴 수 있습니다.`,
      });
      setUploadState('error');
      return;
    }

    setFile(selectedFile);
    setResult(null);
    setErrorInfo(null);
    setUploadState('idle');
  };

  const handleUpload = async () => {
    if (!file || !playStyle) return;
    setUploadState('uploading');
    setProgress(0);
    setUploadComplete(false);
    setErrorInfo(null);

    // Flip to the "server is processing" state the instant the browser
    // reports the body as fully sent, rather than waiting on the response.
    const handleProgress = (percent) => {
      setProgress(percent);
      if (percent >= 100) setUploadComplete(true);
    };

    try {
      const data = await importApi.uploadCsv(file, playStyle, handleProgress);
      setResult(data);
      setUploadState('success');
      // tierStore memoizes on `${userId}:${level}:${playStyle}`; without
      // `force` the tier table and dashboard would keep serving the
      // pre-upload clear lamps. Keyed on the style actually UPLOADED, not on
      // the global scope, so the refreshed table is the one this import
      // changed. The global scope is left alone.
      useTierStore.getState().fetchTierData(level, playStyle, { force: true });
    } catch (err) {
      setErrorInfo(classifyImportError(err));
      setUploadState('error');
    }
  };

  const openFilePicker = () => fileInputRef.current?.click();

  // Client-side validation errors (wrong format / too large) need a new
  // file, so the button reopens the picker instead of retrying. Whether a
  // server-side failure is worth retrying as-is comes from
  // classifyImportError, not from a hardcoded tag — network drops and rate
  // limits are retryable too, and treating them as bad files was the bug.
  const isRetryableError = uploadState === 'error' && Boolean(errorInfo?.retryable);

  const handleUploadButtonClick = () => {
    if (!file || !playStyle) return;
    if (uploadState === 'error' && !isRetryableError) {
      openFilePicker();
      return;
    }
    handleUpload();
  };

  const uploadButtonLabel = !file
    ? '파일을 선택하세요'
    : !playStyle
      ? 'SP · DP를 선택하세요'
      : uploadState === 'error'
        ? isRetryableError
          ? '다시 시도'
          : '다른 파일 선택'
        : '업로드';

  const dropZoneStatus = !file
    ? 'empty'
    : uploadState === 'success'
      ? 'success'
      : uploadState === 'error'
        ? 'error'
        : 'selected';

  return (
    <div className="px-[30px] pb-[80px] pt-[38px]">
      <div className="mx-auto max-w-[604px]">
        <div>
          <h1 className="text-[21px] font-normal text-ink">가져오기</h1>
          <p className="mt-[6px] text-[13.5px] text-muted">
            e-amusement gate에서 내려받은 성적 CSV를 올리면 스코어와 서열표가 함께 갱신됩니다.
          </p>
        </div>

        {showBasicCourse && (
          <>
            <div className="mt-[26px]">
              <BasicCourseCard />
            </div>
            <div className="mt-[26px] grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-[14px]">
              <div className="h-px bg-line" />
              <span className="font-mono text-[9px] uppercase tracking-[.14em] text-label">
                또는 csv 파일
              </span>
              <div className="h-px bg-line" />
            </div>
          </>
        )}

        <div className="mt-[26px]">
          <div className="mb-[6px] flex items-baseline justify-between gap-2">
            <p id="import-play-style-label" className="font-mono text-[8.5px] uppercase tracking-[.2em] text-label">
              play style
            </p>
            {!playStyle && (
              <p className="text-[11px] text-muted">
                업로드할 CSV의 플레이 스타일을 직접 선택해 주세요.
              </p>
            )}
          </div>
          <div className="flex" role="group" aria-labelledby="import-play-style-label">
            {['SP', 'DP'].map((style) => (
              <button
                key={style}
                type="button"
                aria-pressed={playStyle === style}
                onClick={() => setPlayStyle(style)}
                className={clsx(
                  'flex-1 border py-[13px] text-center font-mono text-[12px] tracking-[.2em] transition-colors duration-200',
                  playStyle === style
                    ? 'border-accent bg-[rgba(231,155,187,.09)] text-accent'
                    : 'border-[rgba(236,234,244,.09)] bg-surface text-muted'
                )}
              >
                {style}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-[14px]">
          <DropZone
            status={dropZoneStatus}
            file={file}
            inputRef={fileInputRef}
            onFileSelect={handleFileSelect}
            onZoneClick={openFilePicker}
            onRemoveFile={resetToIdle}
            locked={uploadState === 'uploading'}
          />

          <ImportErrorAlert errorInfo={errorInfo} />

          {uploadState === 'uploading' && (
            <div className="mt-[14px]">
              <div className="mb-[4px] flex items-center gap-[6px] font-mono text-[9px] uppercase tracking-[.14em] text-label">
                {uploadComplete ? (
                  <>
                    <Spinner size="sm" className="h-3 w-3" />
                    <span>서버에서 처리하는 중입니다...</span>
                  </>
                ) : (
                  <div className="flex w-full items-center justify-between">
                    <span>업로드 중...</span>
                    <span>{progress}%</span>
                  </div>
                )}
              </div>
              <div className="h-[2px] w-full bg-[rgba(236,234,244,.07)]">
                <div
                  className={clsx(
                    'h-full bg-accent transition-[width] duration-300',
                    uploadComplete && 'animate-pulse'
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {uploadState !== 'uploading' && uploadState !== 'success' && (
            <MonoButton
              fullWidth
              disabled={!file || !playStyle}
              onClick={handleUploadButtonClick}
              className="mt-[14px]"
            >
              {uploadButtonLabel}
            </MonoButton>
          )}
        </div>

        {uploadState === 'success' && result && (
          <ImportResultPanel result={result} onUploadAnother={resetToIdle} />
        )}

        <GuideAccordion open={guideOpen} onToggle={() => setGuideOpen((prev) => !prev)} />
      </div>
    </div>
  );
};

export default CsvUpload;
