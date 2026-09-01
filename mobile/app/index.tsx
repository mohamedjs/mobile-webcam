import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebcamPreview } from '@/native/WebcamPreview';
import { colors, font, radius, space } from '@/shared/theme/tokens';
import { LensSelector, ZoomSlider, FocusReticle, useTapToFocus } from '@/features/camera';
import { StreamToggle, StreamStatusBadge, useStreamStore } from '@/features/streaming';
import { PermissionGate } from '@/features/connection';
import { useSettingsStore } from '@/features/settings';

export default function Home() {
  const { point, onLayout, onTouch } = useTapToFocus();
  const settings = useSettingsStore((s) => s.settings);
  const error = useSettingsStore((s) => s.error);
  const streamError = useStreamStore((s) => s.error);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.previewWrap} onLayout={onLayout}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onTouch}>
          <WebcamPreview style={StyleSheet.absoluteFill} />
        </Pressable>
        <FocusReticle point={point} />
        <View style={styles.overlayTop}>
          <StreamStatusBadge />
        </View>
        <View style={styles.overlayBottom}>
          <LensSelector />
        </View>
      </View>

      <View style={styles.controls}>
        {streamError ? <Text style={styles.error}>{streamError}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <PermissionGate />

        <View style={styles.zoomRow}>
          <Text style={styles.zoomLabel}>Zoom</Text>
          <ZoomSlider />
        </View>

        <StreamToggle />

        <View style={styles.links}>
          <Link href="/settings/video" asChild>
            <Pressable style={styles.link}><Text style={styles.linkText}>Video</Text></Pressable>
          </Link>
          <Link href="/settings/cinematic" asChild>
            <Pressable style={styles.link}><Text style={styles.linkText}>Cinematic</Text></Pressable>
          </Link>
          <Link href="/settings/audio" asChild>
            <Pressable style={styles.link}><Text style={styles.linkText}>Audio</Text></Pressable>
          </Link>
          <Link href="/connection" asChild>
            <Pressable style={styles.link}><Text style={styles.linkText}>Connection</Text></Pressable>
          </Link>
          <Link href="/diagnostics" asChild>
            <Pressable style={styles.link}><Text style={styles.linkText}>Diagnostics</Text></Pressable>
          </Link>
          <Link href="/settings/advanced" asChild>
            <Pressable style={styles.link}><Text style={styles.linkText}>Advanced</Text></Pressable>
          </Link>
        </View>

        {settings ? (
          <Text style={styles.summary}>
            {settings.resolution.height}p · {settings.fps}fps ·{' '}
            {(settings.bitrate / 1e6).toFixed(0)}Mbps
            {settings.cinematic.enabled ? ` · Cinematic f/${settings.cinematic.aperture.toFixed(1)}` : ''}
            {settings.audio.enabled ? ' · mic on' : ' · mic off'}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  previewWrap: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  overlayTop: { position: 'absolute', top: space.md, left: space.md },
  overlayBottom: { position: 'absolute', bottom: space.md, left: space.md, right: space.md },
  controls: { padding: space.lg, gap: space.md },
  zoomRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  zoomLabel: { ...font.label, color: colors.muted, width: 44 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  link: {
    paddingVertical: space.sm, paddingHorizontal: space.md,
    backgroundColor: colors.panelAlt, borderRadius: radius.sm,
  },
  linkText: { ...font.label, color: colors.text, fontSize: 13 },
  summary: { ...font.mono, color: colors.muted, textAlign: 'center' },
  error: {
    ...font.body, fontSize: 13, color: colors.bad, backgroundColor: 'rgba(245,82,94,0.10)',
    padding: space.md, borderRadius: radius.sm, lineHeight: 18,
  },
});
