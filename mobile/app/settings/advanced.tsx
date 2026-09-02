import { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { Screen, Card, Row, Toggle, Button, Badge } from '@/shared/ui';
import { colors, font, space } from '@/shared/theme/tokens';
import { DEFAULT_DEVICE_PORT, PROTOCOL_VERSION } from '@mobile-webcam/shared';
import { usePairingToken } from '@/features/connection';
import { useStreamStore } from '@/features/streaming';
import { log } from '@/shared/lib/logger';

export default function AdvancedSettings() {
  const { token, enabled, enable, disable } = usePairingToken();
  const running = useStreamStore((s) => s.running);
  const port = useStreamStore((s) => s.port);
  const stop = useStreamStore((s) => s.stop);
  const [busy, setBusy] = useState(false);

  const onToggleAuth = () => {
    if (enabled) {
      Alert.alert(
        'Turn off the pairing code?',
        'Any program on the connected computer will be able to read the camera '
          + 'while the server is running.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Turn off',
            style: 'destructive',
            onPress: () => {
              setBusy(true);
              void (async () => {
                if (running) await stop();
                await disable();
                log.info('pairing code disabled');
                setBusy(false);
              })();
            },
          },
        ],
      );
      return;
    }

    setBusy(true);
    void (async () => {
      if (running) await stop();
      const t = await enable();
      log.info('pairing code enabled');
      setBusy(false);
      Alert.alert('Pairing code enabled', `Enter ${t} on the desktop service.`);
    })();
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
        <Row label="Require a pairing code" last>
          <Badge label={enabled ? 'on' : 'off'} tone={enabled ? 'ok' : 'neutral'} />
        </Row>
        <Text style={styles.note}>
          {enabled
            ? 'The desktop service must send this code. Enter it there once.'
            : 'Off. The desktop connects with no code — nothing to type. Over a '
              + 'cable the server is only reachable from the computer holding it, '
              + 'so this only matters if you do not trust other programs on that machine.'}
        </Text>
        {enabled ? <Text style={styles.code}>{token}</Text> : null}
        <Button
          title={enabled ? 'Turn off pairing code' : 'Require a pairing code'}
          variant="ghost"
          loading={busy}
          onPress={onToggleAuth}
        />
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
