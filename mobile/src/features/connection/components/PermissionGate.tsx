import { Platform, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Row, Badge } from '@/shared/ui';
import { colors, font, space } from '@/shared/theme/tokens';
import { usePermissions } from '../hooks/usePermissions';

export function PermissionGate() {
  const { camera, microphone, allGranted, openSettings } = usePermissions();
  if (allGranted) return null;

  const isAndroid = Platform.OS === 'android';

  return (
    <Card title="Permissions required">
      <Row label="Camera">
        <Badge label={camera ? 'granted' : 'missing'} tone={camera ? 'ok' : 'bad'} />
      </Row>
      <Row label="Microphone" last>
        <Badge label={microphone ? 'granted' : 'missing'} tone={microphone ? 'ok' : 'bad'} />
      </Row>
      <Text style={styles.note}>
        {isAndroid
          ? 'Enable Developer Options → USB Debugging on your Android phone and tap Allow when plugged into your computer.'
          : 'If the server refuses to start, iOS has blocked the local network. Open Settings → Privacy & Security → Local Network and enable webcamo.'}
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
