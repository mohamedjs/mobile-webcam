import { Card, Row, Toggle, Pill } from '@/shared/ui';
import { StyleSheet, View } from 'react-native';
import { space } from '@/shared/theme/tokens';
import { useSettingsStore } from '@/features/settings';
import { InputLevelMeter } from './InputLevelMeter';

export function AudioPanel() {
  const settings = useSettingsStore((s) => s.settings);
  const caps = useSettingsStore((s) => s.capabilities);
  const patch = useSettingsStore((s) => s.patch);
  if (!settings || !caps) return null;

  return (
    <Card title="Microphone">
      <Row label="Send microphone" hint="appears as a virtual mic on Linux">
        <Toggle
          value={settings.audio.enabled}
          onChange={(enabled) => void patch({ audio: { enabled } })}
        />
      </Row>
      <Row label="Sample rate">
        <View style={styles.row}>
          {caps.audio.sampleRates.map((r) => (
            <Pill
              key={r}
              label={`${r / 1000}k`}
              active={settings.audio.sampleRate === r}
              onPress={() => void patch({ audio: { sampleRate: r } })}
            />
          ))}
        </View>
      </Row>
      <Row label="Channels">
        <View style={styles.row}>
          {Array.from({ length: caps.audio.maxChannels }, (_, i) => i + 1).map((c) => (
            <Pill
              key={c}
              label={c === 1 ? 'Mono' : 'Stereo'}
              active={settings.audio.channels === c}
              onPress={() => void patch({ audio: { channels: c } })}
            />
          ))}
        </View>
      </Row>
      <Row label="Input level" last>
        <InputLevelMeter active={settings.audio.enabled} />
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: space.sm } });
