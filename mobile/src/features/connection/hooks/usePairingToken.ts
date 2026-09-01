import { useCallback, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { log } from '@/shared/lib/logger';

const KEY = 'mobile_webcam.token';

function generate(): string {
  // 6 digits: short enough to type on the desktop, and the transport is a
  // physical cable, so this is a pairing convenience not a secret over the air.
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function usePairingToken() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        let t = await SecureStore.getItemAsync(KEY);
        if (!t) {
          t = generate();
          await SecureStore.setItemAsync(KEY, t);
        }
        setToken(t);
      } catch (e) {
        log.error('token load failed', e instanceof Error ? e.message : String(e));
        setToken(generate());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const regenerate = useCallback(async () => {
    const t = generate();
    await SecureStore.setItemAsync(KEY, t);
    setToken(t);
    return t;
  }, []);

  return { token, loading, regenerate };
}
