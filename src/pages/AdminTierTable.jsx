import React, { useEffect, useMemo } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import useAdminTierStore, { buildSectionKeys } from '../store/adminTierStore';
import useAdminTierDnd from '../hooks/useAdminTierDnd';
import DroppableTierRow from '../components/admin/DroppableTierRow';
import { SongTileChip } from '../components/admin/SortableSongTile';
import UnassignedPool from '../components/admin/UnassignedPool';
import AdminBootstrapUpload from '../components/admin/AdminBootstrapUpload';
import { FullPageSpinner } from '../components/common/Spinner';

const AdminTierTable = () => {
  const {
    selectedLevel,
    selectedPlayStyle,
    editorTierData,
    unassignedSongs,
    hasChanges,
    isLoading,
    isSaving,
    setLevel,
    setPlayStyle,
    fetchDataForEdit,
    saveChanges
  } = useAdminTierStore();

  const {
    activeId,
    sensors,
    collisionDetectionStrategy,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel
  } = useAdminTierDnd();

  useEffect(() => {
    fetchDataForEdit();
  }, [selectedLevel, selectedPlayStyle, fetchDataForEdit]);

  const orderedTiers = useMemo(() => buildSectionKeys(), []);

  const activeItem = useMemo(() => {
    if (!activeId) return null;
    return [...Object.values(editorTierData).flat(), ...unassignedSongs].find((item) => item.id === activeId) ?? null;
  }, [activeId, editorTierData, unassignedSongs]);

  return (
    // Section padding wrapper: without it, this page's content sits flush
    // against the new shell's edges (unlike every other migrated page,
    // which owns its own px-[30px]/py-[26px] section padding). Everything
    // below is untouched admin UI/dnd logic.
    <div className="px-[30px] py-[26px]">
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in p-4 sm:p-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-2">
              <span className="text-2xl">⚙️</span> Tier Table Editor
            </h1>
            <p className="text-gray-400 text-sm mt-1">Admin Mode: Drag and drop songs to organize tiers. Changes are applied live immediately on save.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <AdminBootstrapUpload playStyle={selectedPlayStyle} />

            <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-700 shadow-inner">
              {['SP', 'DP'].map((style) => (
                <button
                  key={style}
                  onClick={() => setPlayStyle(style)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    selectedPlayStyle === style
                      ? 'bg-primary-600 text-white shadow-md'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>

            <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-700 shadow-inner">
              {[10, 11, 12].map((level) => (
                <button
                  key={level}
                  onClick={() => setLevel(level)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    selectedLevel === level
                      ? 'bg-accent-600 text-white shadow-md'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <span className="text-xs opacity-70">Lv.</span>{level}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={saveChanges}
                disabled={!hasChanges || isSaving}
                className={`px-4 py-2 rounded-lg font-bold shadow-md transition-all flex items-center gap-2 ${
                  hasChanges
                    ? 'bg-green-600 hover:bg-green-500 text-white animate-[pulse_2s_infinite]'
                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
              >
                {isSaving ? 'Saving...' : 'Apply Changes'}
              </button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="py-24 flex justify-center items-center">
            <FullPageSpinner />
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetectionStrategy}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <UnassignedPool unassignedSongs={unassignedSongs} />

            <div className="bg-gray-850 p-6 rounded-xl border border-gray-700 shadow-xl">
              {orderedTiers.map((tierName) => (
                <DroppableTierRow
                  key={tierName}
                  id={tierName}
                  title={tierName.replace('|', ' ')}
                  items={editorTierData[tierName] || []}
                />
              ))}

              {orderedTiers.length === 0 && (
                <div className="text-center py-10 text-gray-500">
                  No tiers configured for this level yet.
                </div>
              )}
            </div>

            <DragOverlay>
              {activeItem ? (
                <div className="opacity-90 scale-105 shadow-2xl pointer-events-none rotate-2">
                  <SongTileChip title={activeItem.title} difficulty={activeItem.difficulty} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  );
};

export default AdminTierTable;
