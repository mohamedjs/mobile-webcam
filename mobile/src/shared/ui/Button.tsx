import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, font, radius, space } from '../theme/tokens';

export function Button({
  title, onPress, variant = 'primary', disabled = false, loading = false,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
}) {
  const bg =
    variant === 'primary' ? colors.accent : variant === 'danger' ? colors.bad : 'transparent';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled || loading ? 0.45 : pressed ? 0.8 : 1 },
        variant === 'ghost' && styles.ghost,
      ]}
    >
      {loading
        ? <ActivityIndicator color={colors.text} />
        : <Text style={styles.text}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: space.md, paddingHorizontal: space.xl,
    borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', minHeight: 46,
  },
  ghost: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  text: { ...font.label, color: colors.text, fontSize: 15 },
});
