import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '../theme/tokens';

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.title}>{title.toUpperCase()}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: space.lg,
    gap: space.xs,
  },
  title: {
    ...font.label,
    color: colors.muted,
    letterSpacing: 0.8,
    marginBottom: space.sm,
  },
});
