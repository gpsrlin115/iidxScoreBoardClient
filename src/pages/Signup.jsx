import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authApi } from '../api/auth';
import { toAppError } from '../utils/httpError';
import Starfield from '../components/background/Starfield';
import FieldLabel from '../components/auth/FieldLabel';
import LoginArtwork from '../components/auth/LoginArtwork';
import MonoButton from '../components/common/MonoButton';
import GoogleEntry from '../components/auth/GoogleEntry';

// Shares the login screen's visual language: same underline fields, same
// left-aligned block over the artwork, so the two auth screens read as one flow.
const inputClass = (hasError, isPassword) =>
  [
    'w-full bg-transparent border-0 border-b pb-[9px] text-[15px] text-ink',
    // Hints must not read as already-filled values next to the real input text.
    'placeholder:text-[13px] placeholder:tracking-normal placeholder:text-faint2',
    'transition-colors focus:outline-none',
    hasError ? 'border-danger focus:border-danger' : 'border-[rgba(236,234,244,.16)] focus:border-accent',
    isPassword ? 'tracking-[.16em]' : '',
  ]
    .filter(Boolean)
    .join(' ');

const FIELDS = [
  {
    name: 'username',
    caption: 'username',
    label: '아이디',
    type: 'text',
    placeholder: '3자 이상',
    autoComplete: 'username',
    autoFocus: true,
  },
  {
    name: 'email',
    caption: 'email',
    label: '이메일',
    type: 'email',
    placeholder: 'you@example.com',
    autoComplete: 'email',
  },
  {
    name: 'password',
    caption: 'password',
    label: '비밀번호',
    type: 'password',
    placeholder: '8자 이상',
    autoComplete: 'new-password',
  },
  {
    name: 'passwordConfirm',
    caption: 'confirm',
    label: '비밀번호 확인',
    type: 'password',
    placeholder: '',
    autoComplete: 'new-password',
  },
];

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
  const [googleBusy, setGoogleBusy] = useState(false);

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
    if (isSubmitting || googleBusy) return;

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
    <div className="relative flex min-h-screen items-center overflow-hidden bg-night">
      <Starfield litRatio={0.5} />
      <LoginArtwork />

      <div className="relative mx-auto w-full max-w-[1180px] px-6 py-12 sm:px-14">
        <div className="max-w-[400px]">
          <div className="mb-14 flex items-center gap-[11px]">
            <img src="/favicon.png" alt="" width={22} height={22} className="block rounded-[3px]" />
            <span className="font-mono text-xs uppercase tracking-[.2em] text-ink">
              IIDX ScoreBoard
            </span>
          </div>

          <p className="mb-11 font-mono text-[10px] uppercase tracking-[.24em] text-label">
            create account
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
            {FIELDS.map(({ name, caption, label, type, placeholder, autoComplete, autoFocus }) => (
              <div key={name}>
                <FieldLabel htmlFor={name} caption={caption}>
                  {label}
                </FieldLabel>
                <input
                  id={name}
                  name={name}
                  type={type}
                  value={form[name]}
                  onChange={handleChange}
                  className={inputClass(Boolean(errors[name]), type === 'password')}
                  placeholder={placeholder}
                  autoComplete={autoComplete}
                  autoFocus={autoFocus}
                  aria-invalid={errors[name] ? true : undefined}
                  aria-describedby={errors[name] ? `${name}-error` : undefined}
                />
                {errors[name] && (
                  <p id={`${name}-error`} className="mt-[6px] text-[12px] text-danger">
                    {errors[name]}
                  </p>
                )}
              </div>
            ))}

            <MonoButton
              type="submit"
              variant="accent"
              fullWidth
              disabled={isSubmitting || googleBusy}
              trailing={<span>&#8594;</span>}
              className="mt-2"
            >
              {isSubmitting ? '가입 중...' : '회원가입'}
            </MonoButton>
          </form>
          <GoogleEntry signup disabled={isSubmitting} onBusyChange={setGoogleBusy} />

          <div className="mt-6 flex items-center gap-4 text-[12.5px]">
            <span className="text-faint">이미 계정이 있으신가요?</span>
            <Link to="/login" className="text-accent transition-colors hover:text-ink">
              로그인
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;
