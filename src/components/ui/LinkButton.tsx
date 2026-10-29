import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { theme } from '@/theme';

export interface LinkButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

/**
 * Accessible textual link/button (Req 65.6) for the secondary navigation between auth screens
 * ("Forgot password?", "Back to login"). Exposes `role="link"` with a ≥44pt touch target. Reused
 * instead of wrapping a bare `Text` in a `Pressable` on each screen.
 */
export function LinkButton({
  title,
  onPress,
  disabled = false,
  accessibilityHint,
  testID,
}: LinkButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.base, pressed && !disabled ? styles.pressed : null]}
    >
      <Text style={[styles.text, disabled ? styles.disabled : null]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: theme.minTouchTarget,
    justifyContent: 'center',
    // Left-aligned text so a "‹ Back" / inline link sits at the start (reads correctly, matches the
    // screen's left padding). The PARENT controls row alignment (e.g. login's forgot link right-
    // aligns via its own container), so we only set the internal alignment here, not alignSelf.
    alignItems: 'flex-start',
    paddingVertical: theme.spacing.xs,
  },
  pressed: { opacity: 0.7 },
  text: { fontSize: theme.fontSize.body, color: theme.color.primary, fontWeight: '700' },
  disabled: { color: theme.color.disabled },
});
