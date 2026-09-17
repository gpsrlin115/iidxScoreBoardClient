import ErrorView from '../../components/common/ErrorView';

/**
 * Teapot screen at TEAPOT_PATH (`src/constants/teapot.js`), where the
 * Konami-code easter egg lands.
 *
 * The servers answer that path with a real `418 I'm a teapot` whose body is
 * the regular index.html, so opening it directly still boots the app and
 * this route draws the illustrated 418 preset. The easter egg itself arrives
 * by a client-side route change right after fetching that 418. Like
 * `NotFoundPage` it sits outside `ProtectedLayout` and brings its own
 * full-screen container.
 */
const TeapotPage = () => (
  <div className="min-h-screen bg-night flex items-center justify-center px-4">
    <ErrorView status={418} variant="page" />
  </div>
);

export default TeapotPage;
