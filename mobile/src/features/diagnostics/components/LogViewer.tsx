import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { Button, Card } from '@/shared/ui';
import { colors, font, radius, space } from '@/shared/theme/tokens';
import { log } from '@/shared/lib/logger';

export function LogViewer() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    const id = setInterval(() => setLines(log.history()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Card title="Logs">
      <ScrollView style={styles.box} nestedScrollEnabled>
        {lines.length === 0
          ? <Text style={styles.line}>No log entries yet.</Text>
          : lines.map((l, i) => <Text key={i} style={styles.line}>{l}</Text>)}
      </ScrollView>
      <Button title="Clear" variant="ghost" onPress={() => { log.clear(); setLines([]); }} />
    </Card>
  );
}

const styles = StyleSheet.create({
  box: {
    maxHeight: 260, backgroundColor: colors.bg, borderRadius: radius.sm,
    padding: space.md, marginBottom: space.md,
  },
  line: { ...font.mono, color: colors.muted, fontSize: 11, lineHeight: 16 },
});
