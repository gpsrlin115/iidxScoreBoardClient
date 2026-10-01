import clsx from 'clsx';
import {
  CLEAR_PALETTE,
  CLEAR_TYPE_LABELS,
  FC_CHIP_GLOW,
  normalizeClearType,
} from '../../utils/clearTypes';
import { getDifficultyDisplay } from '../../utils/difficulty';

/** Pure clear-lamp chip used by both interactive and shared tier tables. */
const TierSongChip = ({ song, dense = false, interactive = false, ...props }) => {
  const clearType = normalizeClearType(song.clearType) ?? 'NO_PLAY';
  const palette = CLEAR_PALETTE[clearType] ?? CLEAR_PALETTE.NO_PLAY;
  const songTitle = song.title;
  const difficulty = getDifficultyDisplay(song.difficulty);
  const isLeggendaria = difficulty.key === 'LEGGENDARIA';
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
        // LEGGENDARIA's " L" marker is CSS-generated, not a text node. It is
        // shorthand only -- screen readers get "LEGGENDARIA" from SongTile's
        // aria-label or the sr-only text below -- and as real text inside
        // the button it failed Lighthouse's label-in-name audit (the visible
        // "L" is not in the aria-label). aria-hidden does not help there: the
        // audit compares against the visible text regardless.
        isLeggendaria &&
          "after:font-mono after:text-[8.5px] after:opacity-70 after:content-['_L']",
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
      {/*
        The interactive chip is named by SongTile's aria-label, so this text is
        the read-only chip's only accessible name. It reads the same full chart
        name, and stays silent on a missing difficulty rather than voicing the
        admin "?" placeholder.
      */}
      {!interactive && !difficulty.isMissing && (
        <span className="sr-only"> {difficulty.fullLabel} 채보</span>
      )}
    </Component>
  );
};

export default TierSongChip;
