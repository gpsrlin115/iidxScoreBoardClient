import StackedBar from '../common/StackedBar';
import SongTile from './SongTile';
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
const TierRows = ({ tiers, dense }) => {
  return (
    <div>
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
            onMouseEnter={flareSky}
          >
            <div className="sticky top-16 self-start">
              <div className="font-num text-[19px] font-semibold text-ink">{tier}</div>
              <div className="font-num tnum text-[12px] text-muted">
                {clearedCount}/{songs.length} · {pct}%
              </div>
              <StackedBar segments={segments} height={5} rounded className="mt-[6px]" />
            </div>

            <div className="flex flex-wrap content-start" style={{ gap: dense ? 2 : 4 }}>
              {songs.map((song, index) => (
                <SongTile
                  key={`${song.title}-${song.difficulty ?? index}`}
                  song={song}
                  dense={dense}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TierRows;
