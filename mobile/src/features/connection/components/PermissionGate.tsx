import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, Row, Badge } from '@/shared/ui';
import { colors, font, space } from '@/shared/theme/tokens';
import { usePermissions } from '../hooks/usePermissions';

/**
 * Blocks streaming until permissions are granted, and names WHICH one is
 * missing. The Local Network case is the highest-value diagnostic in the app:
 * denied, the server fails to bind while the app still looks healthy, and the
 * desktop just sees "connection reset". docs/03 §6.
 */
export function PermissionGate() {
  const { camera, microphone, allGranted, openSettings } = usePermissions();
  if (allGranted) return null;

  return (
    <Card title="Permissions required">
      <Row label="Camera">
        <Badge label={camera ? 'granted' : 'missing'} tone={camera ? 'ok' : 'bad'} />
      </Row>
      <Row label="Microphone" last>
        <Badge label={microphone ? 'granted' : 'missing'} tone={microphone ? 'ok' : 'bad'} />
      </Row>
      <Text style={styles.note}>
        If the server refuses to start, iOS has blocked the local network. Open
        Settings → Privacy &amp; Security → Local Network and enable mobile_webcam.
      </Text>
      <View style={styles.actions}>
        <Button title="Open Settings" variant="ghost" onPress={openSettings} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  note: { ...font.body, fontSize: 13, color: colors.muted, marginTop: space.md, lineHeight: 19 },
  actions: { marginTop: space.md },
});
