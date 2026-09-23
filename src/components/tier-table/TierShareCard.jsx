import TierRows from './TierRows';
import TierLegend from './TierLegend';
import { calculateTierProgress } from '../../utils/tierShare';

const formatGeneratedAt = (date) => new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(date);

const TierShareCard = ({ username, level, playStyle, mode, tiers, generatedAt }) => {
  const progress = calculateTierProgress(tiers);

  return (
    <section className="bg-night p-12 text-ink" style={{ width: 1280 }}>
      <div className="mb-6 flex items-end justify-between gap-6 border-b border-line pb-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.24em] text-label">
            iidx score board · tier table
          </p>
          <h1 className="mt-2 font-num text-[28px] font-semibold tracking-[-.015em] text-ink">
            {username} · {'☆'}{level} {playStyle}
          </h1>
        </div>
        <div className="text-right">
          <div className="font-num text-[25px] font-semibold text-accent">{progress.percent}%</div>
          <div className="font-num tnum text-[12px] text-muted">
            {progress.cleared} / {progress.total} · {mode}
          </div>
        </div>
      </div>

      <TierRows tiers={tiers} dense={mode === 'dense'} readOnly />
      <TierLegend className="mt-6" />

      <footer className="mt-5 flex justify-between font-mono text-[9px] uppercase tracking-[.15em] text-dim">
        <span>current clear lamps at export time</span>
        <span>{formatGeneratedAt(generatedAt)}</span>
      </footer>
    </section>
  );
};

export default TierShareCard;
