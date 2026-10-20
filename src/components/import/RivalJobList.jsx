import { Link } from 'react-router-dom';
import {
  formatServerTime, isActiveJob, isRequestActive, isRequestTerminal, partialMessage, requestJobs, SERIES_TOTAL,
  STATUS_LABELS, waitingReasonText,
} from '../../utils/rivalCrawler';

const formatCount = (value) => Number(value).toLocaleString();

// Rival collection never fetches song details, so the detail fields (and their raw
// server codes) are not listed. waitingReason is shown only through its Korean copy.
const VALUE_FIELDS = [
  ['aheadCount', '앞선 대기 작업'],
  ['progressPercent', '진행률', (value) => `${value}%`],
  ['estimatedStartAt', '예상 시작', formatServerTime],
  ['estimatedFinishAt', '예상 완료', formatServerTime],
  ['nextRequestAt', '다음 요청', formatServerTime],
  ['waitingReason', '대기 사유', waitingReasonText],
];

function JobDetails({ job }) {
  const pairs = [];
  if (job.requestsDone != null || job.requestsEstimated != null) {
    const show = (value) => (value == null ? '—' : formatCount(value));
    pairs.push({ key: 'requests', label: '요청', value: `${show(job.requestsDone)} / ${show(job.requestsEstimated)}` });
  }
  VALUE_FIELDS.forEach(([key, label, format]) => {
    if (job[key] == null || job[key] === '') return;
    const value = format(job[key]);
    if (value != null) pairs.push({ key, label, value });
  });
  if (pairs.length === 0) return null;

  return (
    <dl className="mt-2 grid gap-x-5 gap-y-1 sm:grid-cols-2">
      {pairs.map(({ key, label, value }) => (
        <div key={key} className="flex min-w-0 justify-between gap-3 text-[12px]">
          <dt className="shrink-0 text-faint">{label}</dt>
          <dd className="min-w-0 break-words text-right text-text2">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Fixed Korean copy per status. The server's errorMessage is an English code
 * sentence for rival jobs and is never rendered.
 */
function jobMessage(job) {
  switch (job?.status) {
    case 'QUEUED': return '작업이 대기열에 등록되었습니다.';
    case 'RUNNING': return '내 기록을 수집하고 있습니다.';
    case 'DONE': return '목록 수집이 완료되었습니다. 이번 수집은 MISS COUNT를 갱신하지 않으며 기존 기록은 유지됩니다.';
    case 'PARTIAL': return partialMessage(job);
    case 'FAILED': return '수집에 실패했습니다. 기존 기록은 유지됩니다. 연결과 서버 상태를 확인한 뒤 다시 요청할 수 있습니다.';
    case 'CANCELLED': return '작업이 취소되었습니다. 이미 저장된 기록은 삭제되지 않습니다.';
    default: return null;
  }
}

function progressText(job) {
  if (!Number.isFinite(job.pagesDone) && !Number.isFinite(job.pagesTotal)) return null;
  const done = Number.isFinite(job.pagesDone) ? job.pagesDone : '—';
  const total = Number.isFinite(job.pagesTotal) ? job.pagesTotal : SERIES_TOTAL;
  return `${done}/${total}`;
}

function JobRow({ job }) {
  const active = isActiveJob(job);
  const label = STATUS_LABELS[job.status] ?? '상태 확인 중';
  const progress = progressText(job);
  const stamp = job.queuedAt ?? job.startedAt ?? job.finishedAt;
  return (
    <li className="border-t border-line py-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${active ? 'bg-accent' : 'bg-info'}`} aria-hidden="true" />
          <h3 className="text-[13px] text-ink">
            {job.playStyle ? `${job.playStyle} ` : ''}{label}{progress && <span className="ml-1 font-mono text-text2">{progress}</span>}
          </h3>
        </div>
        {stamp != null && <span className="font-mono text-[10px] text-faint">{formatServerTime(stamp)}</span>}
      </div>
      {jobMessage(job) && <p className="mt-1 text-[12px] text-text2">{jobMessage(job)}</p>}
      <JobDetails job={job} />
    </li>
  );
}

/** One line per job of the latest request (SP first), then a link to scores once all have ended. */
export default function RivalJobList({ status }) {
  const jobs = requestJobs(status);
  if (jobs.length === 0) return null;
  return (
    <div className="mt-4 rounded-[4px] border border-line bg-surface-weak p-4" aria-live="polite">
      <ul>
        {jobs.map((job) => <JobRow key={job.id ?? job.playStyle} job={job} />)}
      </ul>
      {isRequestActive(status) && jobs.length > 1 && (
        <p className="mt-2 text-[11px] text-faint">SP 작업이 끝나면 DP 작업을 이어서 시작합니다.</p>
      )}
      {isRequestTerminal(status) && (
        <Link className="mt-3 inline-block text-[11px] text-info underline underline-offset-2" to="/scores">점수 확인</Link>
      )}
    </div>
  );
}
