import { useCallback, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { log } from '@/shared/lib/logger';

const KEY = 'mobile_webcam.token';

function generate(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Pairing code — OFF by default.
 *
 * An empty token disables authentication entirely: the Swift `Auth` gate
 * no-ops when the token is empty, and the desktop sends no Authorization
 * header. Nothing has to be typed anywhere.
 *
 * This is a deliberate trade. Over USB the listener is only reachable from
 * processes on the machine holding the cable, so the code was never defending
 * against the network — it only stopped another local process on that computer
 * from reading the camera. Call `enable()` to turn it back on.
 */
export function usePairingToken() {
  const [token, setToken] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const stored = await SecureStore.getItemAsync(KEY);
        setToken(stored ?? '');
      } catch (e) {
        log.error('token load failed', e instanceof Error ? e.message : String(e));
        setToken('');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** Turn authentication on and return the new code to type on the desktop. */
  const enable = useCallback(async () => {
    const t = generate();
    await SecureStore.setItemAsync(KEY, t);
    setToken(t);
    return t;
  }, []);

  /** Turn authentication off again. */
  const disable = useCallback(async () => {
    await SecureStore.deleteItemAsync(KEY);
    setToken('');
  }, []);

  return { token, loading, enabled: token !== '', enable, disable, regenerate: enable };
}
