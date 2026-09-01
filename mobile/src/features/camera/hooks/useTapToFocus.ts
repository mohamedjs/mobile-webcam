import { useCallback, useRef, useState } from 'react';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { WebcamServer } from '@/native/WebcamServer';
import { log } from '@/shared/lib/logger';

export interface FocusPoint { x: number; y: number; at: number }

/**
 * Tap-to-focus. Coordinates are normalised to 0..1 before crossing the bridge —
 * the native side works in device space, not view pixels.
 */
export function useTapToFocus() {
  const [point, setPoint] = useState<FocusPoint | null>(null);
  const size = useRef({ width: 1, height: 1 });

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    size.current = { width: width || 1, height: height || 1 };
  }, []);

  const onTouch = useCallback((e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    const x = Math.max(0, Math.min(1, locationX / size.current.width));
    const y = Math.max(0, Math.min(1, locationY / size.current.height));
    setPoint({ x: locationX, y: locationY, at: Date.now() });
    WebcamServer.focusAt(x, y).catch((err: unknown) =>
      log.warn('focus failed', err instanceof Error ? err.message : String(err)));
    setTimeout(() => setPoint((p) => (p && Date.now() - p.at >= 900 ? null : p)), 1000);
  }, []);

  return { point, onLayout, onTouch };
}
