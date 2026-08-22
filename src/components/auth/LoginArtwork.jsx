/**
 * Decorative character illustration behind the login form.
 *
 * Desktop: full-height art anchored to the right edge, faded under a radial
 * gradient so the text block on the left stays legible. Narrow screens fall
 * back to a smaller, fainter version so the art doesn't crowd the form.
 *
 * index.html preloads this exact path for /login — keep it in sync.
 */
const LoginArtwork = () => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
    <img
      src="/assets/login-character-v1.webp"
      alt=""
      width="941"
      height="1672"
      decoding="async"
      fetchPriority="high"
      className="absolute top-0 right-0 h-[46vh] w-auto max-w-none translate-x-[15%] opacity-[.14]
                 sm:top-[-4vh] sm:h-[85vh] sm:translate-x-[8%] sm:opacity-[.2]
                 lg:top-[-6vh] lg:h-[112vh] lg:translate-x-[4%] lg:opacity-[.32]"
    />
    <div
      className="absolute inset-0
                 bg-[linear-gradient(to_bottom,rgba(5,8,19,.4)_0%,#050813_75%)]
                 sm:bg-[radial-gradient(circle_at_center,rgba(5,8,19,.3),rgba(5,8,19,.78)_68%,#050813_100%)]
                 lg:bg-[radial-gradient(120%_90%_at_20%_50%,rgba(5,8,19,.95)_14%,rgba(5,8,19,.72)_48%,rgba(5,8,19,.25)_100%)]"
    />
  </div>
);

export default LoginArtwork;
