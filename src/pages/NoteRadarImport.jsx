import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { createImportSession } from '../features/noteRadar/import/importSession.js';
import { importsApi } from '../features/noteRadar/import/importsApi.js';
import { ImportReview } from '../features/noteRadar/import/ImportReview.jsx';
import { useImportBinding } from '../features/noteRadar/import/useImportBinding.js';
import { useAuthStore } from '../store/authStore';

const IDLE = { phase: 'checking' };
const idleStore = { getSnapshot: () => IDLE, subscribe: () => () => {} };

function Shell({ title, children }) {
  return <main className="mx-auto min-h-screen max-w-lg bg-night px-5 py-8 text-sm text-text2">
    {import.meta.env.VITE_NOTE_RADAR_MOCK === '1' && <p role="status" className="mb-4 border border-amber-300/50 p-3 text-xs text-amber-100">모의 데이터 · 실제 공식 기록과 연결되지 않은 개발 화면입니다.</p>}
    <p className="font-mono text-xs uppercase tracking-widest text-label">SP NOTE RADAR</p>
    <h1 className="mt-2 text-xl text-ink">{title}</h1>
    <div className="mt-5 space-y-4 leading-6">{children}</div>
  </main>;
}

export default function NoteRadarImport() {
  const user = useAuthStore((state) => state.user);
  const userId = user?.id;
  const loading = useAuthStore((state) => state.isLoading);
  const [entry, setEntry] = useState(null);
  const session = entry && entry.owner === userId ? entry.session : null;
  const binding = useImportBinding(loading ? null : userId);
  const view = useSyncExternalStore((session ?? idleStore).subscribe, (session ?? idleStore).getSnapshot);

  useEffect(() => {
    if (loading || userId == null) return undefined;
    const next = createImportSession({ api: importsApi, win: window });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- this effect owns an external store.
    setEntry({ owner: userId, session: next });
    void next.start();
    return () => { next.dispose(); };
  }, [loading, userId]);

  if (loading) return <Shell title="로그인 확인 중"><p role="status">잠시 기다려 주세요…</p></Shell>;
  if (!user) return <Shell title="사이트 로그인이 필요합니다"><p>원래 사이트에서 로그인하고 새 가져오기를 시작해 주세요. 이 창에서 로그인해도 이전 로그인에서 시작한 시도는 이어지지 않습니다.</p><a href="/login" target="_blank" rel="noreferrer" className="text-accent underline">사이트 로그인 열기</a></Shell>;
  if (view.phase === 'done') return <Shell title="공식 레이더를 가져왔습니다"><p>여섯 카테고리를 함께 저장했습니다. 현재 기록과 추천곡을 확인해 주세요.</p><Link to="/note-radar" className="text-accent underline">내 노트레이더 보기</Link></Shell>;
  if (view.phase === 'no-opener') return <Shell title="공식 페이지와 연결되지 않았습니다"><p>공식 노트레이더 페이지에서 북마클릿을 실행해 이 창을 열어 주세요. 브라우저가 두 창의 연결을 끊었다면 원래 화면에서 다시 시작해 주세요.</p></Shell>;
  if (view.phase === 'not-pending') return <Shell title="진행 중인 가져오기가 없습니다"><p>이 로그인에서 시작한 시도를 찾지 못했거나 만료됐습니다. 원래 사이트의 노트레이더 화면에서 다시 시작해 주세요.</p></Shell>;
  if (view.phase === 'failed') return <Shell title="가져오기를 마치지 못했습니다"><p role="alert" className="text-danger">{view.error}</p><Link to="/note-radar" className="text-accent underline">내 노트레이더로 돌아가기</Link></Shell>;
  if (view.phase === 'reviewing') return <Shell title="가져올 기록을 확인해 주세요"><ImportReview key={userId} payload={view.payload} user={user} binding={binding} onConfirm={() => void session.confirm()} /></Shell>;
  return <Shell title={view.phase === 'completing' ? '공식 기록 저장 중' : '공식 기록 확인 중'}><p role="status">{view.phase === 'completing' ? '저장 결과를 확인하고 있습니다…' : '공식 페이지에서 SP 레이더 목록을 기다리고 있습니다…'}</p><p className="text-muted">가져올 사이트 계정: {user.username}</p></Shell>;
}
