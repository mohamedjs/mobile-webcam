import { Badge, Card, Row } from '@/shared/ui';
import { Text, StyleSheet } from 'react-native';
import { colors, font } from '@/shared/theme/tokens';
import { useStreamStore } from '@/features/streaming';
import { useTelemetry } from '../hooks/useTelemetry';

export function TelemetryPanel() {
  const running = useStreamStore((s) => s.running);
  const t = useTelemetry(running);

  const thermalTone =
    t?.thermalState === 'critical' || t?.thermalState === 'serious' ? 'bad'
      : t?.thermalState === 'fair' ? 'warn' : 'ok';

  return (
    <Card title="Live metrics">
      <Row label="Frame rate"><Text style={styles.v}>{t ? t.fps.toFixed(1) : '—'}</Text></Row>
      <Row label="Bitrate">
        <Text style={styles.v}>{t ? `${(t.bitrate / 1e6).toFixed(2)} Mbps` : '—'}</Text>
      </Row>
      <Row label="Dropped frames"><Text style={styles.v}>{t?.droppedFrames ?? '—'}</Text></Row>
      <Row label="Dropped segments"><Text style={styles.v}>{t?.droppedSegments ?? '—'}</Text></Row>
      <Row label="Clients"><Text style={styles.v}>{t?.clients ?? 0}</Text></Row>
      <Row label="Thermal">
        <Badge label={t?.thermalState ?? 'unknown'} tone={thermalTone} />
      </Row>
      <Row label="Battery" last>
        <Text style={styles.v}>{t?.battery == null ? '—' : `${Math.round(t.battery * 100)}%`}</Text>
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  v: { ...font.mono, color: colors.text, fontSize: 14 },
});
