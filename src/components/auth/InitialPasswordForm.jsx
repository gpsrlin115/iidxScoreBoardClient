import { useState } from 'react';
import { googlePasswordError } from '../../utils/googleAuth';
import MonoButton from '../common/MonoButton';

export default function InitialPasswordForm({ busy, onSubmit }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    const message = googlePasswordError(password, confirmation);
    setError(message);
    if (message) return;
    // `onSubmit` reports its outcome instead of throwing, so a rejected save
    // (rate limit, network drop, server refusal) must leave both fields as the
    // user typed them — the form stays mounted and would otherwise be blanked.
    const saved = await onSubmit(password);
    if (!saved) return;
    setPassword('');
    setConfirmation('');
  };
  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      <p className="text-sm text-muted">Google 재인증을 완료했습니다. 새 비밀번호를 설정하면 아이디로도 로그인할 수 있습니다.</p>
      {[
        { id: 'initial-password', label: '새 비밀번호', value: password, update: setPassword },
        { id: 'initial-password-confirm', label: '새 비밀번호 확인', value: confirmation, update: setConfirmation },
      ].map(({ id, label, value, update }) => (
        <div key={id}>
          <label htmlFor={id} className="mb-2 block text-sm text-ink">{label}</label>
          <input id={id} type="password" value={value} onChange={(event) => update(event.target.value)}
            autoComplete="new-password" required minLength={8} disabled={busy}
            aria-describedby={error ? 'initial-password-error' : undefined}
            className="w-full border border-line-strong bg-night px-3 py-3 text-ink focus:border-accent focus:outline-none" />
        </div>
      ))}
      <p className="text-xs text-muted">8자 이상으로 입력해주세요.</p>
      {error && <p id="initial-password-error" role="alert" className="text-sm text-danger">{error}</p>}
      <MonoButton type="submit" fullWidth disabled={busy}>{busy ? '설정 중…' : '비밀번호 설정'}</MonoButton>
    </form>
  );
}
