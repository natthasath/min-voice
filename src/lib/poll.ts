import { useCallback, useEffect, useRef } from 'react';

/**
 * Calls `fetcher` every `intervalMs` (and when the tab becomes visible again), never more than one
 * request at a time. Returns `poke`, which fetches right away, e.g. after the user acts.
 */
export function usePoll<T>(
  fetcher: () => Promise<T>,
  onData: (data: T) => void,
  onError: (err: unknown) => void,
  intervalMs: number,
  enabled = true,
) {
  const latest = useRef({ fetcher, onData, onError });
  latest.current = { fetcher, onData, onError };
  const pokeRef = useRef(() => {});

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let busy = false;
    let again = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      clearTimeout(timer);
      try {
        const data = await latest.current.fetcher();
        if (!stopped) latest.current.onData(data);
      } catch (err) {
        if (!stopped) latest.current.onError(err);
      }
      busy = false;
      if (stopped) return;
      if (again) {
        again = false;
        run();
      } else {
        timer = setTimeout(run, intervalMs);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };

    pokeRef.current = run;
    run();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      pokeRef.current = () => {};
    };
  }, [enabled, intervalMs]);

  return useCallback(() => pokeRef.current(), []);
}
