import { useCallback } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { colors, font, radius, space } from '../theme/tokens';

/**
 * Bottom sheet holding every setting in one scrollable surface.
 *
 * Replaces the per-topic routes (`/settings/video`, `/settings/audio`, …):
 * pushing a screen hid the camera preview, and changing a setting is something
 * you do *while* watching the picture. The sheet covers roughly the lower
 * three-quarters so the preview stays visible above it.
 */
export function SettingsSheet({
  visible,
  onClose,
  title = 'Settings',
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const close = useCallback(() => onClose(), [onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      // iOS shows the sheet over the camera preview rather than tearing down
      // the view behind it, which would stop the capture session.
      presentationStyle="overFullScreen"
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        {/* Tapping above the sheet dismisses it, as in any iOS sheet. */}
        <Pressable style={styles.dismissArea} onPress={close} />

        <View style={[styles.sheet, { paddingBottom: insets.bottom || space.lg }]}>
          <View style={styles.grabber} />

          <View style={styles.header}>
            <Pressable
              onPress={close}
              style={styles.closeButton}
              hitSlop={12}
              accessibilityLabel="Close settings"
            >
              <X size={22} color="#FFF" />
            </Pressable>
            <Text style={styles.title}>{title}</Text>
            {/* Balances the close button so the title stays centred. */}
            <View style={styles.closeButton} />
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** A titled group inside the sheet. */
export function SheetSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  dismissArea: { flex: 1, minHeight: space.xl },
  sheet: {
    maxHeight: '82%',
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  closeButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FFF', fontSize: 20, fontWeight: '700' },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: space.xl, gap: space.lg },
  section: { gap: space.xs },
  sectionTitle: {
    ...font.label,
    color: colors.muted,
    letterSpacing: 0.8,
    marginLeft: space.xs,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  sectionBody: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
});
