import { Badge } from '@/shared/ui';
import { useStreamStore } from '../store/streamStore';

export function StreamStatusBadge() {
  const running = useStreamStore((s) => s.running);
  const clients = useStreamStore((s) => s.clients);

  if (!running) return <Badge label="Server stopped" tone="bad" />;
  if (clients.length === 0) return <Badge label="Waiting for computer" tone="warn" />;
  return <Badge label={`Streaming · ${clients.length} client`} tone="ok" />;
}
