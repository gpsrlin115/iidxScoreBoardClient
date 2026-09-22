import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import MonoButton from '../common/MonoButton';
import { profileApi } from '../../api/profile';
import { profileError } from '../../utils/profileError';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function initialFor(user) {
  return Array.from(user?.nickname || user?.username || '?')[0]?.toUpperCase() || '?';
}

export default function ProfileAvatar({ user, onUserChange }) {
  const pickerRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return undefined;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const resetFile = () => {
    setFile(null);
    if (pickerRef.current) pickerRef.current.value = '';
  };

  const clearSelection = () => {
    resetFile();
    setError('');
  };

  const chooseFile = (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;

    if (!IMAGE_TYPES.has(selected.type)) {
      setError('JPEG, PNG, GIF, WebP 이미지 파일만 선택할 수 있습니다.');
      resetFile();
      return;
    }
    if (selected.size > MAX_AVATAR_BYTES) {
      setError('프로필 사진은 5MB 이하만 올릴 수 있습니다.');
      resetFile();
      return;
    }
    setError('');
    setFile(selected);
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const data = await profileApi.uploadAvatar(file);
      onUserChange({ ...user, avatarUrl: data.avatarUrl });
      clearSelection();
      toast.success('프로필 사진을 변경했습니다.');
    } catch (requestError) {
      setError(profileError(requestError).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await profileApi.deleteAvatar();
      onUserChange({ ...user, avatarUrl: null });
      clearSelection();
      toast.success('프로필 사진을 삭제했습니다.');
    } catch (requestError) {
      setError(profileError(requestError).message);
    } finally {
      setBusy(false);
    }
  };

  const imageUrl = previewUrl || user?.avatarUrl;

  return (
    <section className="mb-6 border border-line-strong bg-panel p-5 sm:p-7" aria-labelledby="profile-avatar-title">
      <h2 id="profile-avatar-title" className="text-lg text-ink">프로필 사진</h2>
      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-night text-2xl text-accent">
          {imageUrl ? <img src={imageUrl} alt="현재 프로필 사진" className="h-full w-full object-cover" /> : initialFor(user)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-6 text-muted">JPEG, PNG, GIF, WebP 형식의 5MB 이하 이미지를 올릴 수 있습니다.</p>
          {file && <p className="mt-2 truncate text-xs text-accent">선택됨: {file.name}</p>}
          {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
          <input ref={pickerRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="sr-only" onChange={chooseFile} />
          <div className="mt-4 flex flex-wrap gap-2">
            <MonoButton type="button" variant="ghost" disabled={busy} onClick={() => pickerRef.current?.click()}>
              사진 선택
            </MonoButton>
            {file && <MonoButton type="button" disabled={busy} onClick={upload}>{busy ? '업로드 중…' : '사진 저장'}</MonoButton>}
            {file && <MonoButton type="button" variant="ghost" disabled={busy} onClick={clearSelection}>선택 취소</MonoButton>}
            {!file && user?.avatarUrl && <MonoButton type="button" variant="ghost" disabled={busy} onClick={remove}>{busy ? '삭제 중…' : '사진 삭제'}</MonoButton>}
          </div>
        </div>
      </div>
    </section>
  );
}
