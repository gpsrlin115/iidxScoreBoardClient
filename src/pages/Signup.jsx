import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authApi } from '../api/auth';
import { toAppError } from '../utils/httpError';

/**
 * 🎓 학습 포인트: 폼 유효성 검사 (Form Validation)
 *
 * 유효성 검사는 두 단계에서 합니다:
 *
 * 1. 클라이언트(프론트엔드): 제출 전 즉각 피드백
 *    → 빠르고 UX가 좋음
 *    → 하지만 우회 가능 → 보안 목적으로는 불충분
 *
 * 2. 서버(백엔드): 최종 검증
 *    → 절대로 생략하면 안 됨
 *    → 악의적인 요청도 막을 수 있음
 *
 * 이 컴포넌트는 클라이언트 유효성 검사만 담당합니다.
 * (비밀번호 일치 여부, 최소 길이 등)
 *
 * 🎓 errors 객체 패턴
 * 각 필드별 에러를 객체로 관리합니다:
 * { username: '이미 사용 중입니다', email: '', password: '8자 이상 필요' }
 * → 폼 필드 아래에 해당 에러 메시지를 표시합니다.
 */
const Signup = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    passwordConfirm: '',
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * 🎓 단일 onChange 핸들러 패턴
   *
   * 필드가 4개인데 각각 useState + onChange를 만들면:
   * → setUsername, setEmail, setPassword, setPasswordConfirm 4개 함수
   *
   * 대신 form 객체 하나 + e.target.name 활용:
   * → [e.target.name]: e.target.value 로 해당 필드만 업데이트
   * → input에 name="username" 등으로 구분
   *
   * 이것을 "Computed Property Name"이라고 합니다.
   * { [동적_키]: 값 } 형태로 객체를 만들 수 있습니다.
   */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // 타이핑 시작하면 해당 필드 에러 제거
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  // 클라이언트 유효성 검사
  const validate = () => {
    const newErrors = {};
    if (!form.username.trim()) {
      newErrors.username = '아이디를 입력해주세요.';
    } else if (form.username.length < 3) {
      newErrors.username = '아이디는 3자 이상이어야 합니다.';
    }
    if (!form.email.includes('@')) {
      newErrors.email = '올바른 이메일 형식이 아닙니다.';
    }
    if (form.password.length < 8) {
      newErrors.password = '비밀번호는 8자 이상이어야 합니다.';
    }
    if (form.password !== form.passwordConfirm) {
      newErrors.passwordConfirm = '비밀번호가 일치하지 않습니다.';
    }
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // 유효성 검사 실패 시 에러 표시 후 중단
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.signup({
        username: form.username,
        email: form.email,
        password: form.password,
      });
      toast.success('회원가입 완료! 로그인 해주세요.');
      navigate('/login');
    } catch (err) {
      const message = toAppError(err, { fallback: '회원가입 중 오류가 발생했습니다.' }).message;
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-darker flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* 로고 */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">🎵 IIDX</h1>
          <p className="text-slate-400 text-sm">ScoreBoard</p>
        </div>

        <div className="bg-slate-800 rounded-2xl p-8 shadow-2xl border border-slate-700">
          <h2 className="text-xl font-semibold text-white mb-6">회원가입</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 아이디 */}
            <div>
              <label className="block text-sm text-slate-400 mb-1" htmlFor="username">
                아이디
              </label>
              <input
                id="username"
                name="username"
                type="text"
                value={form.username}
                onChange={handleChange}
                className={`w-full bg-slate-700 text-white rounded-lg px-4 py-3 text-sm
                            border transition focus:outline-none focus:ring-2 focus:ring-offset-1
                            focus:ring-offset-slate-800
                            ${errors.username
                              ? 'border-red-500 focus:ring-red-500'
                              : 'border-slate-600 focus:border-primary-500 focus:ring-primary-500'
                            }`}
                placeholder="3자 이상"
                autoFocus
              />
              {errors.username && (
                <p className="text-xs text-red-400 mt-1">{errors.username}</p>
              )}
            </div>

            {/* 이메일 */}
            <div>
              <label className="block text-sm text-slate-400 mb-1" htmlFor="email">
                이메일
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                className={`w-full bg-slate-700 text-white rounded-lg px-4 py-3 text-sm
                            border transition focus:outline-none focus:ring-2 focus:ring-offset-1
                            focus:ring-offset-slate-800
                            ${errors.email
                              ? 'border-red-500 focus:ring-red-500'
                              : 'border-slate-600 focus:border-primary-500 focus:ring-primary-500'
                            }`}
                placeholder="example@email.com"
              />
              {errors.email && (
                <p className="text-xs text-red-400 mt-1">{errors.email}</p>
              )}
            </div>

            {/* 비밀번호 */}
            <div>
              <label className="block text-sm text-slate-400 mb-1" htmlFor="password">
                비밀번호
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                className={`w-full bg-slate-700 text-white rounded-lg px-4 py-3 text-sm
                            border transition focus:outline-none focus:ring-2 focus:ring-offset-1
                            focus:ring-offset-slate-800
                            ${errors.password
                              ? 'border-red-500 focus:ring-red-500'
                              : 'border-slate-600 focus:border-primary-500 focus:ring-primary-500'
                            }`}
                placeholder="8자 이상"
              />
              {errors.password && (
                <p className="text-xs text-red-400 mt-1">{errors.password}</p>
              )}
            </div>

            {/* 비밀번호 확인 */}
            <div>
              <label className="block text-sm text-slate-400 mb-1" htmlFor="passwordConfirm">
                비밀번호 확인
              </label>
              <input
                id="passwordConfirm"
                name="passwordConfirm"
                type="password"
                value={form.passwordConfirm}
                onChange={handleChange}
                className={`w-full bg-slate-700 text-white rounded-lg px-4 py-3 text-sm
                            border transition focus:outline-none focus:ring-2 focus:ring-offset-1
                            focus:ring-offset-slate-800
                            ${errors.passwordConfirm
                              ? 'border-red-500 focus:ring-red-500'
                              : 'border-slate-600 focus:border-primary-500 focus:ring-primary-500'
                            }`}
                placeholder="비밀번호를 다시 입력하세요"
              />
              {errors.passwordConfirm && (
                <p className="text-xs text-red-400 mt-1">{errors.passwordConfirm}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary-500 hover:bg-primary-700 disabled:opacity-50
                         disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg
                         transition mt-2"
            >
              {isSubmitting ? '가입 중...' : '회원가입'}
            </button>
          </form>

          <p className="text-center text-slate-500 text-sm mt-6">
            이미 계정이 있으신가요?{' '}
            <Link to="/login" className="text-primary-500 hover:text-primary-400 transition">
              로그인
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signup;
