import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { colors } from '@/shared/theme/tokens';
import type { FocusPoint } from '../hooks/useTapToFocus';

export function FocusReticle({ point }: { point: FocusPoint | null }) {
  const scale = useRef(new Animated.Value(1.4)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!point) return;
    scale.setValue(1.4);
    opacity.setValue(1);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }),
      Animated.timing(opacity, { toValue: 0, duration: 900, delay: 300, useNativeDriver: true }),
    ]).start();
  }, [point, scale, opacity]);

  if (!point) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.reticle,
        { left: point.x - 36, top: point.y - 36, opacity, transform: [{ scale }] },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  reticle: {
    position: 'absolute', width: 72, height: 72, borderRadius: 8,
    borderWidth: 1.5, borderColor: colors.warn,
  },
});
