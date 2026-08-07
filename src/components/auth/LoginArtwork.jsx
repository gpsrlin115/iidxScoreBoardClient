const LoginArtwork = () => (
  <div
    className="pointer-events-none relative h-[clamp(160px,28svh,230px)] w-full shrink-0 overflow-hidden
               sm:absolute sm:inset-0 sm:h-auto"
    aria-hidden="true"
  >
    <img
      src="/assets/login-character-v1.webp"
      alt=""
      width="941"
      height="1672"
      decoding="async"
      fetchPriority="high"
      className="absolute left-1/2 top-0 h-[68svh] w-auto max-w-none -translate-x-1/2 opacity-[0.55]
                 sm:bottom-[-8vh] sm:top-auto sm:h-[100vh] sm:translate-x-[-12%] sm:opacity-[0.2]
                 lg:h-[112vh] lg:translate-x-[8%] lg:opacity-[0.28]"
    />
    <div
      className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_55%,#020617_100%)]
                 sm:bg-[radial-gradient(circle_at_center,rgba(2,6,23,0.3),rgba(2,6,23,0.78)_68%,#020617_100%)]"
    />
  </div>
);

export default LoginArtwork;
