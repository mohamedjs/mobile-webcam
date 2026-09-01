import { StyleSheet, View } from 'react-native';
import { Button } from '@/shared/ui';
import { space } from '@/shared/theme/tokens';
import { useStreamStore } from '../store/streamStore';
import { usePairingToken, usePermissions } from '@/features/connection';

export function StreamToggle() {
  const running = useStreamStore((s) => s.running);
  const busy = useStreamStore((s) => s.busy);
  const start = useStreamStore((s) => s.start);
  const stop = useStreamStore((s) => s.stop);
  const { token } = usePairingToken();
  const { allGranted } = usePermissions();

  return (
    <View style={styles.wrap}>
      <Button
        title={running ? 'Stop server' : 'Start server'}
        variant={running ? 'danger' : 'primary'}
        loading={busy}
        disabled={!allGranted || !token}
        onPress={() => (running ? void stop() : void start(token ?? ''))}
      />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { marginTop: space.md } });
