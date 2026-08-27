import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getDifficultyDisplay } from '../../utils/difficulty';

const DIFFICULTY_BADGE_CLASSES = {
  B: 'border-emerald-500/70 bg-emerald-500/20 text-emerald-200',
  N: 'border-sky-500/70 bg-sky-500/20 text-sky-200',
  H: 'border-amber-500/70 bg-amber-500/20 text-amber-200',
  A: 'border-rose-500/70 bg-rose-500/20 text-rose-200',
  L: 'border-violet-500/70 bg-violet-500/20 text-violet-200',
  '?': 'border-gray-500 bg-gray-700 text-gray-300',
};

const getDifficultyBadgeClass = (label) => (
  DIFFICULTY_BADGE_CLASSES[label] ?? 'border-gray-500 bg-gray-700 text-gray-200'
);

/**
 * SongTileChip
 * Presentational song tile. Also rendered standalone inside DragOverlay,
 * where attaching useSortable again would duplicate the sortable id.
 */
export const SongTileChip = React.forwardRef(({
  title,
  difficulty,
  isDragging = false,
  style,
  ...rest
}, ref) => {
  const difficultyDisplay = getDifficultyDisplay(difficulty);
  const difficultyDescription = difficultyDisplay.label === '?'
    ? difficultyDisplay.fullLabel
    : `난이도 ${difficultyDisplay.fullLabel}`;

  return (
    <div
      ref={ref}
      style={style}
      {...rest}
      title={`${title} · ${difficultyDisplay.fullLabel}`}
      className={`
        inline-flex items-center gap-2 px-3 py-1.5 m-1 rounded text-sm font-semibold border shadow-sm
        cursor-grab active:cursor-grabbing select-none transition-colors
        ${isDragging
          ? 'bg-primary-600/50 border-primary-400 text-white z-50 opacity-80 scale-105'
          : 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700 hover:border-gray-500'
        }
      `}
    >
      <span className="truncate max-w-[150px]">{title}</span>
      <span
        aria-hidden="true"
        title={difficultyDisplay.fullLabel}
        className={`shrink-0 max-w-20 truncate rounded border px-1.5 py-0.5 font-mono text-[10px] leading-none ${getDifficultyBadgeClass(difficultyDisplay.label)}`}
      >
        {difficultyDisplay.label}
      </span>
      <span className="sr-only"> {difficultyDescription}</span>
    </div>
  );
});

SongTileChip.displayName = 'SongTileChip';

/**
 * SortableSongTile
 * A draggable and sortable component representing a single IIDX song in the admin editor.
 * Uses @dnd-kit/sortable hooks.
 */
const SortableSongTile = ({ id, title, difficulty }) => {
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
    <SongTileChip
      ref={setNodeRef}
      style={style}
      title={title}
      difficulty={difficulty}
      isDragging={isDragging}
      {...attributes}
      {...listeners}
    />
  );
};

export default SortableSongTile;
