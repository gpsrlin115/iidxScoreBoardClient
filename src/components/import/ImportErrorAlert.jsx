/**
 * Inline replacement for the toast-based error messages this screen used
 * to show — see docs/design_handoff_night_sky_redesign, section 5. Renders
 * nothing when there's no error, so callers can mount it unconditionally.
 *
 * @param {{ tag: string, message: string, retryable?: boolean } | null} errorInfo
 *   Produced by utils/importError.js for server failures, or inline by the
 *   import screen for client-side file validation.
 */
const ImportErrorAlert = ({ errorInfo }) => {
  if (!errorInfo) return null;

  return (
    <div role="alert" className="mt-[12px] rounded-[4px] border border-[rgba(201,96,96,.35)] bg-[rgba(201,96,96,.06)] px-[15px] py-[13px]">
      <p className="font-mono text-[8.5px] uppercase tracking-[.14em] text-danger">
        {errorInfo.tag}
      </p>
      <p className="mt-[4px] text-[13px] text-[#dfc3c3]">{errorInfo.message}</p>
    </div>
  );
};

export default ImportErrorAlert;
