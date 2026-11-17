import { useEffect, useRef } from 'react';
import StackedBar from '../common/StackedBar';
import SongTile from './SongTile';
import TierSongChip from './TierSongChip';
import { buildClearStack, isClearTypeCleared } from '../../utils/clearTypes';
import { flareSky } from '../background/starfieldBus';

/**
 * One row per tier: a sticky left-hand label/stats column next to the
 * tier's wrapped song chips.
 *
 * `top-16` is a fixed contract with TopBar.jsx's `h-16` (64px) height — this
 * column settles directly under the sticky top bar. Changing TopBar's
 * height without updating this offset reopens a gap or overlap here.
 */
const TierRows = ({ tiers, dense, readOnly = false, exportImage = false }) => {
  const tableRef = useRef(null);

  useEffect(() => {
    const table = tableRef.current;
    if (!table || exportImage) return undefined;

    let frame;
    let active = true;
    const measure = () => {
      if (!active) return;
      const labels = table.querySelectorAll('[data-tier-song-label]');
      if (!window.matchMedia('(min-width: 768px)').matches) {
        labels.forEach((label) => label.style.removeProperty('font-size'));
        return;
      }
      let maxHeight = 0;
      labels.forEach((label) => {
        const chip = label.parentElement;
        const style = window.getComputedStyle(chip);
        const fontSize = parseFloat(style.fontSize);
        const maxTextHeight = fontSize * 1.35 * 2 + 0.5;
        label.style.removeProperty('font-size');

        if (label.getBoundingClientRect().height > maxTextHeight) {
          let lower = Math.min(10, fontSize);
          let upper = fontSize;
          for (let i = 0; i < 6; i += 1) {
            const candidate = (lower + upper) / 2;
            label.style.fontSize = `${candidate}px`;
            if (label.getBoundingClientRect().height > maxTextHeight) upper = candidate;
            else lower = candidate;
          }
          label.style.fontSize = `${lower}px`;
        }

        const height = label.getBoundingClientRect().height
          + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
          + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
        maxHeight = Math.max(maxHeight, height);
      });
      if (maxHeight) table.style.setProperty('--tier-chip-height', `${Math.ceil(maxHeight)}px`);
    };
    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure);
    observer?.observe(table);
    window.addEventListener('resize', scheduleMeasure);
    document.fonts?.addEventListener('loadingdone', scheduleMeasure);
    document.fonts?.ready.then(scheduleMeasure);
    scheduleMeasure();

    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      document.fonts?.removeEventListener('loadingdone', scheduleMeasure);
    };
  }, [tiers, dense, exportImage]);

  return (
    <div ref={tableRef}>
      {tiers.map(({ tier, songs }) => {
        const clearedCount = songs.filter((song) => isClearTypeCleared(song.clearType)).length;
        const pct = songs.length > 0 ? Math.round((clearedCount / songs.length) * 100) : 0;

        const segments = buildClearStack(songs).map((segment) => ({
          key: segment.key,
          pct: segment.pct,
          background: segment.solid,
          opacity: segment.key === 'NO_PLAY' ? 0.35 : 1,
          title: `${segment.label} ${segment.count}곡`,
        }));

        return (
          <div
            key={tier}
            className="grid grid-cols-[104px_minmax(0,1fr)] gap-[18px] border-b border-line-weak py-[14px]"
            onMouseEnter={readOnly ? undefined : flareSky}
          >
            <div className={readOnly ? 'self-start' : 'sticky top-16 self-start'}>
              <div className="font-num text-[19px] font-semibold text-ink">{tier}</div>
              <div className="font-num tnum text-[12px] text-muted">
                {clearedCount}/{songs.length} · {pct}%
              </div>
              <StackedBar segments={segments} height={5} rounded className="mt-[6px]" />
            </div>

            <div className="flex flex-wrap content-start" style={{ gap: dense ? 2 : 4 }}>
              {songs.map((song, index) => (
                readOnly ? (
                  <TierSongChip
                    key={`${song.title}-${song.difficulty ?? index}`}
                    song={song}
                    dense={dense}
                    exportImage={exportImage}
                  />
                ) : (
                  <SongTile
                    key={`${song.title}-${song.difficulty ?? index}`}
                    song={song}
                    dense={dense}
                  />
                )
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TierRows;
