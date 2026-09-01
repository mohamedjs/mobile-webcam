import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '../theme/tokens';

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'bad';

const TONE: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.panelAlt, fg: colors.muted },
  ok: { bg: 'rgba(62,207,142,0.15)', fg: colors.ok },
  warn: { bg: 'rgba(245,165,36,0.15)', fg: colors.warn },
  bad: { bg: 'rgba(245,82,94,0.15)', fg: colors.bad },
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const t = TONE[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingVertical: 4, paddingHorizontal: space.md, borderRadius: radius.pill, alignSelf: 'flex-start',
  },
  text: { ...font.label, fontSize: 12 },
});
