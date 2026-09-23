import { useId, useState } from 'react';
import { getDifficultyDisplay } from '../../utils/difficulty';
import SongScoreDialog from './SongScoreDialog';
import TierSongChip from './TierSongChip';

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
  const songTitle = song.title;
  const difficulty = getDifficultyDisplay(song.difficulty);

  // Viewer dialog titles only abbreviate HYPER, ANOTHER and LEGGENDARIA.
  // Missing difficulty is omitted instead of exposing the admin placeholder.
  const difficultyLabel = difficulty.isMissing
    ? undefined
    : ['BEGINNER', 'NORMAL'].includes(difficulty.key) ? difficulty.fullLabel : difficulty.label;

  // Focus returns to this button on its own: useFocusTrap inside the dialog
  // restores whatever was focused when it mounted. Restoring here too would
  // fight that and only work for this one trigger.
  const closeDialog = () => setIsDialogOpen(false);

  return (
    <>
      <TierSongChip
        song={song}
        dense={dense}
        interactive
        aria-label={`${songTitle}${difficulty.isMissing ? '' : ` ${difficulty.fullLabel} 채보`} 상세 점수 보기`}
        aria-haspopup="dialog"
        aria-expanded={isDialogOpen}
        aria-controls={isDialogOpen ? dialogId : undefined}
        onClick={() => setIsDialogOpen(true)}
      />

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
          difficultyLabel={difficultyLabel}
          onClose={closeDialog}
        />
      )}
    </>
  );
};

export default SongTile;
