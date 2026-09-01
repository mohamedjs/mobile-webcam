import { create } from 'zustand';
import { DEFAULT_DEVICE_PORT } from '@mobile-webcam/shared';
import { WebcamServer } from '@/native/WebcamServer';
import { log } from '@/shared/lib/logger';

export interface StreamClient { clientId: string; profile: 'fmp4' | 'mjpeg' }

interface StreamState {
  running: boolean;
  port: number;
  clients: StreamClient[];
  error: string | null;
  busy: boolean;

  start: (token: string) => Promise<void>;
  stop: () => Promise<void>;
  addClient: (c: StreamClient) => void;
  removeClient: (clientId: string) => void;
  setError: (e: string | null) => void;
}

export const useStreamStore = create<StreamState>((set, get) => ({
  running: false,
  port: DEFAULT_DEVICE_PORT,
  clients: [],
  error: null,
  busy: false,

  start: async (token) => {
    if (get().busy) return;
    set({ busy: true, error: null });
    try {
      const res = await WebcamServer.startServer(get().port, token);
      set({ running: true, port: res.port, busy: false });
      log.info('server started', { port: res.port });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // The highest-value diagnostic in the app: a bind failure is almost always
      // the Local Network permission. docs/03 §6.
      const friendly = /bind|permission|denied|address/i.test(message)
        ? 'iOS blocked the local network. Settings → Privacy & Security → Local Network → mobile_webcam.'
        : message;
      log.error('server start failed', message);
      set({ running: false, busy: false, error: friendly });
    }
  },

  stop: async () => {
    set({ busy: true });
    try {
      await WebcamServer.stopServer();
    } catch (e) {
      log.warn('server stop failed', e instanceof Error ? e.message : String(e));
    }
    set({ running: false, clients: [], busy: false });
  },

  addClient: (c) => set({ clients: [...get().clients.filter((x) => x.clientId !== c.clientId), c] }),
  removeClient: (clientId) => set({ clients: get().clients.filter((c) => c.clientId !== clientId) }),
  setError: (error) => set({ error }),
}));
