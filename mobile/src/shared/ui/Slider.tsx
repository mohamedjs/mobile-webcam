import { useCallback, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '../theme/tokens';

/**
 * Dependency-free slider. @react-native-community/slider would pull a native
 * module for one control; a PanResponder over a View is ~40 lines.
 */
export function Slider({
  value, min, max, step = 0.1, onChange, format,
}: {
  value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setWidth(w);
  };

  const emit = useCallback((x: number) => {
    const w = widthRef.current || 1;
    const ratio = Math.max(0, Math.min(1, x / w));
    const raw = min + ratio * (max - min);
    const snapped = Math.round(raw / step) * step;
    onChange(Number(Math.max(min, Math.min(max, snapped)).toFixed(4)));
  }, [min, max, step, onChange]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => emit(e.nativeEvent.locationX),
      onPanResponderMove: (e) => emit(e.nativeEvent.locationX),
    }),
  ).current;

  const pct = max > min ? (value - min) / (max - min) : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.track} onLayout={onLayout} {...responder.panHandlers}>
        <View style={[styles.fill, { width: Math.max(0, Math.min(1, pct)) * width }]} />
        <View style={[styles.knob, { left: Math.max(0, Math.min(1, pct)) * width - 9 }]} />
      </View>
      <Text style={styles.value}>{format ? format(value) : value.toFixed(1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 },
  track: {
    flex: 1, height: 26, justifyContent: 'center',
    minWidth: 110, maxWidth: 170,
  },
  fill: {
    position: 'absolute', height: 4, borderRadius: radius.sm, backgroundColor: colors.accent,
  },
  knob: {
    position: 'absolute', width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#fff', top: 4,
  },
  value: { ...font.mono, color: colors.muted, minWidth: 52, textAlign: 'right' },
});
