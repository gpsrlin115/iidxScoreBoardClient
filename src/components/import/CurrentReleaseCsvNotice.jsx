const ZINRAI_CSV_DOWNLOAD_URL =
  'https://p.eagate.573.jp/game/2dx/34/djdata/score_download.html';

const CurrentReleaseCsvNotice = () => (
  <section
    aria-labelledby="current-release-csv-title"
    className="mt-[18px] rounded-[4px] border border-[rgba(231,155,187,.28)] bg-[rgba(231,155,187,.05)] px-[16px] py-[14px]"
  >
    <h2
      id="current-release-csv-title"
      className="font-mono text-[9px] uppercase tracking-[.15em] text-accent"
    >
      IIDX 34 ZINRAI CSV
    </h2>
    <p className="mt-[5px] text-[13.5px] text-text2">
      현재는 IIDX 34 ZINRAI에서 내려받은 성적 CSV만 업로드해 주세요.
    </p>
    <p className="mt-[3px] text-[12.5px] text-muted">
      작품 전환 전에 받은 IIDX 33 이하의 CSV는 업로드하지 마세요.
    </p>
    <a
      href={ZINRAI_CSV_DOWNLOAD_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="IIDX 34 공식 CSV 다운로드 페이지 열기(새 창)"
      className="mt-[10px] inline-flex items-center gap-[5px] text-[12.5px] text-accent underline decoration-[rgba(231,155,187,.45)] underline-offset-[3px] transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      공식 CSV 다운로드 페이지 열기
      <span aria-hidden="true">↗</span>
    </a>
  </section>
);

export default CurrentReleaseCsvNotice;
