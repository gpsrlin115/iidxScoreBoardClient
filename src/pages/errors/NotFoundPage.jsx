import ErrorView from '../../components/common/ErrorView';
import tsugaru404 from '../../assets/tsugaru-404.webp';

/**
 * 404 fallback page for undefined routes (`App.jsx` path="*").
 *
 * That route sits outside `ProtectedLayout`, so there is no shared
 * Header — this wrapper provides its own full-screen container and
 * background instead of relying on a parent layout.
 */
const NotFoundPage = () => (
  <div className="min-h-screen bg-night flex items-center justify-center px-4">
    <ErrorView
      status={404}
      variant="page"
      illustration={
        <img
          src={tsugaru404}
          alt="실망한 표정의 TSUGARU 캐릭터"
          width="640"
          height="640"
          decoding="async"
          className="w-56 sm:w-64 rounded-3xl border border-white/10 shadow-2xl shadow-black/30"
        />
      }
    />
  </div>
);

export default NotFoundPage;
