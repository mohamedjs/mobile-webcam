import { useEffect, useState } from 'react';
import type { Telemetry } from '@mobile-webcam/shared';
import { WebcamServer } from '@/native/WebcamServer';

export function useTelemetry(active: boolean) {
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);

  useEffect(() => {
    if (!active) return;
    const tick = () => { WebcamServer.getTelemetry().then(setTelemetry).catch(() => {}); };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active]);

  return telemetry;
}
