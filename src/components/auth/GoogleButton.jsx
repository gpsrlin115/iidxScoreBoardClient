// Uses Google's unmodified official logo and Google Sans from Google Fonts.
export default function GoogleButton({ onClick, disabled = false, busy = false, children = 'Google로 계속하기' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy}
      className="google-button inline-flex min-h-10 w-full items-center gap-[10px] rounded border border-[#747775] bg-white px-3 py-[9px] text-sm font-medium leading-5 text-[#1f1f1f] transition-colors hover:bg-[#f2f2f2] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      <img src="/google-g.png" width={20} height={20} alt="" className="h-5 w-5 shrink-0" />
      <span className="flex-1 text-center">{busy ? 'Google로 이동 중…' : children}</span>
    </button>
  );
}
