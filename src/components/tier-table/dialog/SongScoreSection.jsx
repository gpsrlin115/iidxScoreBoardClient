import { formatClearType, formatDateTime, formatNumber } from './scoreFormat';

// `numeric` picks font-num/tnum (tabular figures) for the four measured
// values — score, BP, PGREAT, GREAT — while clear type / DJ LEVEL / played-at
// stay on font-mono, matching how the rest of the app renders label-like
// metadata rather than a measurement.
const DetailValue = ({ label, value, emphasis = false, numeric = false, className = '' }) => (
  <div className={`rounded-[3px] border border-line bg-night/60 px-3 py-2 ${className}`}>
    <dt className="text-xs text-muted">{label}</dt>
    <dd
      className={`mt-1 ${numeric ? 'font-num tnum' : 'font-mono'} ${
        emphasis ? 'text-lg font-bold text-ink' : 'text-sm text-text2'
      }`}
    >
      {value}
    </dd>
  </div>
);

const RecordSection = ({ title, tone, score, missCount, pGreat, great, clearType, djLevel, playedAt, isBest }) => (
  <section className="rounded-[4px] border border-line bg-surface p-4">
    <h3 className={`mb-3 text-sm font-bold ${tone}`}>{title}</h3>
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <DetailValue label={isBest ? '역대 최고 점수' : '최근 수집 점수'} value={formatNumber(score)} emphasis numeric />
      <DetailValue label={isBest ? '최고점 당시 BP' : '최근 수집 BP'} value={formatNumber(missCount)} emphasis numeric />
      <DetailValue label="PGREAT" value={formatNumber(pGreat)} numeric />
      <DetailValue label="GREAT" value={formatNumber(great)} numeric />
      <DetailValue label="클리어" value={formatClearType(clearType)} />
      <DetailValue label="DJ LEVEL" value={djLevel ?? '-'} />
      <DetailValue label="기록 시각" value={formatDateTime(playedAt)} className="col-span-2" />
    </dl>
  </section>
);

/**
 * Personal best/last record block for one chart.
 *
 * @param {object | null} details - A ScoreResponse, or null when the user has
 *   no record for this chart.
 * @param {boolean} [isFallbackScore] - True when `details` belongs to a
 *   different chart of the same song, because the tier entry carried no
 *   difficulty to match on. Surfaced so the numbers are not read as this
 *   chart's own record.
 */
const SongScoreSection = ({ details, isFallbackScore = false }) => {
  if (!details) {
    return (
      <div className="mt-5 rounded-[4px] border border-dashed border-line-strong bg-night/50 px-5 py-10 text-center">
        <p className="font-medium text-text2">이 채보의 플레이 기록이 없습니다.</p>
        <p className="mt-1 text-sm text-muted">CSV를 가져온 뒤 다시 확인해 주세요.</p>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-3">
      {isFallbackScore && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
          이 서열표 항목에 난이도 정보가 없어, 같은 곡의 다른 채보 기록을 대신 표시합니다
          {details.chart?.chartType ? ` (${details.chart.chartType})` : ''}.
        </p>
      )}
      <RecordSection
        title="역대 최고 기록"
        tone="text-info"
        score={details.bestScore}
        missCount={details.bestMissCount}
        pGreat={details.bestPGreat}
        great={details.bestGreat}
        clearType={details.bestClearType}
        djLevel={details.bestDjLevel}
        playedAt={details.bestPlayedAt}
        isBest
      />
      <RecordSection
        title="최근 수집 기록"
        tone="text-accent"
        score={details.lastScore}
        missCount={details.lastMissCount}
        pGreat={details.lastPGreat}
        great={details.lastGreat}
        clearType={details.lastClearType}
        djLevel={details.lastDjLevel}
        playedAt={details.lastPlayedAt}
      />
      <p className="px-1 text-xs leading-relaxed text-muted">
        BP는 백엔드의 MISS COUNT입니다. 최고점 BP는 최저 BP가 아니라 최고 점수를 기록했을 당시 값입니다.
      </p>
    </div>
  );
};

export default SongScoreSection;
