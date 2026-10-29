import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';
import { emitToast } from '@/utils/toastBus';
import type { FormErrorView } from '@/utils/formError';

export interface AsyncBoundaryProps {
  loading: boolean;
  error: FormErrorView | null;
  /** True when the load succeeded but there is nothing to show. */
  empty?: boolean;
  /** Message for the empty state. */
  emptyMessage?: string;
  /** Retry handler. On error a small "Tap to retry" link is shown (native-app style, not a banner). */
  onRetry?: () => void;
  /** The success content, rendered only when not loading, no error, and not empty. */
  children: React.ReactNode;
  testID?: string;
}

/**
 * The one place every data screen renders its loading / error / empty / success states. This is a
 * native app, so an error is surfaced as a TOAST (not an inline error banner/box): on failure it
 * emits a toast and renders only a quiet, tappable "Tap to retry" line — no blocking error UI.
 * Loading shows a small spinner; empty shows a quiet message; otherwise it renders `children`.
 */
export function AsyncBoundary({
  loading,
  error,
  empty = false,
  emptyMessage = 'Nothing to show yet.',
  onRetry,
  children,
  testID,
}: AsyncBoundaryProps) {
  // Surface each error as a toast once (dedupe is handled by the toast host). Keyed on the message
  // so a new/different error re-toasts, but the same error doesn't spam on re-render.
  const lastShown = useRef<string | null>(null);
  useEffect(() => {
    if (error) {
      const msg = error.message || 'Something went wrong. Please try again.';
      if (lastShown.current !== msg) {
        lastShown.current = msg;
        emitToast({ tone: 'error', title: 'Something went wrong', message: msg });
      }
    } else {
      lastShown.current = null;
    }
  }, [error]);

  if (loading) {
    return (
      <View style={styles.center} testID={testID} accessibilityRole="progressbar" accessibilityLabel="Loading">
        <ActivityIndicator color={theme.color.primary} />
      </View>
    );
  }

  if (error) {
    // No inline error box — the toast already told the user. Offer a quiet retry affordance only.
    if (!onRetry) {
      return null;
    }
    return (
      <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Tap to retry" style={styles.retryWrap} testID={testID}>
        <Text style={styles.retry}>Tap to retry</Text>
      </Pressable>
    );
  }

  if (empty) {
    // Empty is a success-with-no-data state (not a failure) — a quiet message, nothing else.
    return (
      <View style={styles.emptyWrap} testID={testID}>
        <Text style={styles.empty} accessibilityRole="text">{emptyMessage}</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl, gap: theme.spacing.md },
  retryWrap: { paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.sm, alignItems: 'flex-start' },
  retry: { fontSize: theme.fontSize.label, color: theme.color.primary, fontWeight: '700' },
  emptyWrap: { paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.sm },
  empty: { fontSize: theme.fontSize.label, color: theme.color.mutedText, textAlign: 'left' },
});
