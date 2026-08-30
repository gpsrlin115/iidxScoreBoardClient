import { useState } from 'react';
import toast from 'react-hot-toast';
import Tag from '../common/Tag';
import { tierShareApi } from '../../api/tierShares';
import { buildTierShareUrl } from '../../utils/tierShare';

const actionClass = 'disabled:cursor-not-allowed disabled:opacity-45';

const TierShareActions = ({ level, playStyle, mode, disabled, downloading, onDownload }) => {
  const [status, setStatus] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [manualCopyUrl, setManualCopyUrl] = useState('');

  const shareUrl = (shareId) => buildTierShareUrl(window.location.origin, shareId, {
    level,
    playStyle,
    mode,
  });

  const loadStatus = async () => {
    if (status) return status;
    const loaded = await tierShareApi.getStatus();
    setStatus(loaded);
    return loaded;
  };

  const copyUrl = async (url) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(url);
      toast.success('공유 링크를 복사했습니다.');
    } catch {
      setManualCopyUrl(url);
    }
  };

  const handleCopy = async () => {
    if (pending || disabled) return;
    setPending(true);
    try {
      let nextStatus = await loadStatus();
      if (!nextStatus.enabled || !nextStatus.shareId) {
        nextStatus = await tierShareApi.setEnabled(true);
        setStatus(nextStatus);
      }
      await copyUrl(shareUrl(nextStatus.shareId));
    } catch {
      toast.error('공유 링크를 준비하지 못했습니다.');
    } finally {
      setPending(false);
    }
  };

  const openSettings = async () => {
    setSettingsOpen(true);
    if (status || pending) return;
    setPending(true);
    try {
      setStatus(await tierShareApi.getStatus());
    } catch {
      toast.error('공유 설정을 불러오지 못했습니다.');
      setSettingsOpen(false);
    } finally {
      setPending(false);
    }
  };

  const toggleEnabled = async () => {
    if (!status || pending) return;
    setPending(true);
    try {
      const nextStatus = await tierShareApi.setEnabled(!status.enabled);
      setStatus(nextStatus);
      toast.success(nextStatus.enabled ? '링크 공유를 활성화했습니다.' : '링크 공유를 비활성화했습니다.');
    } catch {
      toast.error('공유 상태를 변경하지 못했습니다.');
    } finally {
      setPending(false);
    }
  };

  const regenerate = async () => {
    if (pending) return;
    const confirmed = window.confirm('기존 공유 링크가 즉시 만료됩니다. 새 링크를 발급할까요?');
    if (!confirmed) return;

    setPending(true);
    try {
      const nextStatus = await tierShareApi.regenerate();
      setStatus(nextStatus);
      await copyUrl(shareUrl(nextStatus.shareId));
    } catch {
      toast.error('공유 링크를 재발급하지 못했습니다.');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-[5px]">
        <Tag className={actionClass} disabled={disabled || downloading} onClick={onDownload}>
          {downloading ? 'PNG 생성 중' : 'PNG 다운로드'}
        </Tag>
        <Tag className={actionClass} disabled={disabled || pending} onClick={handleCopy}>
          링크 복사
        </Tag>
        <Tag className={actionClass} disabled={pending} onClick={openSettings}>
          공유 설정
        </Tag>
      </div>

      {settingsOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-night/80 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="tier-share-settings-title"
            className="w-full max-w-[520px] border border-line bg-surface p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="tier-share-settings-title" className="text-lg font-medium text-ink">공유 설정</h2>
                <p className="mt-1 text-xs text-muted">
                  링크는 현재 선택한 레벨·플레이스타일·표시 모드로 열립니다.
                </p>
              </div>
              <button type="button" className="text-muted hover:text-ink" onClick={() => setSettingsOpen(false)}>
                닫기
              </button>
            </div>

            <div className="mt-6 border-y border-line py-4">
              {status ? (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[.16em] text-label">public link</div>
                    <div className={`mt-1 text-sm ${status.enabled ? 'text-accent' : 'text-muted'}`}>
                      {status.enabled ? '활성화됨' : '비활성화됨'}
                    </div>
                  </div>
                  <Tag className={actionClass} disabled={pending} active={status.enabled} onClick={toggleEnabled}>
                    {status.enabled ? '공유 끄기' : '공유 켜기'}
                  </Tag>
                </div>
              ) : (
                <p className="text-sm text-muted">공유 상태를 불러오는 중입니다...</p>
              )}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Tag
                className={actionClass}
                disabled={pending}
                onClick={handleCopy}
              >
                현재 링크 복사
              </Tag>
              <Tag className={actionClass} disabled={pending} onClick={regenerate}>
                링크 재발급
              </Tag>
            </div>
          </section>
        </div>
      )}

      {manualCopyUrl && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-night/85 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-copy-title"
            className="w-full max-w-[620px] border border-line bg-surface p-6 shadow-2xl"
          >
            <h2 id="manual-copy-title" className="text-lg font-medium text-ink">링크를 직접 복사해 주세요</h2>
            <input
              autoFocus
              readOnly
              value={manualCopyUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="mt-4 w-full border border-line bg-night px-3 py-2 font-mono text-xs text-ink outline-none focus:border-accent"
            />
            <div className="mt-4 flex justify-end">
              <Tag onClick={() => setManualCopyUrl('')}>닫기</Tag>
            </div>
          </section>
        </div>
      )}
    </>
  );
};

export default TierShareActions;
