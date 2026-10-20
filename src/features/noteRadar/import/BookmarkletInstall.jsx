import { useEffect, useRef, useState } from 'react';
import { radarBookmarkletHref } from './bookmarklet.js';
import MonoButton from '../../../components/common/MonoButton';

export function BookmarkletInstall() {
  const link = useRef(null);
  const [message, setMessage] = useState('');
  const href = radarBookmarkletHref(window.location.origin);
  useEffect(() => {
    // React blocks javascript URLs in props; this attribute contains only our fixed bookmarklet source.
    if (href && link.current) link.current.setAttribute('href', href);
  }, [href]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href);
      setMessage('주소를 복사했습니다.');
    } catch {
      setMessage('입력칸의 주소를 직접 복사해 주세요.');
    }
  };
  if (!href) return <p role="alert">HTTPS 또는 localhost 주소에서 북마클릿을 만들어 주세요.</p>;
  return <div className="space-y-2">
    <a ref={link} draggable="true" onClick={(event) => event.preventDefault()} className="inline-block rounded border border-accent px-3 py-2 text-accent">SP 레이더 가져오기 북마클릿</a>
    <p className="text-xs text-muted">링크를 북마크바로 끌어다 놓거나 주소를 복사해 북마크의 URL로 저장해 주세요.</p>
    <textarea aria-label="SP 레이더 북마클릿 주소" readOnly rows={3} value={href}
      onFocus={(event) => event.target.select()} className="w-full rounded border border-line bg-night p-2 font-mono text-[10px] text-muted" />
    <MonoButton variant="ghost" onClick={copy}>북마클릿 주소 복사</MonoButton>
    {message && <p role="status" className="text-xs text-muted">{message}</p>}
  </div>;
}
