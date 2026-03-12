import React from 'react';
import useTierStore from '../../store/tierStore';
import { BiChevronDown, BiChevronRight } from 'react-icons/bi';
import SongTile from './SongTile';

const TierGroup = ({ tierData }) => {
  const { tier, songs } = tierData;
  const { expandedTiers, toggleTier } = useTierStore();
  const isExpanded = expandedTiers.has(tier);

  // Calculate clear percentage for this specific tier
  const clearedSongs = songs.filter(s => Array.from(['ASSIST_CLEAR', 'EASY_CLEAR', 'CLEAR', 'HARD_CLEAR', 'EX_HARD_CLEAR', 'FULL_COMBO']).includes(s.clearType));
  const clearPercent = songs.length > 0 ? Math.round((clearedSongs.length / songs.length) * 100) : 0;

  return (
    <div className="mb-4 bg-gray-800 rounded-lg overflow-hidden border border-gray-700 shadow-md">
      {/* Tier Header (Clickable for toggle) */}
      <div
        className="flex items-center justify-between p-3 bg-gray-750 hover:bg-gray-700 cursor-pointer transition select-none"
        onClick={() => toggleTier(tier)}
      >
        <div className="flex items-center gap-3">
          <div className="text-gray-400">
            {isExpanded ? <BiChevronDown size={24} /> : <BiChevronRight size={24} />}
          </div>
          <h3 className="text-lg font-bold text-white w-12 text-center bg-gray-900 py-1 rounded shadow-inner">
            {tier}
          </h3>
          <span className="text-sm text-gray-400">
            {clearedSongs.length} / {songs.length} ({clearPercent}%)
          </span>
        </div>
        
        {/* Tier Progress Bar Mini */}
        <div className="hidden sm:block w-32 h-2 bg-gray-900 rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary-500 transition-all duration-500" 
            style={{ width: `${clearPercent}%` }}
          />
        </div>
      </div>

      {/* Tier Content (Songs) */}
      {isExpanded && (
        <div className="px-4 py-3 border-t border-gray-700 flex flex-wrap bg-gray-800/80">
          {songs.length > 0 ? (
            songs.map((song, idx) => (
               <SongTile key={`${song.title}-${idx}`} songTitle={song.title} clearType={song.clearType} />
            ))
          ) : (
            <div className="text-gray-500 text-sm italic py-2">No songs listed in this tier.</div>
          )}
        </div>
      )}
    </div>
  );
};

export default TierGroup;
