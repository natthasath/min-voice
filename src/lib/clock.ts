import { useEffect, useState } from 'react';

/** Server time minus client time, refreshed with every state push. */
let offset = 0;

export function syncClock(serverNow: number) {
  offset = serverNow - Date.now();
}

function now() {
  return Date.now() + offset;
}

/** Milliseconds left until `endsAt` (server clock), re-rendering a few times a second. */
export function useRemaining(endsAt: number | null | undefined): number {
  const calc = () => (endsAt ? Math.max(0, endsAt - now()) : 0);
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    setLeft(calc());
    if (!endsAt) return;
    const id = setInterval(() => setLeft(calc()), 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);
  return left;
}
