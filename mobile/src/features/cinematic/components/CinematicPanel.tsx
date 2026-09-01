import { StyleSheet, Text, View } from 'react-native';
import { Card, Row, Slider, Toggle, Badge } from '@/shared/ui';
import { useDebouncedCallback } from '@/shared/hooks/useDebouncedCallback';
import { colors, font, space } from '@/shared/theme/tokens';
import { useSettingsStore } from '@/features/settings';

const TIER_COPY: Record<number, string> = {
  1: 'Native Cinematic capture. The shallow depth-of-field is rendered by iOS and baked into the frames your computer receives.',
  2: 'Depth-based blur using the dual camera. Costs frame rate; capped at 1080p30.',
  3: 'Person segmentation blur. Works on any device, but edges around hair can artefact.',
};

export function CinematicPanel() {
  const settings = useSettingsStore((s) => s.settings);
  const caps = useSettingsStore((s) => s.capabilities);
  const patch = useSettingsStore((s) => s.patch);
  const setAperture = useDebouncedCallback((aperture: number) =>
    void patch({ cinematic: { aperture } }));

  if (!settings || !caps) return null;

  if (!caps.cinematic.supported) {
    return (
      <Card title="Cinematic">
        <Row label="Availability" last>
          <Badge label="not supported" tone="bad" />
        </Row>
        <Text style={styles.note}>
          Native Cinematic video capture needs iOS 26 or later on supported hardware.
          Use the background blur below instead, or turn on iOS&apos;s own Portrait
          video effect from Control Centre while streaming.
        </Text>
        <Row label="Background blur">
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

  return (
    <Card title="Cinematic">
      <Row label="Cinematic mode" hint={`tier ${caps.cinematic.tier}`}>
        <Toggle
          value={settings.cinematic.enabled}
          onChange={(enabled) => void patch({ cinematic: { enabled } })}
        />
      </Row>
      <Row label="Aperture" hint="lower is more blur" last>
        <Slider
          value={settings.cinematic.aperture}
          min={caps.cinematic.minAperture}
          max={caps.cinematic.maxAperture}
          step={0.1}
          onChange={setAperture}
          format={(v) => `f/${v.toFixed(1)}`}
        />
      </Row>
      <Text style={styles.note}>{TIER_COPY[caps.cinematic.tier] ?? ''}</Text>
      {settings.cinematic.enabled ? (
        <View style={styles.warn}>
          <Text style={styles.warnText}>
            Cinematic limits available resolutions and frame rates. Options above are
            filtered to what it supports.
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  note: { ...font.body, fontSize: 13, color: colors.muted, marginTop: space.md, lineHeight: 19 },
  warn: { backgroundColor: 'rgba(245,165,36,0.10)', borderRadius: 6, padding: space.md, marginTop: space.md },
  warnText: { ...font.body, fontSize: 13, color: colors.warn, lineHeight: 18 },
});
