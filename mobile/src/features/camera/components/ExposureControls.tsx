import { View, StyleSheet } from 'react-native';
import { Button, Row, Slider, Toggle } from '@/shared/ui';
import { useDebouncedCallback } from '@/shared/hooks/useDebouncedCallback';
import { space } from '@/shared/theme/tokens';
import { useSettingsStore } from '@/features/settings';

export function ExposureControls() {
  const settings = useSettingsStore((s) => s.settings);
  const patch = useSettingsStore((s) => s.patch);
  const setBias = useDebouncedCallback((bias: number) =>
    void patch({ exposure: { bias } }));
  if (!settings) return null;

  const allLocked =
    settings.focus.locked && settings.exposure.locked && settings.whiteBalance.locked;

  const lockAll = () => void patch({
    focus: { locked: !allLocked },
    exposure: { locked: !allLocked },
    whiteBalance: { locked: !allLocked },
  });

  return (
    <View>
      <Row label="Exposure bias" hint="EV compensation">
        <Slider
          value={settings.exposure.bias}
          min={-2} max={2} step={0.1}
          onChange={setBias}
          format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} EV`}
        />
      </Row>
      <Row label="Lock focus">
        <Toggle
          value={settings.focus.locked}
          onChange={(locked) => void patch({ focus: { locked } })}
        />
      </Row>
      <Row label="Lock exposure">
        <Toggle
          value={settings.exposure.locked}
          onChange={(locked) => void patch({ exposure: { locked } })}
        />
      </Row>
      <Row label="Lock white balance" last>
        <Toggle
          value={settings.whiteBalance.locked}
          onChange={(locked) => void patch({ whiteBalance: { locked } })}
        />
      </Row>
      <View style={styles.actions}>
        {/* The single most useful control in a meeting: autofocus hunting is the
            most visible artefact. docs/05 §F7. */}
        <Button
          title={allLocked ? 'Unlock all' : 'Lock all'}
          variant="ghost"
          onPress={lockAll}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ actions: { marginTop: space.md } });
