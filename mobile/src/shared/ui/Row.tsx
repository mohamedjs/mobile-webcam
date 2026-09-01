import { StyleSheet, Text, View } from 'react-native';
import { colors, font, space } from '../theme/tokens';

export function Row({
  label, hint, children, last = false,
}: { label: string; hint?: string; children?: React.ReactNode; last?: boolean }) {
  return (
    <View style={[styles.row, last && styles.last]}>
      <View style={styles.labels}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <View style={styles.control}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: space.md, gap: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  last: { borderBottomWidth: 0 },
  labels: { flexShrink: 1, gap: 2 },
  label: { ...font.body, color: colors.text },
  hint: { fontSize: 12, color: colors.muted },
  control: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
