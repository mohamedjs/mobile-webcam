import { View, StyleSheet } from 'react-native';
import { Pill } from '@/shared/ui';
import { space } from '@/shared/theme/tokens';
import { useSettingsStore } from '../store/settingsStore';

const CHOICES = [24, 30, 60];

export function FpsPicker() {
  const settings = useSettingsStore((s) => s.settings);
  const caps = useSettingsStore((s) => s.capabilities);
  const patch = useSettingsStore((s) => s.patch);
  if (!settings || !caps) return null;

  const mode = caps.resolutions.find(
    (r) => r.width === settings.resolution.width && r.height === settings.resolution.height,
  );
  const ceiling = settings.cinematic.enabled
    ? Math.min(mode?.maxFps ?? 60, caps.cinematic.maxFps)
    : mode?.maxFps ?? 60;

  return (
    <View style={styles.row}>
      {CHOICES.filter((f) => f <= ceiling).map((f) => (
        <Pill
          key={f}
          label={`${f}`}
          active={settings.fps === f}
          onPress={() => void patch({ fps: f })}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: space.sm } });
