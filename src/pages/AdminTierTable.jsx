import React, { useEffect, useState } from 'react';
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors, 
  DragOverlay 
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import useAdminTierStore from '../store/adminTierStore';
import DroppableTierRow from '../components/admin/DroppableTierRow';
import SortableSongTile from '../components/admin/SortableSongTile';
import UnassignedPool from '../components/admin/UnassignedPool';
import AdminBootstrapUpload from '../components/admin/AdminBootstrapUpload';
import { default as FullPageSpinner } from '../components/common/Spinner';

const AdminTierTable = () => {
  const {
    selectedLevel,
    selectedPlayStyle,
    draftTierData,
    unassignedSongs,
    hasChanges,
    isLoading,
    isSaving,
    setLevel,
    setPlayStyle,
    fetchDataForEdit,
    updateDraftState,
    saveChanges,
    publishChanges
  } = useAdminTierStore();

  const [activeId, setActiveId] = useState(null);

  useEffect(() => {
    fetchDataForEdit();
  }, [selectedLevel, selectedPlayStyle, fetchDataForEdit]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Requires a 5px movement before drag starts (helps prevent accidental drags on click)
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Helper to find which container (tier name or 'unassigned') a song belongs to
  // Accepts explicit tierData and unassignedSongs to avoid stale closure issues
  const findContainer = (id, tierData = draftTierData, unassigned = unassignedSongs) => {
    if (unassigned.includes(id)) {
      return 'unassigned';
    }
    
    for (const [key, songs] of Object.entries(tierData)) {
      if (songs.includes(id)) {
        return key;
      }
    }
    return null;
  };

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragOver = (event) => {
    // NOTE: We intentionally do NOT update state in handleDragOver.
    // Doing so causes @dnd-kit's internal tracking to diverge from UI state,
    // resulting in snap-back behavior. All state updates happen in handleDragEnd.

    // This is a no-op placeholder to satisfy the DndContext API.
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    // Capture fresh state to ensure consistency in the final drop action
    const { draftTierData: currentTierData, unassignedSongs: currentUnassignedSongs } = useAdminTierStore.getState();

    const activeContainer = findContainer(activeId, currentTierData, currentUnassignedSongs);
    let overContainer = findContainer(overId, currentTierData, currentUnassignedSongs);

    // If dragged over the container body directly (overId is a tier name, not a song)
    if (!overContainer && (overId === 'unassigned' || Object.keys(currentTierData).includes(overId))) {
      overContainer = overId;
    }

    if (!activeContainer || !overContainer) return;

    // Moving within the same container
    if (activeContainer === overContainer) {
      const isUnassigned = activeContainer === 'unassigned';
      const items = isUnassigned ? currentUnassignedSongs : currentTierData[activeContainer];
      
      const oldIndex = items.indexOf(activeId);
      let newIndex = items.indexOf(overId);
      
      // If overId is the container itself, move to end
      if (newIndex === -1) {
        newIndex = items.length - 1;
      }

      if (oldIndex !== newIndex && oldIndex !== -1) {
        const newItems = arrayMove(items, oldIndex, newIndex);
        
        if (isUnassigned) {
          updateDraftState(currentTierData, newItems);
        } else {
          updateDraftState({ ...currentTierData, [activeContainer]: newItems }, currentUnassignedSongs);
        }
      }
    } else {
      // Fallback for cross-container movement if handleDragOver didn't commit it yet
      moveItemBetweenContainers(activeContainer, overContainer, activeId, overId, currentTierData, currentUnassignedSongs);
    }
  };

  const moveItemBetweenContainers = (
    activeContainer, 
    overContainer, 
    activeId, 
    overId, 
    currentTierData, 
    currentUnassignedSongs
  ) => {
    const activeItems = activeContainer === 'unassigned' ? currentUnassignedSongs : currentTierData[activeContainer];
    const overItems = overContainer === 'unassigned' ? currentUnassignedSongs : currentTierData[overContainer];

    const activeIndex = activeItems.indexOf(activeId);
    let overIndex = overItems.indexOf(overId);

    // If item was already moved or index logic failed
    if (activeIndex === -1) return;

    // If hovering over the container body rather than an item
    if (overIndex === -1) {
      overIndex = overItems.length;
    }

    let newActiveItems = [...activeItems];
    newActiveItems.splice(activeIndex, 1);

    let newOverItems = [...overItems];
    newOverItems.splice(overIndex, 0, activeId);

    let newTiers = { ...currentTierData };
    let newUnassigned = [...currentUnassignedSongs];

    if (activeContainer === 'unassigned') newUnassigned = newActiveItems;
    else newTiers[activeContainer] = newActiveItems;

    if (overContainer === 'unassigned') newUnassigned = newOverItems;
    else newTiers[overContainer] = newOverItems;

    updateDraftState(newTiers, newUnassigned);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  // Safe fallback if JSON doesn't define tiers yet
  const orderedTiers = Object.keys(draftTierData).length > 0 
    ? Object.keys(draftTierData) 
    : ['S+', 'S', 'A+', 'A', 'B+', 'B', 'C', 'D', 'E', 'F'];

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in p-4 sm:p-0">
      
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <span className="text-2xl">⚙️</span> Tier Table Editor
          </h1>
          <p className="text-gray-400 text-sm mt-1">Admin Mode: Drag and drop songs to organize tiers.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Admin Database Bootstrap */}
          <AdminBootstrapUpload playStyle={selectedPlayStyle} />

          {/* PlayStyle Toggle */}
          <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-700 shadow-inner">
            {['SP', 'DP'].map(style => (
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

          {/* Level Selection */}
          <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-700 shadow-inner">
            {[10, 11, 12].map(level => (
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

          {/* Action Buttons */}
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
              {isSaving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              onClick={publishChanges}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg font-bold shadow-md transition-all bg-accent-600 hover:bg-accent-500 text-white"
            >
              Publish
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-24 flex justify-center items-center">
            <FullPageSpinner size="lg" message="Loading editor data..." />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {/* Unassigned Pool */}
          <UnassignedPool unassignedSongs={unassignedSongs} />

          {/* Tier Rows */}
          <div className="bg-gray-850 p-6 rounded-xl border border-gray-700 shadow-xl">
            {orderedTiers.map(tierName => (
              <DroppableTierRow 
                key={tierName}
                id={tierName} 
                title={tierName} 
                items={draftTierData[tierName] || []} 
              />
            ))}
            
            {orderedTiers.length === 0 && (
                <div className="text-center py-10 text-gray-500">
                    No tiers configured for this level yet.
                </div>
            )}
          </div>

          {/* Drag Overlay (shows the item being dragged) */}
          <DragOverlay>
            {activeId ? (
              <div className="opacity-90 scale-105 shadow-2xl pointer-events-none rotate-2">
                 <SortableSongTile id={activeId} title={activeId} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
};

export default AdminTierTable;
