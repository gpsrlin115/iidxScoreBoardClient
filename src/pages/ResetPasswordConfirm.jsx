import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authApi } from '../api/auth';

const ResetPasswordConfirm = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      toast.error('유효하지 않은 접근입니다. 토큰이 없습니다.');
      navigate('/login');
    }
  }, [token, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== passwordConfirm) {
      toast.error('비밀번호가 일치하지 않습니다.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await authApi.confirmPasswordReset(token, password);
      toast.success(res.message || '비밀번호가 성공적으로 변경되었습니다!');
      // 성공 후 로그인 페이지로 이동
      navigate('/login');
    } catch (err) {
      const msg = err.response?.data?.message || '비밀번호 재설정에 실패했습니다. 토큰이 만료되었을 수 있습니다.';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token) return null; // useEffect에서 리다이렉트 처리됨

  return (
    <div className="min-h-screen bg-bg-darker flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">🎵 IIDX</h1>
          <p className="text-slate-400 text-sm">새 비밀번호 설정</p>
        </div>

        <div className="bg-slate-800 rounded-2xl p-8 shadow-2xl border border-slate-700">
          <h2 className="text-xl font-semibold text-white mb-6">비밀번호 재설정</h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1" htmlFor="password">
                새 비밀번호
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-700 text-white rounded-lg px-4 py-3 text-sm
                           border border-slate-600 focus:outline-none focus:border-primary-500
                           transition"
                placeholder="새로운 비밀번호를 입력하세요"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1" htmlFor="passwordConfirm">
                새 비밀번호 확인
              </label>
              <input
                id="passwordConfirm"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="w-full bg-slate-700 text-white rounded-lg px-4 py-3 text-sm
                           border border-slate-600 focus:outline-none focus:border-primary-500
                           transition"
                placeholder="비밀번호를 한 번 더 입력하세요"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary-500 hover:bg-primary-700 disabled:opacity-50
                         disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg
                         transition mt-4"
            >
              {isSubmitting ? '변경 중...' : '비밀번호 변경하기'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-700 text-center">
            <Link to="/login" className="text-sm text-slate-400 hover:text-white transition">
              &larr; 로그인 화면으로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordConfirm;
