import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { WebcamServer } from '@/native/WebcamServer';
import { log } from '@/shared/lib/logger';
import { useStreamStore } from '../store/streamStore';
import { usePairingToken } from '@/features/connection';

/**
 * Bridges native events into the store and handles iOS backgrounding.
 *
 * iOS suspends listening sockets for backgrounded apps — this is mitigated, not
 * solved. useKeepAwake stops the screen locking; on resume we restart the server
 * so the user never has to. docs/05 §F12.
 */
export function useServerLifecycle(): void {
  useKeepAwake();
  const { token } = usePairingToken();
  const running = useStreamStore((s) => s.running);
  const start = useStreamStore((s) => s.start);
  const addClient = useStreamStore((s) => s.addClient);
  const removeClient = useStreamStore((s) => s.removeClient);
  const setError = useStreamStore((s) => s.setError);

  useEffect(() => {
    const subs = [
      WebcamServer.addListener('onClientConnected', (p: never) => {
        const c = p as unknown as { clientId: string; profile: 'fmp4' | 'mjpeg' };
        log.info('client connected', c);
        addClient(c);
      }),
      WebcamServer.addListener('onClientDisconnected', (p: never) => {
        const c = p as unknown as { clientId: string; reason: string };
        log.info('client disconnected', c);
        removeClient(c.clientId);
      }),
      WebcamServer.addListener('onError', (p: never) => {
        const e = p as unknown as { code: string; message: string; fatal: boolean };
        log.error(`native error [${e.code}]`, e.message);
        setError(e.message);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [addClient, removeClient, setError]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && running && !WebcamServer.isRunning() && token) {
        log.info('resumed; restarting server');
        void start(token);
      }
    });
    return () => sub.remove();
  }, [running, start, token]);
}
