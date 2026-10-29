import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';
import { emitToast } from '@/utils/toastBus';

export interface FormBannerProps {
  /** The message to show. When empty/undefined the banner renders nothing. */
  message?: string | null;
  /** `error` (default) → surfaced as a TOAST (no inline box); `success` → inline positive banner. */
  tone?: 'error' | 'success';
  testID?: string;
}

/**
 * Form-level status banner. This is a native app, so ERROR messages are surfaced as a TOAST and
 * render NOTHING inline (no red box) — the toast is the single, consistent error channel. SUCCESS
 * messages still render inline as a positive banner (they're confirmations that are part of the
 * screen content, e.g. "Visit pass ready", "share the code"). Existing `tone="error"` usages across
 * the app therefore become toasts automatically with no per-screen change; the toast host dedupes
 * duplicates (e.g. when `useAsyncAction` also toasted the same message).
 */
export function FormBanner({ message, tone = 'error', testID }: FormBannerProps) {
  const isError = tone === 'error';

  // Error → emit a toast once per distinct message; render nothing inline.
  const lastShown = useRef<string | null>(null);
  useEffect(() => {
    if (isError && message) {
      if (lastShown.current !== message) {
        lastShown.current = message;
        emitToast({ tone: 'error', title: 'Something went wrong', message });
      }
    } else {
      lastShown.current = null;
    }
  }, [isError, message]);

  if (!message || isError) {
    return null;
  }

  return (
    <View
      testID={testID}
      style={[styles.base, styles.success]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.text, styles.successText]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    padding: theme.spacing.md,
  },
  error: { backgroundColor: '#fdecec', borderColor: theme.color.danger },
  success: { backgroundColor: '#e6f4ea', borderColor: '#1a7f37' },
  text: { fontSize: theme.fontSize.body },
  errorText: { color: theme.color.danger },
  successText: { color: '#1a7f37' },
});
