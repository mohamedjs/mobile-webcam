import { useCallback, useEffect, useRef } from 'react';

/**
 * A slider dragged across its range must not fire fifty native calls.
 * 120 ms is the project default. docs/03 §4.
 */
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs = 120,
): (...args: A) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(fn);
  latest.current = fn;

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return useCallback((...args: A) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(...args), delayMs);
  }, [delayMs]);
}
