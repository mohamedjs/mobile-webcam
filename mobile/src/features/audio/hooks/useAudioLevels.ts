import { useEffect, useState } from 'react';
import { WebcamServer } from '@/native/WebcamServer';

/** Polls the native telemetry for a level meter. 10 Hz is plenty for a VU bar. */
export function useAudioLevels(active: boolean) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!active) { setLevel(0); return; }
    const id = setInterval(() => {
      WebcamServer.getTelemetry()
        .then((t) => setLevel(Math.max(0, Math.min(1, (t as { audioLevel?: number }).audioLevel ?? 0))))
        .catch(() => setLevel(0));
    }, 100);
    return () => clearInterval(id);
  }, [active]);

  return level;
}
