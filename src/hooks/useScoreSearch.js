import { useEffect, useState } from 'react';

export default function useScoreSearch(query, userId) {
  const trimmed = query.trim();
  const [settled, setSettled] = useState({ userId, value: trimmed });
  useEffect(() => {
    const timer = setTimeout(() => setSettled({ userId, value: trimmed }), 300);
    return () => clearTimeout(timer);
  }, [trimmed, userId]);
  // A previous account's pending search must never enter the new account's request.
  return settled.userId === userId ? settled.value : trimmed;
}
