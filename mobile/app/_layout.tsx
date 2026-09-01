import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/shared/theme/tokens';
import { useSettingsSync } from '@/features/settings';
import { useServerLifecycle } from '@/features/streaming';

export default function RootLayout() {
  useSettingsSync();
  useServerLifecycle();

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'mobile_webcam' }} />
        <Stack.Screen name="connection" options={{ title: 'Connection' }} />
        <Stack.Screen name="diagnostics" options={{ title: 'Diagnostics' }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
