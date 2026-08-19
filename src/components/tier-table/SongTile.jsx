import { useId, useState } from 'react';
import clsx from 'clsx';
import {
  CLEAR_PALETTE,
  CLEAR_TYPE_LABELS,
  FC_CHIP_GLOW,
  normalizeClearType,
} from '../../utils/clearTypes';
import SongScoreDialog from './SongScoreDialog';

// Only used to feed SongScoreDialog's difficultyLabel prop (its title shows
// "[H]"/"[A]"/"[L]" next to the song name). The chip itself only calls out
// LEGGENDARIA, per design.
const difficultyLabel = {
  HYPER: 'H',
  ANOTHER: 'A',
  LEGGENDARIA: 'L',
};

/**
 * One clear-lamp chip in the tier table.
 *
 * The design mock draws this as a static, non-interactive tag, but this app
 * layers tier vote/comment features onto the per-chart detail modal, so the
 * chip stays a real <button> that opens SongScoreDialog on click, with full
 * aria wiring (aria-haspopup/aria-expanded/aria-controls) preserved.
 */
const SongTile = ({ song, dense = false }) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const dialogId = useId();
  const clearType = normalizeClearType(song.clearType) ?? 'NO_PLAY';
  const palette = CLEAR_PALETTE[clearType] ?? CLEAR_PALETTE.NO_PLAY;
  const songTitle = song.title;
  const difficulty = difficultyLabel[song.difficulty] ?? song.difficulty;
  const isLeggendaria = song.difficulty === 'LEGGENDARIA';

  // Focus returns to this button on its own: useFocusTrap inside the dialog
  // restores whatever was focused when it mounted. Restoring here too would
  // fight that and only work for this one trigger.
  const closeDialog = () => setIsDialogOpen(false);

  return (
    <>
      <button
        type="button"
        className={clsx(
          'inline-block overflow-hidden text-ellipsis whitespace-nowrap leading-[1.35]',
          'transition-transform duration-[160ms] hover:-translate-y-px',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          dense
            ? 'max-w-[158px] px-[5px] py-[2px] text-[10.5px]'
            : 'max-w-[210px] px-2 py-1 text-[12px]'
        )}
        style={{
          background: palette.bg,
          color: palette.fg,
          border: `1px solid ${palette.bd}`,
          borderRadius: '3px',
          boxShadow: clearType === 'FULLCOMBO_CLEAR' ? FC_CHIP_GLOW : undefined,
        }}
        title={`${songTitle} · ${CLEAR_TYPE_LABELS[clearType]}`}
        aria-label={`${songTitle}${difficulty ? ` ${difficulty} 채보` : ''} 상세 점수 보기`}
        aria-haspopup="dialog"
        aria-expanded={isDialogOpen}
        aria-controls={isDialogOpen ? dialogId : undefined}
        onClick={() => setIsDialogOpen(true)}
      >
        {songTitle}
        {isLeggendaria && <span className="font-mono text-[8.5px] opacity-70"> L</span>}
      </button>

      {/*
        Rendered only while open. The dialog used to be mounted for every tile
        and return null internally — but that runs after its hooks, so a
        Lv.12 table kept ~1000 idle dialog hook instances alive. Mounting on
        demand also makes unmount the natural cache/focus teardown point.
      */}
      {isDialogOpen && (
        <SongScoreDialog
          id={dialogId}
          song={song}
          difficultyLabel={difficulty}
          onClose={closeDialog}
        />
      )}
    </>
  );
};

export default SongTile;
