import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from 'react-native';
import { theme } from '@/theme';

export interface AppButtonProps {
  title: string;
  onPress: PressableProps['onPress'];
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  /** Overrides the visible title for assistive tech when the title alone is ambiguous. */
  accessibilityLabel?: string;
  /** Further describes the outcome of pressing (e.g. "Submits the login form"). */
  accessibilityHint?: string;
  testID?: string;
}

/**
 * Accessible button (Req 65.6): `role="button"`, a disabled/busy accessibility state, a label
 * that falls back to the title, and a guaranteed ≥44pt touch target. Both apps use this instead
 * of a bare `Pressable`/`TouchableOpacity`.
 */
export function AppButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: AppButtonProps) {
  const isDisabled = disabled || loading;
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : isDanger ? styles.danger : styles.secondary,
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? theme.color.primaryText : isDanger ? theme.color.danger : theme.color.primary} />
      ) : (
        <Text style={[styles.text, isPrimary ? styles.textPrimary : isDanger ? styles.textDanger : styles.textSecondary]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: theme.minTouchTarget,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primary: { backgroundColor: theme.color.primary },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.color.primary },
  danger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.color.danger },
  pressed: { opacity: 0.85 },
  disabled: { backgroundColor: theme.color.disabled, borderColor: theme.color.disabled },
  text: { fontSize: theme.fontSize.body, fontWeight: '600' },
  textPrimary: { color: theme.color.primaryText },
  textSecondary: { color: theme.color.primary },
  textDanger: { color: theme.color.danger },
});
