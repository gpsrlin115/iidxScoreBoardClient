import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * SortableSongTile
 * A draggable and sortable component representing a single IIDX song in the admin editor.
 * Uses @dnd-kit/sortable hooks.
 */
const SortableSongTile = ({ id, title }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`
        inline-flex items-center px-3 py-1.5 m-1 rounded text-sm font-semibold border shadow-sm
        cursor-grab active:cursor-grabbing select-none transition-colors
        ${isDragging 
          ? 'bg-primary-600/50 border-primary-400 text-white z-50 opacity-80 scale-105' 
          : 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700 hover:border-gray-500'
        }
      `}
    >
      <span className="truncate max-w-[150px]" title={title}>{title}</span>
    </div>
  );
};

export default SortableSongTile;
