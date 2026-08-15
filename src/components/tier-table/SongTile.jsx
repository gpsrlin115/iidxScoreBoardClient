import React, { useId, useState } from 'react';
import { CLEAR_TYPE_LABELS, normalizeClearType } from '../../utils/clearTypes';
import SongScoreDialog from './SongScoreDialog';

const difficultyLabel = {
  HYPER: 'H',
  ANOTHER: 'A',
  LEGGENDARIA: 'L',
};

const SongTile = ({ song }) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const dialogId = useId();
  const clearType = normalizeClearType(song.clearType) ?? 'NO_PLAY';
  const songTitle = song.title;
  const difficulty = difficultyLabel[song.difficulty] ?? song.difficulty;

  // Focus returns to this button on its own: useFocusTrap inside the dialog
  // restores whatever was focused when it mounted. Restoring here too would
  // fight that and only work for this one trigger.
  const closeDialog = () => setIsDialogOpen(false);

  const getColorClass = (clearType) => {
    switch (clearType) {
      case 'FAILED': return 'bg-gray-500 text-white border border-gray-600';
      case 'ASSIST_CLEAR': return 'bg-purple-500 text-white border border-purple-600';
      case 'EASY_CLEAR': return 'bg-green-500 text-white border border-green-600';
      case 'CLEAR': return 'bg-blue-500 text-white border border-blue-600';
      case 'HARD_CLEAR': return 'bg-white text-black border-2 border-black font-bold';
      case 'EX_HARD_CLEAR': return 'bg-yellow-400 text-black border border-yellow-600 font-bold shadow-sm';
      case 'FULLCOMBO_CLEAR': return 'bg-gradient-to-r from-yellow-300 via-white to-yellow-300 text-black border border-yellow-500 animate-pulse font-bold shadow-md';
      default: return 'bg-gray-700 text-gray-400 border border-gray-600 opacity-70'; // Unplayed or unknown
    }
  };

  return (
    <>
      <button
        type="button"
        className={`inline-block px-3 py-1.5 rounded m-1 text-xs md:text-sm cursor-pointer transition-transform hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400 ${getColorClass(clearType)}`}
        title={`${songTitle}${difficulty ? ` [${difficulty}]` : ''} - ${CLEAR_TYPE_LABELS[clearType] ?? clearType}`}
        aria-label={`${songTitle}${difficulty ? ` ${difficulty} 채보` : ''} 상세 점수 보기`}
        aria-haspopup="dialog"
        aria-expanded={isDialogOpen}
        aria-controls={isDialogOpen ? dialogId : undefined}
        onClick={() => setIsDialogOpen(true)}
      >
        <span>{songTitle}</span>
        {difficulty && (
          <span className="ml-1 opacity-70 font-mono text-[10px]">[{difficulty}]</span>
        )}
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
