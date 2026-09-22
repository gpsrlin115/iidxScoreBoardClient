import { Link } from 'react-router-dom';

export default function DataActions({ iidxId }) {
  return (
    <section className="mb-6 border border-line-strong bg-panel p-5 sm:p-7" aria-labelledby="profile-data-title">
      <h2 id="profile-data-title" className="text-lg text-ink">데이터 관리</h2>
      <p className="mt-2 text-sm leading-6 text-muted">성적을 가져오거나, 준비 중인 계정 동기화 기능의 상태를 확인합니다.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Link to="/import/csv" className="group border border-line-strong bg-night p-4 transition hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <p className="font-mono text-[10px] uppercase tracking-[.16em] text-label">csv import</p>
          <p className="mt-2 text-sm text-ink">CSV 업로드 열기 <span aria-hidden="true" className="transition group-hover:ml-1">→</span></p>
          <p className="mt-2 text-xs leading-5 text-muted">e-amusement에서 내려받은 성적 파일을 가져옵니다.</p>
        </Link>
        <button type="button" disabled aria-describedby="crawler-unavailable" className="cursor-not-allowed border border-line-strong bg-night p-4 text-left opacity-70">
          <p className="font-mono text-[10px] uppercase tracking-[.16em] text-label">account sync</p>
          <p className="mt-2 text-sm text-ink">크롤링 준비 중</p>
          <p id="crawler-unavailable" className="mt-2 text-xs leading-5 text-muted">
            {iidxId ? 'IIDX-ID가 등록되었습니다. 동기화 기능이 준비되면 여기서 시작할 수 있습니다.' : '먼저 IIDX-ID를 등록하면 동기화 준비 상태를 확인할 수 있습니다.'}
          </p>
        </button>
      </div>
    </section>
  );
}
