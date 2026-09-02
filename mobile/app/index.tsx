import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebcamPreview } from '@/native/WebcamPreview';
import { WebcamServer } from '@/native/WebcamServer';
import { colors, font, radius, space } from '@/shared/theme/tokens';
import { SettingsSheet } from '@/shared/ui';
import { useStreamStore } from '@/features/streaming';
import { useSettingsStore, SettingsSheetContent } from '@/features/settings';
import { usePairingToken, usePermissions } from '@/features/connection';
import { Settings, HelpCircle, Wifi, Mic, MicOff, Power } from 'lucide-react-native';

export default function Home() {
  const settings = useSettingsStore((s) => s.settings);
  const running = useStreamStore((s) => s.running);
  const busy = useStreamStore((s) => s.busy);
  const start = useStreamStore((s) => s.start);
  const stop = useStreamStore((s) => s.stop);
  const clients = useStreamStore((s) => s.clients);
  const insets = useSafeAreaInsets();
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  const { token } = usePairingToken();
  const { allGranted } = usePermissions();

  const toggleMic = async () => {
    if (settings) {
      await WebcamServer.updateSettings({ audio: { enabled: !settings.audio.enabled } });
    }
  };

  const toggleServer = () => {
    if (running) {
      void stop();
    } else {
      void start(token);
    }
  };

  const isStreaming = running && clients.length > 0;
  // Use clientId as a stand-in for computer name until we parse MDNS/Host headers
  const clientName = clients[0]?.clientId ?? 'No Computer Connected';

  return (
    <View style={styles.container}>
      {/* Full Screen Background Video */}
      <View style={StyleSheet.absoluteFill}>
        {isStreaming && <WebcamPreview style={StyleSheet.absoluteFill} />}
      </View>

      {/* Top Left: Active Status */}
      <View style={[styles.topLeft, { top: insets.top || space.md }]}>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: isStreaming ? colors.bad : colors.muted }]} />
          <Text style={styles.statusText}>{isStreaming ? 'ACTIVE' : (running ? 'WAITING' : 'OFFLINE')}</Text>
        </View>
        <Text style={styles.clientText}>{clientName}</Text>
      </View>

      {/* Right Side HUD */}
      <View style={[styles.rightHud, { top: insets.top || space.md }]}>
        <Link href="/diagnostics" asChild>
          <Pressable style={styles.iconButton}>
            <HelpCircle size={22} color="#FFF" />
          </Pressable>
        </Link>
        <Pressable style={styles.iconButton} onPress={() => setSettingsOpen(true)}>
          <Settings size={22} color="#FFF" />
        </Pressable>
        <Link href="/connection" asChild>
          <Pressable style={styles.iconButton}>
            <Wifi size={22} color="#FFF" />
          </Pressable>
        </Link>
      </View>

      {/* Bottom Center: Start/Stop Server Toggle */}
      <View style={[styles.bottomCenter, { bottom: insets.bottom || space.xl }]}>
        <Pressable 
          style={[styles.powerButton, { backgroundColor: running ? 'rgba(245,82,94,0.8)' : 'rgba(30,30,30,0.8)' }]} 
          onPress={toggleServer}
          disabled={!allGranted || busy}
        >
          <Power size={28} color="#FFF" />
        </Pressable>
      </View>

      <SettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <SettingsSheetContent />
      </SettingsSheet>

      {/* Bottom Right: Mic Toggle */}
      <View style={[styles.bottomRight, { bottom: insets.bottom || space.md }]}>
        <Pressable style={styles.micButton} onPress={toggleMic}>
          {settings?.audio.enabled ? <Mic size={24} color="#FFF" /> : <MicOff size={24} color="#FFF" />}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topLeft: {
    position: 'absolute',
    left: space.md,
    zIndex: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  clientText: {
    color: '#CCC',
    fontSize: 13,
    marginTop: 2,
  },
  rightHud: {
    position: 'absolute',
    right: space.md,
    gap: space.md,
    zIndex: 10,
    alignItems: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(30,30,30,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomCenter: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 10,
  },
  powerButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomRight: {
    position: 'absolute',
    right: space.md,
    zIndex: 10,
  },
  micButton: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: 'rgba(30,30,30,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
