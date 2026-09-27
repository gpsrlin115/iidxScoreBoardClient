/**
 * Play-count copy for one score row.
 *
 * IIDX never reports per-difficulty play counts. The CSV only gives a
 * per-song selection count (`プレー回数`, in game `SP選曲回数`) that restarts
 * at 0 every release. When only one difficulty of a song was touched in a
 * release, that count is the chart's exact count; otherwise the server only
 * counts plays where the record visibly changed, which is a lower bound.
 *
 * The server decides which case applies (`releasePlayCountExact`) and this
 * helper only turns that into copy — it never recomputes exactness.
 *
 * Returns null when the row has no release data: a crawler-only record, or a
 * server that predates `playCountRelease` / `releasePlayCount`. `songPlayCount`
 * alone can't tell those apart because older servers already send it. The
 * caller then keeps the legacy `plays N` text.
 *
 * @param {object} score - one row of the server score contract
 * @returns {{ text: string, lowerBoundHint: string | null, cumulative: string | null } | null}
 */
export const describePlayCount = (score) => {
  const release = typeof score?.playCountRelease === 'string' ? score.playCountRelease.trim() : '';
  const chartCount = score?.releasePlayCount;
  if (!release || !Number.isInteger(chartCount)) return null;

  const isExact = score.releasePlayCountExact === true;
  const chartText = `이 채보 ${chartCount}회${isExact ? '' : ' 이상'}`;
  const text = Number.isInteger(score.songPlayCount)
    ? `${release} 선곡 ${score.songPlayCount}회 · ${chartText}`
    : `${release} ${chartText}`;

  // The cumulative count spans releases, and whether it is exact is unknown.
  // "이상" stays true even when it happens to be exact.
  const cumulative = Number.isInteger(score.playCount) && score.playCount !== chartCount
    ? `누적 ${score.playCount}회 이상`
    : null;

  return {
    text,
    lowerBoundHint: isExact
      ? null
      : '선곡 회수를 채보별로 나눌 수 없어, 기록이 바뀐 플레이만 센 최솟값입니다.',
    cumulative,
  };
};
