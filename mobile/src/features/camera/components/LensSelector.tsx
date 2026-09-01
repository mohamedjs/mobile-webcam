import { StyleSheet, View } from 'react-native';
import { Pill } from '@/shared/ui';
import { space } from '@/shared/theme/tokens';
import { useSettingsStore } from '@/features/settings';

export function LensSelector() {
  const settings = useSettingsStore((s) => s.settings);
  const caps = useSettingsStore((s) => s.capabilities);
  const patch = useSettingsStore((s) => s.patch);
  if (!settings || !caps) return null;

  // lockLens hides the switcher entirely so the stream can never change camera
  // mid-meeting. docs/05 §F4.
  if (settings.lockLens) return null;

  return (
    <View style={styles.row}>
      {caps.lenses.map((l) => (
        <Pill
          key={l.id}
          label={l.label}
          active={settings.lens === l.id}
          onPress={() => void patch({ lens: l.id })}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
});
