import ErrorView from '../../components/common/ErrorView';

/**
 * 404 fallback page for undefined routes (`App.jsx` path="*").
 *
 * That route sits outside `ProtectedLayout`, so there is no shared
 * Header — this wrapper provides its own full-screen container and
 * background instead of relying on a parent layout.
 */
const NotFoundPage = () => (
  <div className="min-h-screen bg-night flex items-center justify-center px-4">
    <ErrorView status={404} variant="page" />
  </div>
);

export default NotFoundPage;
