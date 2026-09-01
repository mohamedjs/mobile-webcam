import { View, StyleSheet } from 'react-native';
import { Pill } from '@/shared/ui';
import { space } from '@/shared/theme/tokens';
import { useSettingsStore } from '../store/settingsStore';

export function ResolutionPicker() {
  const settings = useSettingsStore((s) => s.settings);
  const caps = useSettingsStore((s) => s.capabilities);
  const patch = useSettingsStore((s) => s.patch);
  if (!settings || !caps) return null;

  // In Cinematic mode only the cinematic-capable modes are offered.
  const modes = settings.cinematic.enabled
    ? caps.resolutions.filter((r) =>
        caps.cinematic.resolutions.some((c) => c.width === r.width && c.height === r.height))
    : caps.resolutions;

  return (
    <View style={styles.row}>
      {modes.map((r) => (
        <Pill
          key={`${r.width}x${r.height}`}
          label={`${r.height}p`}
          active={settings.resolution.height === r.height && settings.resolution.width === r.width}
          onPress={() => void patch({ resolution: { width: r.width, height: r.height } })}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' } });
