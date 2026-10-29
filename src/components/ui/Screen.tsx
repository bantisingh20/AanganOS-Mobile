import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { theme } from '@/theme';

export interface ScreenProps {
  children: React.ReactNode;
  /** Wrap content in a ScrollView (default true). */
  scroll?: boolean;
  style?: ViewStyle;
  /** Accessibility label for the screen region. */
  accessibilityLabel?: string;
}

/**
 * Standard screen container: safe-area aware, consistent padding, optional scroll. Both apps use
 * this instead of hand-rolling a root view per screen (steering: reuse shared components).
 */
export function Screen({ children, scroll = true, style, accessibilityLabel }: ScreenProps) {
  const inner = <View style={[styles.inner, style]}>{children}</View>;
  return (
    <SafeAreaView
      style={styles.safe}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="none"
    >
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  scrollContent: { flexGrow: 1 },
  inner: { flex: 1, padding: theme.spacing.lg, gap: theme.spacing.md },
});
