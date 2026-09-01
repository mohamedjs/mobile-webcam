import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '@/shared/theme/tokens';

/** Shown on rows whose change reconfigures AVCaptureSession. docs/01 §5.5. */
export function RestartWarning() {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>
        Changing these briefly interrupts the stream. Your computer keeps the camera
        device open, so meeting apps will not lose it.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: 'rgba(245,165,36,0.10)',
    borderRadius: radius.sm, padding: space.md, marginTop: space.sm,
  },
  text: { ...font.body, fontSize: 13, color: colors.warn, lineHeight: 18 },
});
