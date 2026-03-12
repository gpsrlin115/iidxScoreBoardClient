import React from 'react';

const SongTile = ({ songTitle, clearType }) => {
  const getColorClass = (clearType) => {
    switch (clearType) {
      case 'FAILED': return 'bg-gray-500 text-white border border-gray-600';
      case 'ASSIST_CLEAR': return 'bg-purple-500 text-white border border-purple-600';
      case 'EASY_CLEAR': return 'bg-green-500 text-white border border-green-600';
      case 'CLEAR': return 'bg-blue-500 text-white border border-blue-600';
      case 'HARD_CLEAR': return 'bg-white text-black border-2 border-black font-bold';
      case 'EX_HARD_CLEAR': return 'bg-yellow-400 text-black border border-yellow-600 font-bold shadow-sm';
      case 'FULL_COMBO': return 'bg-gradient-to-r from-yellow-300 via-white to-yellow-300 text-black border border-yellow-500 animate-pulse font-bold shadow-md';
      default: return 'bg-gray-700 text-gray-400 border border-gray-600 opacity-70'; // Unplayed or unknown
    }
  };

  const getLabel = (clearType) => {
      switch (clearType) {
          case 'FAILED': return 'Failed';
          case 'ASSIST_CLEAR': return 'Assist';
          case 'EASY_CLEAR': return 'Easy';
          case 'CLEAR': return 'Clear';
          case 'HARD_CLEAR': return 'Hard';
          case 'EX_HARD_CLEAR': return 'EX-Hard';
          case 'FULL_COMBO': return 'Full Combo';
          default: return 'No Play';
      }
  }

  return (
    <div
      className={`inline-block px-3 py-1.5 rounded m-1 text-xs md:text-sm cursor-help transition-transform hover:scale-105 active:scale-95 ${getColorClass(clearType)}`}
      title={`${songTitle} - ${getLabel(clearType)}`}
    >
      {songTitle}
    </div>
  );
};

export default SongTile;
