import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, space } from '../theme/tokens';

export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const Body = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Body contentContainerStyle={scroll ? styles.content : undefined} style={styles.flex}>
        {children}
      </Body>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
});
