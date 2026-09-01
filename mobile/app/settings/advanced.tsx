import { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { Screen, Card, Row, Toggle, Button, Badge } from '@/shared/ui';
import { colors, font, space } from '@/shared/theme/tokens';
import { DEFAULT_DEVICE_PORT, PROTOCOL_VERSION } from '@mobile-webcam/shared';
import { usePairingToken } from '@/features/connection';
import { useStreamStore } from '@/features/streaming';
import { log } from '@/shared/lib/logger';

export default function AdvancedSettings() {
  const { token, regenerate } = usePairingToken();
  const running = useStreamStore((s) => s.running);
  const port = useStreamStore((s) => s.port);
  const stop = useStreamStore((s) => s.stop);
  const [busy, setBusy] = useState(false);

  const onRegenerate = () => {
    Alert.alert(
      'Regenerate pairing code?',
      'The desktop service will need the new code before it can connect again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            void (async () => {
              if (running) await stop();
              const t = await regenerate();
              log.info('pairing code regenerated');
              setBusy(false);
              Alert.alert('New pairing code', t);
            })();
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <Card title="Server">
        <Row label="Device port"><Text style={styles.mono}>{port || DEFAULT_DEVICE_PORT}</Text></Row>
        <Row label="Protocol version"><Text style={styles.mono}>{PROTOCOL_VERSION}</Text></Row>
        <Row label="Status" last>
          <Badge label={running ? 'running' : 'stopped'} tone={running ? 'ok' : 'bad'} />
        </Row>
      </Card>

      <Card title="Pairing">
        <Row label="Pairing code" last>
          <Text style={styles.code}>{token ?? '——————'}</Text>
        </Row>
        <Text style={styles.note}>
          Enter this on the desktop service. Over a cable this is a convenience, not a
          secret — but it stops another process on your computer reading the camera.
        </Text>
        <Button title="Regenerate" variant="ghost" loading={busy} onPress={onRegenerate} />
      </Card>

      <Card title="Diagnostics">
        <Row label="Force MJPEG fallback" hint="video only, higher bitrate" last>
          <Toggle value={false} onChange={() => Alert.alert(
            'MJPEG fallback',
            'Set forceMjpeg in the desktop service config. The phone serves both profiles; the desktop chooses.',
          )} />
        </Row>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mono: { ...font.mono, color: colors.text, fontSize: 14 },
  code: { ...font.mono, color: colors.accent, fontSize: 22, letterSpacing: 3 },
  note: { ...font.body, fontSize: 13, color: colors.muted, marginVertical: space.md, lineHeight: 19 },
});
