import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors, radius } from '../theme/tokens';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
  pressed?: boolean;
}

export function NeumorphicView({ children, style, borderRadius = radius.md, pressed = false }: Props) {
  // We use layered views to create the dual-shadow neumorphic effect in React Native
  return (
    <View style={[styles.container, { borderRadius }, style]}>
      {/* Light shadow top-left */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            backgroundColor: colors.bg,
            shadowColor: '#ffffff',
            shadowOffset: pressed ? { width: -1, height: -1 } : { width: -4, height: -4 },
            shadowOpacity: pressed ? 0.5 : 1,
            shadowRadius: pressed ? 2 : 8,
            elevation: pressed ? 1 : 4,
          },
        ]}
      />
      {/* Dark shadow bottom-right */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            backgroundColor: 'transparent',
            shadowColor: '#a3b1c6',
            shadowOffset: pressed ? { width: 1, height: 1 } : { width: 4, height: 4 },
            shadowOpacity: pressed ? 0.3 : 0.6,
            shadowRadius: pressed ? 2 : 8,
          },
        ]}
      />
      <View style={[styles.inner, { borderRadius }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg,
  },
  inner: {
    flex: 1,
    overflow: 'hidden',
  },
});
