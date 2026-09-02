import { StyleSheet, Text, View } from 'react-native';
import { Row, Toggle, Pill, SheetSection } from '@/shared/ui';
import { colors, space } from '@/shared/theme/tokens';
import { useSettingsStore } from '../store/settingsStore';
import { ResolutionPicker } from './ResolutionPicker';
import { FpsPicker } from './FpsPicker';
import { BitratePicker } from './BitratePicker';
import { RestartWarning } from './RestartWarning';
import { ExposureControls, TorchButton, ZoomSlider } from '@/features/camera';
import { CinematicPanel } from '@/features/cinematic';
import { AudioPanel } from '@/features/audio';

const ROTATIONS = [0, 90, 180, 270] as const;

/**
 * Every setting, in one scroll. Previously these were four separate routes;
 * pushing a screen hid the preview, and you change these *while* watching the
 * picture.
 */
export function SettingsSheetContent() {
  const settings = useSettingsStore((s) => s.settings);
  const caps = useSettingsStore((s) => s.capabilities);
  const patch = useSettingsStore((s) => s.patch);

  if (!settings || !caps) {
    return <Text style={styles.empty}>Connecting to the camera…</Text>;
  }

  return (
    <>
      <SheetSection title="Format">
        <Row label="Resolution" hint="restarts the stream"><ResolutionPicker /></Row>
        <Row label="Frame rate" hint="restarts the stream"><FpsPicker /></Row>
        <Row label="Bitrate" hint="applies live" last><BitratePicker /></Row>
        <RestartWarning />
      </SheetSection>

      <SheetSection title="Camera">
        <Row label="Zoom"><ZoomSlider /></Row>
        <Row label="Mirror">
          <Toggle value={settings.mirror} onChange={(mirror) => void patch({ mirror })} />
        </Row>
        <Row label="Rotation" hint="restarts the stream">
          <View style={styles.pills}>
            {ROTATIONS.map((r) => (
              <Pill
                key={r}
                label={`${r}°`}
                active={settings.rotation === r}
                onPress={() => void patch({ rotation: r })}
              />
            ))}
          </View>
        </Row>
        <Row label="Stabilisation">
          <View style={styles.pills}>
            {caps.stabilization.map((s) => (
              <Pill
                key={s}
                label={s}
                active={settings.stabilization === s}
                onPress={() => void patch({ stabilization: s })}
              />
            ))}
          </View>
        </Row>
        <Row label="HDR">
          <Toggle
            value={settings.hdr}
            disabled={!caps.hdr}
            onChange={(hdr) => void patch({ hdr })}
          />
        </Row>
        <Row label="Torch" last><TorchButton /></Row>
      </SheetSection>

      <SheetSection title="Background blur">
        <Row label="Enabled">
          <Toggle
            value={settings.blurFallback.enabled}
            onChange={(enabled) => void patch({ blurFallback: { enabled } })}
          />
        </Row>
        <Row
          label="Intensity"
          hint={
            settings.blurFallback.enabled
              ? 'segmentation runs per frame — lower the resolution if the frame rate drops'
              : undefined
          }
          last
        >
          <View style={styles.pills}>
            {[0.3, 0.6, 1].map((v) => (
              <Pill
                key={v}
                label={`${Math.round(v * 100)}%`}
                active={Math.abs(settings.blurFallback.intensity - v) < 0.02}
                onPress={() => void patch({ blurFallback: { intensity: v } })}
              />
            ))}
          </View>
        </Row>
      </SheetSection>

      <SheetSection title="Cinematic"><CinematicPanel /></SheetSection>
      <SheetSection title="Focus & exposure"><ExposureControls /></SheetSection>
      <SheetSection title="Audio"><AudioPanel /></SheetSection>

      <SheetSection title="Lens">
        <Row label="Lock lens" hint="hides the camera switcher entirely" last>
          <Toggle value={settings.lockLens} onChange={(lockLens) => void patch({ lockLens })} />
        </Row>
      </SheetSection>
    </>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  empty: { color: colors.muted, padding: space.lg, textAlign: 'center' },
});
