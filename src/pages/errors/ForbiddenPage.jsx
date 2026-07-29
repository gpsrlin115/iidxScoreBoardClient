import ErrorView from '../../components/common/ErrorView';

/**
 * 403 fallback page for role-restricted routes.
 *
 * This renders inside `ProtectedLayout`'s <main> (via `ProtectedRoute`),
 * so a Header is already present — only vertical padding is added here,
 * no full-screen container or background.
 */
const ForbiddenPage = () => (
  <div className="py-12">
    <ErrorView status={403} variant="page" />
  </div>
);

export default ForbiddenPage;
