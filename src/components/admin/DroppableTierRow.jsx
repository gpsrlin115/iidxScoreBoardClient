import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import SortableSongTile from './SortableSongTile';

/**
 * DroppableTierRow
 * Represents a single Tier (e.g., 'S+') or the 'Unassigned' pool.
 * It is a droppable container that also provides a SortableContext for the items within it.
 */
const DroppableTierRow = ({ id, title, items, isPool = false }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: id,
  });

  return (
    <div className={`mb-4 rounded-lg overflow-hidden border transition-colors ${isPool ? 'border-dashed border-gray-600 bg-gray-900/50' : 'border-gray-700 bg-gray-800'} ${isOver ? 'ring-2 ring-primary-500 bg-gray-800' : ''}`}>
      <div className={`flex items-center p-3 ${isPool ? 'bg-gray-800/80 border-b border-gray-700' : 'bg-gray-750'}`}>
        <h3 className={`font-bold ${isPool ? 'text-gray-400 text-base' : 'text-xl text-white w-14 text-center bg-gray-900 py-1 rounded shadow-inner'}`}>
          {title}
        </h3>
        <span className="ml-3 text-sm text-gray-500 font-mono">
          {items.length} {items.length === 1 ? 'song' : 'songs'}
        </span>
      </div>
      
      {/* 
        We use setNodeRef here so dnd-kit knows this entire div is the drop target for the container 'id'.
        SortableContext is required for the items inside to be sortable amongst themselves.
      */}
      <div 
        ref={setNodeRef} 
        className={`p-3 min-h-[80px] flex flex-wrap content-start ${items.length === 0 && !isOver ? 'bg-[url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjMWYyOTM3Ij48L3JlY3Q+CjxwYXRoIGQ9Ik0wIDBMOCA4Wk04IDBMMCA4WiIgc3Ryb2tlPSIjMzc0MTUxIiBzdHJva2Utd2lkdGg9IjEiPjwvcGF0aD4KPC9zdmc+")]' : ''}`}
      >
        <SortableContext 
          id={id} 
          items={items} 
          // Use horizontal strategy since items are laid out inline (flex-wrap).
          // For a true 2D grid, rectSortingStrategy is sometimes better, 
          // but horizontal usually works well enough for wrapped flex items.
          strategy={horizontalListSortingStrategy}
        >
          {items.map((song) => (
            <SortableSongTile key={song.id} id={song.id} title={song.title} />
          ))}
        </SortableContext>
        
        {items.length === 0 && !isOver && (
          <div className="w-full flex justify-center items-center opacity-50 text-sm text-gray-500 h-full pointer-events-none">
            Drag songs here
          </div>
        )}
      </div>
    </div>
  );
};

export default DroppableTierRow;
