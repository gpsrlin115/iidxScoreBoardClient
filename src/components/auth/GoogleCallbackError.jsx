import { Link, useSearchParams } from 'react-router-dom';
import { googleAuthError } from '../../utils/googleAuth';

export default function GoogleCallbackError() {
  const [params] = useSearchParams();
  const code = params.get('googleError');
  if (!code) return null;
  const error = googleAuthError(code);
  return (
    <div role="alert" className="mb-6 border border-line-strong bg-panel p-4 text-sm leading-6 text-ink">
      <p>{error.message}</p>
      {error.code === 'EMAIL_CONFLICT' && (
        <Link to="/find-account" className="mt-2 inline-block underline underline-offset-4">아이디 / 비밀번호 찾기</Link>
      )}
    </div>
  );
}
