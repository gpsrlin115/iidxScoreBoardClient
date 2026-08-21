import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiX } from 'react-icons/fi';
import useFocusTrap from '../../hooks/useFocusTrap';
import SongScoreSection from './dialog/SongScoreSection';
import SongFeedbackPanel from './feedback/SongFeedbackPanel';

/**
 * Per-chart detail dialog: the user's own record for one tier-table entry.
 *
 * Mounting is what opens it — the caller renders this conditionally, so there
 * is no `isOpen` prop. That keeps exactly one dialog instance alive instead of
 * one per tile (a Lv.12 table holds ~1000 tiles), and makes unmount the single
 * place where focus restore and cache teardown happen.
 *
 * Layer scale in this app: header 50 (Header.jsx), this dialog 100,
 * GlobalLoadingOverlay 9999. The dialog now sits above the header — the two
 * used to share z-50 and only DOM order kept this on top — but stays below the
 * global overlay, which is meant to block everything. So any async work owned
 * by this dialog must use local pending state, never useLoading().run(): that
 * overlay would cover the dialog the user is looking at.
 */
const SongScoreDialog = ({ id, song, difficultyLabel, onClose }) => {
  const closeButtonRef = useRef(null);
  const containerRef = useFocusTrap({ onEscape: onClose, initialFocusRef: closeButtonRef });

  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 text-left shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="break-words text-xl font-bold text-white sm:text-2xl">
              {song.title}
              {difficultyLabel && (
                <span className="ml-2 font-mono text-base text-primary-400">[{difficultyLabel}]</span>
              )}
            </h2>
            <p id={descriptionId} className="mt-1 text-sm text-slate-400">
              {song.playStyle} · Lv.{song.level} · 개인 상세 기록
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-primary-400"
            aria-label="상세 점수 닫기"
          >
            <FiX size={22} />
          </button>
        </div>

        <SongScoreSection details={song.scoreDetails} isFallbackScore={song.isFallbackScore} />
        <SongFeedbackPanel chartId={song.chartId} hasDifficulty={Boolean(song.difficulty)} />
      </div>
    </div>,
    document.body,
  );
};

export default SongScoreDialog;
