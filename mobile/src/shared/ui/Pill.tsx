import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, font, radius, space } from '../theme/tokens';

export function Pill({
  label, active = false, onPress, disabled = false,
}: { label: string; active?: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.pill, active && styles.active, disabled && styles.disabled]}
    >
      <Text style={[styles.text, active && styles.activeText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingVertical: space.sm, paddingHorizontal: space.lg,
    borderRadius: radius.pill, backgroundColor: colors.panelAlt,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
  },
  active: { backgroundColor: colors.accent, borderColor: colors.accent },
  disabled: { opacity: 0.4 },
  text: { ...font.label, color: colors.muted },
  activeText: { color: '#fff' },
});
