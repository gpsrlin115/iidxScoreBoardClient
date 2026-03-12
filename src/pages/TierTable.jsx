import React, { useEffect } from 'react';
import useTierStore from '../store/tierStore';
import TierTableViewList from '../components/tier-table/TierTableViewList';
import TierTableViewGrid from '../components/tier-table/TierTableViewGrid';
import { default as FullPageSpinner } from '../components/common/Spinner';
import { FiGrid, FiList } from 'react-icons/fi';

const TierTable = () => {
  const {
    selectedLevel,
    selectedPlayStyle,
    enrichedTierData,
    viewMode,
    isLoading,
    error,
    setLevel,
    setPlayStyle,
    setViewMode,
    fetchTierData,
    expandAllTiers,
    collapseAllTiers
  } = useTierStore();

  useEffect(() => {
    fetchTierData();
  }, [selectedLevel, selectedPlayStyle, fetchTierData]);

  // Calculate overall progress across all tiers
  const totalSongs = enrichedTierData.reduce((acc, tierObj) => acc + tierObj.songs.length, 0);
  const clearedSongs = enrichedTierData.reduce((acc, tierObj) => {
    return acc + tierObj.songs.filter(s => Array.from(['ASSIST_CLEAR', 'EASY_CLEAR', 'CLEAR', 'HARD_CLEAR', 'EX_HARD_CLEAR', 'FULL_COMBO']).includes(s.clearType)).length;
  }, 0);
  const overallProgress = totalSongs > 0 ? Math.round((clearedSongs / totalSongs) * 100) : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in p-4 sm:p-0">
      
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-accent-400">
          Tier Table
        </h1>
        
        <div className="flex flex-wrap items-center gap-3 bg-gray-800/50 p-2 rounded-xl border border-gray-700">
          {/* PlayStyle Toggle */}
          <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-700 shadow-inner">
            {['SP', 'DP'].map(style => (
              <button
                key={style}
                onClick={() => setPlayStyle(style)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  selectedPlayStyle === style
                    ? 'bg-primary-600 text-white shadow-md transform scale-105'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {style}
              </button>
            ))}
          </div>

          {/* Level Selection */}
          <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-700 shadow-inner">
            {[10, 11, 12].map(level => (
              <button
                key={level}
                onClick={() => setLevel(level)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1 ${
                  selectedLevel === level
                    ? 'bg-accent-600 text-white shadow-md transform scale-105'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <span className="text-xs opacity-70">Lv.</span>{level}
              </button>
            ))}
          </div>

          {/* View Mode Toggle */}
          <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-700 shadow-inner ml-2">
             <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 flex items-center justify-center rounded-md transition-all ${
                  viewMode === 'grid'
                    ? 'bg-primary-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
                title="Table Grid View"
             >
               <FiGrid size={18} />
             </button>
             <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 flex items-center justify-center rounded-md transition-all ${
                  viewMode === 'list'
                    ? 'bg-primary-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
                title="Accordion List View"
             >
               <FiList size={18} />
             </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-gray-850 p-6 rounded-2xl border border-gray-700 shadow-xl space-y-6">
        
        {/* Progress Overview Section */}
        <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-md transform transition-all hover:scale-[1.01]">
          <div className="flex justify-between items-end mb-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Overall Progress</h2>
              <p className="text-sm font-medium text-gray-400">Level {selectedLevel} {selectedPlayStyle}</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-white">{clearedSongs}</span>
              <span className="text-gray-500 mx-1">/</span>
              <span className="text-lg text-gray-400">{totalSongs}</span>
              <span className="text-sm text-primary-400 font-bold ml-2">({overallProgress}%)</span>
            </div>
          </div>
          <div className="w-full h-4 bg-gray-900 rounded-full overflow-hidden shadow-inner border border-gray-800">
            <div 
              className="h-full bg-gradient-to-r from-primary-500 via-purple-500 to-accent-500 transition-all duration-1000 ease-out relative" 
              style={{ width: `${overallProgress}%` }}
            >
                {/* Shine effect */}
                <div className="absolute inset-0 bg-white/20 w-1/3 skew-x-12 -translate-x-full animate-[shimmer_2s_infinite]"></div>
            </div>
          </div>
        </div>

        {/* Global Expand/Collapse Actions */}
        <div className="flex justify-between items-center px-2">
            <span className="text-sm text-gray-500 italic">Data synchronized with your scores from the backend.</span>
            <div className="flex gap-4">
            <button onClick={expandAllTiers} className="text-sm font-medium text-primary-400 hover:text-primary-300 transition">Expand All</button>
            <span className="text-gray-700">|</span>
            <button onClick={collapseAllTiers} className="text-sm font-medium text-gray-400 hover:text-white transition">Collapse All</button>
            </div>
        </div>

        {/* Render Tiers Data OR Loading/Error States */}
        <div className="space-y-2 pb-8">
          {isLoading ? (
            <div className="py-24 flex justify-center items-center">
               <FullPageSpinner size="lg" message="Loading tier and score combinations..." />
            </div>
          ) : error ? (
            <div className="bg-red-900/50 border-l-4 border-red-500 text-red-200 p-6 rounded-lg shadow-md">
              <h3 className="font-bold mb-1">Error Loading Data</h3>
              <p>{error}</p>
            </div>
          ) : enrichedTierData.length > 0 ? (
             viewMode === 'list' ? <TierTableViewList /> : <TierTableViewGrid />
          ) : (
            <div className="bg-gray-800 p-12 rounded-xl border border-gray-700 text-center flex flex-col items-center justify-center space-y-3">
              <div className="text-5xl opacity-20">🫙</div>
              <h3 className="text-xl font-bold text-gray-300">No Data Available</h3>
              <p className="text-gray-500 max-w-sm">There is currently no predefined tier data for Level {selectedLevel} {selectedPlayStyle}.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TierTable;
