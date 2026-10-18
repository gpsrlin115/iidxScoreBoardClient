import { useState } from 'react';
import { Link } from 'react-router-dom';
import MonoButton from '../../../components/common/MonoButton';

export function ImportReview({ payload, user, binding, onConfirm }) {
  const [confirmed, setConfirmed] = useState(false);
  const matching = binding.linked && binding.iidxId === payload.iidxId;
  return <>
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-3 border border-line-strong bg-surface p-4">
      <dt>사이트 계정</dt><dd className="break-all text-ink">{user.username}</dd>
      <dt>연결된 IIDX 코드</dt><dd className="font-mono text-ink">{binding.loading ? '확인 중…' : binding.iidxId ?? '연결 안 됨'}</dd>
      <dt>가져온 IIDX 코드</dt><dd className="font-mono text-ink">{payload.iidxId}</dd>
      <dt>작품 / 플레이</dt><dd className="text-ink">{payload.release} ZINRAI / {payload.playStyle}</dd>
    </dl>
    <ul className="divide-y divide-line border border-line px-4" aria-label="가져온 여섯 카테고리">
      {payload.categories.map((item) => <li key={item.category} className="flex justify-between gap-3 py-3">
        <span>{item.category === 'SOFLAN' ? 'SOF-LAN' : item.category}</span>
        <span className="font-mono text-ink">{item.value.toFixed(2)} <span className="text-xs text-muted">· {item.entries.length}곡</span></span>
      </li>)}
    </ul>
    {binding.error && <div role="alert" className="space-y-2 text-danger"><p>{binding.error}</p><MonoButton variant="ghost" onClick={binding.retry}>연결 코드 다시 확인</MonoButton></div>}
    {!binding.loading && !binding.error && !matching && <p role="alert" className="text-danger">{binding.linked ? '공식 페이지의 IIDX 코드가 이 계정에 연결된 코드와 다릅니다. 본인 계정의 공식 페이지에서 다시 시작해 주세요.' : <>먼저 <Link to="/import/csv" className="underline">IIDX 코드를 연결</Link>한 뒤 새 가져오기를 시작해 주세요.</>}</p>}
    <p className="text-muted">확인한 여섯 카테고리를 함께 저장합니다. 기존 공식 기록은 저장이 완료된 뒤 바뀝니다.</p>
    <label className="flex items-start gap-3 border border-line p-3 text-ink">
      <input type="checkbox" checked={confirmed} disabled={!matching || binding.loading || Boolean(binding.error)} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 size-4 accent-accent" />
      <span>계정·작품·SP와 여섯 수치를 확인했습니다.</span>
    </label>
    <MonoButton fullWidth disabled={!matching || binding.loading || Boolean(binding.error) || !confirmed} onClick={onConfirm}>확인한 공식 기록 저장</MonoButton>
  </>;
}
