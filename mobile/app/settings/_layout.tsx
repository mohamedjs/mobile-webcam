import { Stack } from 'expo-router';
import { colors } from '@/shared/theme/tokens';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="video" options={{ title: 'Video' }} />
      <Stack.Screen name="cinematic" options={{ title: 'Cinematic' }} />
      <Stack.Screen name="audio" options={{ title: 'Audio' }} />
      <Stack.Screen name="advanced" options={{ title: 'Advanced' }} />
    </Stack>
  );
}
