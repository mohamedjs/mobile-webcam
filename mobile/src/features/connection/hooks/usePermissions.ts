import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { WebcamServer } from '@/native/WebcamServer';

export interface PermissionState {
  camera: boolean;
  microphone: boolean;
  /** iOS never reports this directly; inferred from whether the listener bound. */
  localNetwork: boolean;
}

export function usePermissions() {
  const [state, setState] = useState<PermissionState>({
    camera: false, microphone: false, localNetwork: false,
  });
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const caps = await WebcamServer.getCapabilities();
      setState((s) => ({ ...s, camera: caps.lenses.length > 0, microphone: true }));
    } catch {
      setState({ camera: false, microphone: false, localNetwork: false });
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const openSettings = useCallback(() => { void Linking.openSettings(); }, []);

  return {
    ...state,
    checked,
    allGranted: state.camera && state.microphone,
    refresh,
    openSettings,
  };
}
