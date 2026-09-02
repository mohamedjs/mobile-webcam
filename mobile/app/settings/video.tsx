import { Screen, Card, Row, Toggle, Pill } from '@/shared/ui';
import { StyleSheet, View } from 'react-native';
import { space } from '@/shared/theme/tokens';
import {
  useSettingsStore, ResolutionPicker, FpsPicker, BitratePicker, RestartWarning,
} from '@/features/settings';
import { ExposureControls, TorchButton } from '@/features/camera';
import { CinematicPanel } from '@/features/cinematic';

const ROTATIONS = [0, 90, 180, 270] as const;

export default function VideoSettings() {
  const settings = useSettingsStore((s) => s.settings);
  const caps = useSettingsStore((s) => s.capabilities);
  const patch = useSettingsStore((s) => s.patch);
  if (!settings || !caps) return <Screen><Card title="Video" >{null}</Card></Screen>;

  return (
    <Screen>
      <Card title="Format">
        <Row label="Resolution" hint="restarts the stream"><ResolutionPicker /></Row>
        <Row label="Frame rate" hint="restarts the stream"><FpsPicker /></Row>
        <Row label="Bitrate" hint="applies live" last><BitratePicker /></Row>
        <RestartWarning />
      </Card>

      <CinematicPanel />

      <Card title="Image">
        <Row label="Mirror" hint="applies live">
          <Toggle value={settings.mirror} onChange={(mirror) => void patch({ mirror })} />
        </Row>
        <Row label="Rotation" hint="restarts the stream">
          <View style={styles.row}>
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
          <View style={styles.row}>
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
      </Card>

      <Card title="Focus & exposure">
        <ExposureControls />
      </Card>

      <Card title="Lens">
        <Row label="Lock lens" hint="hides the camera switcher entirely" last>
          <Toggle value={settings.lockLens} onChange={(lockLens) => void patch({ lockLens })} />
        </Row>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' } });
