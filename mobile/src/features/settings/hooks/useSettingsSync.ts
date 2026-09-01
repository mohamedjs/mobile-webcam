import { useEffect } from 'react';
import { useSettingsStore } from '../store/settingsStore';

/** Hydrates once on mount. Mount at the root layout, not per screen. */
export function useSettingsSync(): void {
  const hydrate = useSettingsStore((s) => s.hydrate);
  const hydrated = useSettingsStore((s) => s.hydrated);
  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrate, hydrated]);
}
