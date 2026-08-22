import clsx from 'clsx';
import { CLEAR_PALETTE, CLEAR_TYPE_LABELS, normalizeClearType } from '../../utils/clearTypes';

/**
 * ClearBadge - single source of truth for clear-type badges.
 *
 * Replaces the three previously duplicated implementations: ScoreTable's
 * local ClearBadge, Dashboard's inline ternary, and SongTile's
 * getColorClass. Colors and labels always come from clearTypes.js so the
 * palette lives in exactly one place.
 *
 * @param {string} clearType - raw clear type value, normalized internally
 * @param {number} [minWidth] - optional min-width in px (e.g. 54 on score cards)
 * @param {string} [className]
 */
const ClearBadge = ({ clearType, minWidth, className = '' }) => {
  const normalized = normalizeClearType(clearType);
  const palette = CLEAR_PALETTE[normalized] ?? CLEAR_PALETTE.NO_PLAY;
  const label = CLEAR_TYPE_LABELS[normalized] ?? CLEAR_TYPE_LABELS.NO_PLAY;

  return (
    <span
      className={clsx(
        'font-mono text-[9px] uppercase rounded-[3px] px-[7px] py-[3px] text-center',
        className
      )}
      style={{
        // Shorthand `background` (not backgroundColor) — FULLCOMBO_CLEAR's
        // palette value is a gradient string and needs the shorthand.
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.bd}`,
        ...(minWidth ? { minWidth } : {}),
      }}
    >
      {label}
    </span>
  );
};

export default ClearBadge;
