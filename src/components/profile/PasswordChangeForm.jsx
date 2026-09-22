import { useState } from 'react';
import toast from 'react-hot-toast';
import MonoButton from '../common/MonoButton';
import { profileApi } from '../../api/profile';
import { profileError } from '../../utils/profileError';

const inputClass = (hasError) => [
  'mt-1 w-full border bg-night px-3 py-3 text-ink focus:outline-none',
  hasError ? 'border-danger focus:border-danger' : 'border-line-strong focus:border-accent',
].join(' ');

export default function PasswordChangeForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (newPassword.length < 8) {
      setError('새 비밀번호는 8자 이상으로 입력해주세요.');
      return;
    }
    if (newPassword !== confirmation) {
      setError('새 비밀번호가 일치하지 않습니다.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await profileApi.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      toast.success('비밀번호를 변경했습니다. 다른 기기의 로그인은 종료됩니다.');
    } catch (requestError) {
      setError(profileError(requestError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="mt-5 space-y-4" onSubmit={submit} noValidate>
      <div>
        <label htmlFor="current-password" className="block text-sm text-ink">현재 비밀번호</label>
        <input id="current-password" type="password" value={currentPassword} autoComplete="current-password" required disabled={busy}
          onChange={(event) => setCurrentPassword(event.target.value)} className={inputClass(Boolean(error))} />
      </div>
      <div>
        <label htmlFor="new-password" className="block text-sm text-ink">새 비밀번호</label>
        <input id="new-password" type="password" value={newPassword} autoComplete="new-password" required disabled={busy}
          onChange={(event) => setNewPassword(event.target.value)} className={inputClass(Boolean(error))} />
      </div>
      <div>
        <label htmlFor="new-password-confirm" className="block text-sm text-ink">새 비밀번호 확인</label>
        <input id="new-password-confirm" type="password" value={confirmation} autoComplete="new-password" required disabled={busy}
          onChange={(event) => setConfirmation(event.target.value)} className={inputClass(Boolean(error))} />
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <MonoButton type="submit" disabled={busy} fullWidth>{busy ? '변경 중…' : '비밀번호 변경'}</MonoButton>
    </form>
  );
}
