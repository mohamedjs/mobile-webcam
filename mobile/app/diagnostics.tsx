import { Screen } from '@/shared/ui';
import { TelemetryPanel, LogViewer } from '@/features/diagnostics';

export default function Diagnostics() {
  return (
    <Screen>
      <TelemetryPanel />
      <LogViewer />
    </Screen>
  );
}
