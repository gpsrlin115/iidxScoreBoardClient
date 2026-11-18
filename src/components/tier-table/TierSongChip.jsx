import clsx from 'clsx';
import {
  CLEAR_PALETTE,
  CLEAR_TYPE_LABELS,
  FC_CHIP_GLOW,
  normalizeClearType,
} from '../../utils/clearTypes';
import { getDifficultyDisplay } from '../../utils/difficulty';

/** Pure clear-lamp chip used by both interactive and shared tier tables. */
const TierSongChip = ({ song, dense = false, interactive = false, exportImage = false, ...props }) => {
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
        'inline-block leading-[1.35]',
        exportImage
          ? 'whitespace-normal [overflow-wrap:anywhere]'
          : 'overflow-hidden text-ellipsis whitespace-nowrap md:whitespace-normal md:[overflow-wrap:anywhere]',
        interactive && [
          'transition-transform duration-[160ms] hover:-translate-y-px',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        ],
        !exportImage && (dense
          ? 'max-w-[158px] px-[5px] py-[2px] text-[10.5px]'
          : 'max-w-[210px] px-2 py-1 text-[12px]'),
        exportImage
          ? [
              'inline-flex w-[210px] max-w-full shrink-0 items-center justify-center text-center h-[var(--tier-chip-height,auto)]',
              dense
                ? 'px-[7px] py-[2.8px] text-[14.7px]'
                : 'px-[11.2px] py-[5.6px] text-[16.8px]',
            ]
          : [
              'md:inline-flex md:w-[min(210px,100%)] md:max-w-full md:shrink-0 md:items-center md:justify-center md:text-center md:h-[var(--tier-chip-height,auto)]',
              dense
                ? 'md:px-[7px] md:py-[2.8px] md:text-[14.7px]'
                : 'md:px-[11.2px] md:py-[5.6px] md:text-[16.8px]',
            ]
      )}
      style={{
        fontFamily: "var(--tier-export-font, 'IBM Plex Sans JP', 'Gothic A1', sans-serif)",
        fontWeight: 400,
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.bd}`,
        borderRadius: '3px',
        boxShadow: clearType === 'FULLCOMBO_CLEAR' ? FC_CHIP_GLOW : undefined,
      }}
      title={`${songTitle} · ${CLEAR_TYPE_LABELS[clearType]}`}
      {...props}
    >
      <span
        data-tier-song-label={isLeggendaria ? 'leggendaria' : ''}
        className={clsx(
          'block',
          exportImage
            ? 'w-full shrink-0'
            : 'overflow-hidden text-ellipsis md:w-full md:shrink-0 md:overflow-visible',
          // Keep the visible difficulty shorthand out of the accessible name.
          isLeggendaria && [
            "after:font-mono after:text-[8.5px] after:opacity-70 after:content-['_L']",
            exportImage ? 'after:text-[11.9px]' : 'md:after:text-[11.9px]',
          ]
        )}
      >
        {songTitle}
      </span>
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
