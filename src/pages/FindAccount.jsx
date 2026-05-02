import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authApi } from '../api/auth';

const FindAccount = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('id'); // 'id' or 'password'

  // 아이디 찾기 상태
  const [idEmail, setIdEmail] = useState('');
  const [maskedId, setMaskedId] = useState(null);
  const [isFindingId, setIsFindingId] = useState(false);

  // 비밀번호 찾기(재설정) 상태
  const [pwUsername, setPwUsername] = useState('');
  const [pwEmail, setPwEmail] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetToken, setResetToken] = useState(null);

  const handleFindId = async (e) => {
    e.preventDefault();
    setIsFindingId(true);
    setMaskedId(null);
    try {
      const res = await authApi.findUsername(idEmail);
      setMaskedId(res.maskedUsername);
      toast.success('아이디를 찾았습니다.');
    } catch (err) {
      const msg = err.response?.data?.message || '아이디 찾기에 실패했습니다.';
      toast.error(msg);
    } finally {
      setIsFindingId(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setIsResetting(true);
    setResetToken(null);
    try {
      const res = await authApi.requestPasswordReset(pwUsername, pwEmail);
      toast.success(res.message || '비밀번호 재설정 요청 성공');
      if (res.resetToken) {
        // 백엔드 명세: 개발 환경에서는 응답으로 토큰을 바로 내려줌
        setResetToken(res.resetToken);
      }
    } catch (err) {
      const msg = err.response?.data?.message || '요청에 실패했습니다. 입력 정보를 확인해주세요.';
      toast.error(msg);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-darker flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">🎵 IIDX</h1>
          <p className="text-slate-400 text-sm">ScoreBoard 계정 찾기</p>
        </div>

        <div className="bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 overflow-hidden">
          {/* 탭 헤더 */}
          <div className="flex border-b border-slate-700">
            <button
              className={`flex-1 py-4 text-sm font-semibold transition ${
                activeTab === 'id'
                  ? 'text-primary-500 border-b-2 border-primary-500'
                  : 'text-slate-400 hover:text-slate-300 bg-slate-800/50'
              }`}
              onClick={() => setActiveTab('id')}
              type="button"
            >
              아이디 찾기
            </button>
            <button
              className={`flex-1 py-4 text-sm font-semibold transition ${
                activeTab === 'password'
                  ? 'text-primary-500 border-b-2 border-primary-500'
                  : 'text-slate-400 hover:text-slate-300 bg-slate-800/50'
              }`}
              onClick={() => setActiveTab('password')}
              type="button"
            >
              비밀번호 재설정
            </button>
          </div>

          <div className="p-8">
            {/* 아이디 찾기 폼 */}
            {activeTab === 'id' && (
              <form onSubmit={handleFindId} className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1" htmlFor="idEmail">
                    가입한 이메일
                  </label>
                  <input
                    id="idEmail"
                    type="email"
                    value={idEmail}
                    onChange={(e) => setIdEmail(e.target.value)}
                    className="w-full bg-slate-700 text-white rounded-lg px-4 py-3 text-sm border border-slate-600 focus:outline-none focus:border-primary-500 transition"
                    placeholder="example@email.com"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isFindingId}
                  className="w-full bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition mt-4"
                >
                  {isFindingId ? '확인 중...' : '아이디 찾기'}
                </button>

                {maskedId && (
                  <div className="mt-4 p-4 bg-green-900/30 border border-green-800 rounded-lg text-center">
                    <p className="text-sm text-green-400 mb-1">회원님의 아이디는 다음과 같습니다.</p>
                    <p className="text-xl font-bold text-white tracking-widest">{maskedId}</p>
                  </div>
                )}
              </form>
            )}

            {/* 비밀번호 재설정 폼 */}
            {activeTab === 'password' && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1" htmlFor="pwUsername">
                    아이디
                  </label>
                  <input
                    id="pwUsername"
                    type="text"
                    value={pwUsername}
                    onChange={(e) => setPwUsername(e.target.value)}
                    className="w-full bg-slate-700 text-white rounded-lg px-4 py-3 text-sm border border-slate-600 focus:outline-none focus:border-primary-500 transition"
                    placeholder="아이디를 입력하세요"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1" htmlFor="pwEmail">
                    가입한 이메일
                  </label>
                  <input
                    id="pwEmail"
                    type="email"
                    value={pwEmail}
                    onChange={(e) => setPwEmail(e.target.value)}
                    className="w-full bg-slate-700 text-white rounded-lg px-4 py-3 text-sm border border-slate-600 focus:outline-none focus:border-primary-500 transition"
                    placeholder="example@email.com"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="w-full bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition mt-4"
                >
                  {isResetting ? '요청 중...' : '비밀번호 재설정 요청'}
                </button>

                {resetToken && (
                  <div className="mt-4 p-4 bg-amber-900/30 border border-amber-800 rounded-lg">
                    <p className="text-sm text-amber-500 mb-2 font-medium">
                      🛠️ [개발 환경] 메일 발송 대신 토큰이 직접 반환되었습니다.
                    </p>
                    <p className="text-xs text-slate-400 break-all mb-3 bg-slate-900 p-2 rounded">
                      토큰: {resetToken}
                    </p>
                    <Link
                      to={`/reset-password?token=${resetToken}`}
                      className="block w-full text-center bg-amber-600 hover:bg-amber-700 text-white py-2 rounded-md text-sm font-semibold transition"
                    >
                      새 비밀번호 설정하러 가기 &rarr;
                    </Link>
                  </div>
                )}
              </form>
            )}

            <div className="mt-6 pt-6 border-t border-slate-700 text-center">
              <Link to="/login" className="text-sm text-slate-400 hover:text-white transition">
                &larr; 로그인 화면으로 돌아가기
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FindAccount;
