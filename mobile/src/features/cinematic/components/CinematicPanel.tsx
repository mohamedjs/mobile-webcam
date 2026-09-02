import { StyleSheet, View } from 'react-native';
import { Card, Row, Slider, Toggle } from '@/shared/ui';
import { font, space } from '@/shared/theme/tokens';
import { useSettingsStore } from '@/features/settings';

export function CinematicPanel() {
  const settings = useSettingsStore((s) => s.settings);
  const patch = useSettingsStore((s) => s.patch);

  if (!settings) return null;

  return (
    <Card title="Background Blur">
      <Row label="Enable blur">
        <Toggle
          value={settings.blurFallback.enabled}
          onChange={(enabled) => void patch({ blurFallback: { enabled } })}
        />
      </Row>
      <Row label="Blur strength" last>
        <Slider
          value={settings.blurFallback.intensity}
          min={0} max={1} step={0.05}
          onChange={(intensity) => void patch({ blurFallback: { intensity } })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  note: { ...font.body, fontSize: 13, marginTop: space.md, lineHeight: 19 },
});
