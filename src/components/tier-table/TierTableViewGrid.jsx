import React from 'react';
import useTierStore from '../../store/tierStore';
import SongTile from './SongTile';

/**
 * Grid View Mode
 * Renders tiers as a dense HTML table simulating the community tier charts
 */
const TierTableViewGrid = () => {
  const { enrichedTierData } = useTierStore();

  return (
    <div className="pb-8 overflow-x-auto">
      <div className="min-w-max border border-gray-700 bg-gray-900 shadow-xl rounded-lg overflow-hidden">
        <table className="w-full text-left text-sm text-gray-300 border-collapse">
          <tbody>
            {enrichedTierData.map((tierObj, idx) => {
              const { tier, songs } = tierObj;

              // Calculate clear amount
              const clearedSongs = songs.filter(s => Array.from(['ASSIST_CLEAR', 'EASY_CLEAR', 'CLEAR', 'HARD_CLEAR', 'EX_HARD_CLEAR', 'FULL_COMBO']).includes(s.clearType)).length;
              
              // Alternating row backgrounds for better readability
              const bgClass = idx % 2 === 0 ? 'bg-gray-800/60' : 'bg-gray-850';

              return (
                <tr key={tier} className={`border-b border-gray-700 hover:bg-gray-750 transition-colors ${bgClass}`}>
                  
                  {/* Left Column: Tier Name & Stats */}
                  <th scope="row" className="w-[120px] px-4 py-3 align-middle border-r border-gray-700 bg-gray-900/50">
                    <div className="flex flex-col items-center justify-center space-y-1">
                      <span className="text-xl font-bold font-mono text-white text-center tracking-wider">{tier}</span>
                      <span className="text-[10px] text-gray-500 font-medium">
                        {clearedSongs} / {songs.length}
                      </span>
                    </div>
                  </th>
                  
                  {/* Right Column: Song Tiles Dense Layout */}
                  <td className="px-3 py-2 align-middle max-w-4xl">
                    <div className="flex flex-wrap gap-1">
                      {songs.length > 0 ? (
                        songs.map((song, sIdx) => (
                           <SongTile key={`${song.title}-${sIdx}`} songTitle={song.title} clearType={song.clearType} />
                        ))
                      ) : (
                        <span className="text-gray-600 italic text-xs px-2">No songs in this tier</span>
                      )}
                    </div>
                  </td>

                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TierTableViewGrid;
