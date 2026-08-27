import clsx from 'clsx';
import {
  CLEAR_PALETTE,
  CLEAR_TYPE_LABELS,
  FC_CHIP_GLOW,
  normalizeClearType,
} from '../../utils/clearTypes';

const difficultyLabel = {
  HYPER: 'H',
  ANOTHER: 'A',
  LEGGENDARIA: 'L',
};

/** Pure clear-lamp chip used by both interactive and shared tier tables. */
const TierSongChip = ({ song, dense = false, interactive = false, ...props }) => {
  const clearType = normalizeClearType(song.clearType) ?? 'NO_PLAY';
  const palette = CLEAR_PALETTE[clearType] ?? CLEAR_PALETTE.NO_PLAY;
  const songTitle = song.title;
  const difficulty = difficultyLabel[song.difficulty] ?? song.difficulty;
  const isLeggendaria = song.difficulty === 'LEGGENDARIA';
  const Component = interactive ? 'button' : 'span';

  return (
    <Component
      {...(interactive ? { type: 'button' } : {})}
      className={clsx(
        'inline-block overflow-hidden text-ellipsis whitespace-nowrap leading-[1.35]',
        interactive && [
          'transition-transform duration-[160ms] hover:-translate-y-px',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        ],
        dense
          ? 'max-w-[158px] px-[5px] py-[2px] text-[10.5px]'
          : 'max-w-[210px] px-2 py-1 text-[12px]'
      )}
      style={{
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.bd}`,
        borderRadius: '3px',
        boxShadow: clearType === 'FULLCOMBO_CLEAR' ? FC_CHIP_GLOW : undefined,
      }}
      title={`${songTitle} · ${CLEAR_TYPE_LABELS[clearType]}`}
      {...props}
    >
      {songTitle}
      {isLeggendaria && <span className="font-mono text-[8.5px] opacity-70"> L</span>}
      {!interactive && difficulty && (
        <span className="sr-only"> {difficulty} 채보</span>
      )}
    </Component>
  );
};

export default TierSongChip;
