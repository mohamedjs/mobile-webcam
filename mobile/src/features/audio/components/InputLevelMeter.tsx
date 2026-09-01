import { StyleSheet, View } from 'react-native';
import { colors, radius } from '@/shared/theme/tokens';
import { useAudioLevels } from '../hooks/useAudioLevels';

const SEGMENTS = 20;

export function InputLevelMeter({ active }: { active: boolean }) {
  const level = useAudioLevels(active);
  const lit = Math.round(level * SEGMENTS);

  return (
    <View style={styles.meter}>
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <View
          key={i}
          style={[
            styles.seg,
            i < lit && { backgroundColor: i > SEGMENTS * 0.85 ? colors.bad : i > SEGMENTS * 0.65 ? colors.warn : colors.ok },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  meter: { flexDirection: 'row', gap: 2, alignItems: 'center', flex: 1, maxWidth: 170 },
  seg: { flex: 1, height: 14, borderRadius: radius.sm / 2, backgroundColor: colors.line },
});
