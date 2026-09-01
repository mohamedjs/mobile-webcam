import { create } from 'zustand';
import type { Capabilities, Settings, SettingsPatch } from '@mobile-webcam/shared';
import { WebcamServer } from '@/native/WebcamServer';
import { log } from '@/shared/lib/logger';

interface SettingsState {
  settings: Settings | null;
  capabilities: Capabilities | null;
  pending: SettingsPatch;
  error: string | null;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  patch: (p: SettingsPatch) => Promise<void>;
  clearError: () => void;
}

/**
 * The authority for camera configuration.
 *
 * `patch` writes optimistically to `pending` for responsiveness, then replaces
 * `settings` with whatever the NATIVE side returns — never the optimistic value.
 * The phone decides what was actually applied; a requested 4K60 may come back as
 * 4K30. docs/03 §4.
 */
export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  capabilities: null,
  pending: {},
  error: null,
  hydrated: false,

  hydrate: async () => {
    try {
      const [capabilities, settings] = await Promise.all([
        WebcamServer.getCapabilities(),
        WebcamServer.getSettings(),
      ]);
      set({ capabilities, settings, hydrated: true, error: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log.error('settings hydrate failed', message);
      set({ error: message, hydrated: true });
    }
  },

  patch: async (p) => {
    set({ pending: { ...get().pending, ...p }, error: null });
    try {
      const settings = await WebcamServer.updateSettings(p);
      // Cinematic changes what the device will accept — re-read capabilities.
      const capabilities = p.cinematic?.enabled !== undefined
        ? await WebcamServer.getCapabilities()
        : get().capabilities;
      set({ settings, capabilities, pending: {} });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log.warn('setting rejected', message);
      // Never leave the UI showing a value the camera did not accept.
      set({ pending: {}, error: message });
      await get().hydrate();
    }
  },

  clearError: () => set({ error: null }),
}));
