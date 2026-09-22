import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import MonoButton from '../common/MonoButton';
import { profileApi } from '../../api/profile';
import { formatIidxId, iidxIdError, nicknameError, normalizeNickname } from '../../utils/profile';
import { profileError } from '../../utils/profileError';

const inputClass = (hasError) => [
  'mt-1 w-full border bg-night px-3 py-3 text-ink focus:outline-none',
  hasError ? 'border-danger focus:border-danger' : 'border-line-strong focus:border-accent',
].join(' ');

export default function ProfileDetailsForm({ user, onUserChange }) {
  const [nickname, setNickname] = useState(user?.nickname || user?.username || '');
  const [iidxId, setIidxId] = useState(formatIidxId(user?.iidxId));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNickname(user?.nickname || user?.username || '');
    setIidxId(formatIidxId(user?.iidxId));
  }, [user?.nickname, user?.iidxId, user?.username]);

  const submit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    const nicknameMessage = nicknameError(nickname);
    const iidxMessage = iidxIdError(iidxId);
    if (nicknameMessage) nextErrors.nickname = nicknameMessage;
    if (iidxMessage) nextErrors.iidxId = iidxMessage;
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setBusy(true);
    setErrors({});
    try {
      const updated = await profileApi.updateProfile({ nickname, iidxId });
      onUserChange(updated);
      setNickname(updated.nickname || normalizeNickname(nickname));
      setIidxId(formatIidxId(updated.iidxId));
      toast.success('프로필 정보를 저장했습니다.');
    } catch (requestError) {
      const failure = profileError(requestError);
      if (failure.code === 'NICKNAME_TAKEN' || failure.code === 'INVALID_NICKNAME') {
        setErrors({ nickname: failure.message });
      } else if (failure.code === 'IIDX_ID_TAKEN' || failure.code === 'INVALID_IIDX_ID') {
        setErrors({ iidxId: failure.message });
      } else {
        setErrors({ form: failure.message });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-6 border border-line-strong bg-panel p-5 sm:p-7" aria-labelledby="profile-details-title">
      <h2 id="profile-details-title" className="text-lg text-ink">프로필 정보</h2>
      <p className="mt-2 text-sm leading-6 text-muted">닉네임은 댓글과 화면에 표시됩니다. 로그인 아이디는 변경되지 않습니다.</p>
      <form className="mt-5 space-y-5" onSubmit={submit} noValidate>
        <div>
          <label htmlFor="profile-nickname" className="block text-sm text-ink">닉네임</label>
          <input id="profile-nickname" value={nickname} maxLength={50} disabled={busy} autoComplete="nickname"
            onChange={(event) => setNickname(event.target.value)} className={inputClass(Boolean(errors.nickname))} />
          {errors.nickname && <p role="alert" className="mt-2 text-sm text-danger">{errors.nickname}</p>}
        </div>
        <div>
          <label htmlFor="profile-iidx-id" className="block text-sm text-ink">IIDX-ID <span className="text-muted">(선택)</span></label>
          <input id="profile-iidx-id" value={iidxId} inputMode="numeric" placeholder="1234-5678" maxLength={9} disabled={busy}
            onChange={(event) => setIidxId(formatIidxId(event.target.value))} className={inputClass(Boolean(errors.iidxId))} />
          <p className="mt-2 text-xs leading-5 text-muted">크롤링 기능이 준비되면 이 ID를 동기화 대상으로 사용합니다. 다른 사용자에게 공개되지 않습니다.</p>
          {errors.iidxId && <p role="alert" className="mt-2 text-sm text-danger">{errors.iidxId}</p>}
        </div>
        {errors.form && <p role="alert" className="text-sm text-danger">{errors.form}</p>}
        <MonoButton type="submit" disabled={busy} fullWidth>{busy ? '저장 중…' : '프로필 저장'}</MonoButton>
      </form>
    </section>
  );
}
