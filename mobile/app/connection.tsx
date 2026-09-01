import { StyleSheet, Text } from 'react-native';
import { Screen, Card, Row, Badge, Button } from '@/shared/ui';
import { colors, font, space } from '@/shared/theme/tokens';
import { PermissionGate, usePairingToken, usePermissions } from '@/features/connection';
import { useStreamStore } from '@/features/streaming';

export default function Connection() {
  const { token } = usePairingToken();
  const { camera, microphone, openSettings, refresh } = usePermissions();
  const running = useStreamStore((s) => s.running);
  const port = useStreamStore((s) => s.port);
  const clients = useStreamStore((s) => s.clients);

  return (
    <Screen>
      <PermissionGate />

      <Card title="How to connect">
        <Text style={styles.step}>1. Plug the phone into the computer with a cable.</Text>
        <Text style={styles.step}>2. Unlock the phone and keep this app in the foreground.</Text>
        <Text style={styles.step}>3. Start the server below.</Text>
        <Text style={styles.step}>
          4. On the computer run the mobile_webcam service. It finds the phone through
          the cable automatically.
        </Text>
        <Text style={styles.note}>
          The computer connects to the phone, never the other way round — USB only
          allows connections in that direction.
        </Text>
      </Card>

      <Card title="Server">
        <Row label="State">
          <Badge label={running ? 'listening' : 'stopped'} tone={running ? 'ok' : 'bad'} />
        </Row>
        <Row label="Port"><Text style={styles.mono}>{port}</Text></Row>
        <Row label="Connected clients"><Text style={styles.mono}>{clients.length}</Text></Row>
        <Row label="Pairing code" last>
          <Text style={styles.code}>{token ?? '——————'}</Text>
        </Row>
      </Card>

      <Card title="Permissions">
        <Row label="Camera">
          <Badge label={camera ? 'granted' : 'missing'} tone={camera ? 'ok' : 'bad'} />
        </Row>
        <Row label="Microphone" last>
          <Badge label={microphone ? 'granted' : 'missing'} tone={microphone ? 'ok' : 'bad'} />
        </Row>
        <Text style={styles.note}>
          If the server will not start, iOS has blocked the local network. That
          permission is required even over a cable, because the app binds a TCP port.
        </Text>
        <Button title="Open iOS Settings" variant="ghost" onPress={openSettings} />
        <Button title="Re-check" variant="ghost" onPress={() => void refresh()} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { ...font.body, color: colors.text, marginBottom: space.sm, lineHeight: 21 },
  note: { ...font.body, fontSize: 13, color: colors.muted, marginTop: space.sm, lineHeight: 19 },
  mono: { ...font.mono, color: colors.text, fontSize: 14 },
  code: { ...font.mono, color: colors.accent, fontSize: 20, letterSpacing: 3 },
});
