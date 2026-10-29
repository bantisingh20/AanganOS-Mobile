import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { ScreenHeader } from './ScreenHeader';
import { theme } from '@/theme';
import { useSafeInsets } from '@/utils/safeInsets';

export interface FormScreenProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Optional right-aligned header action. */
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  /** Disable the inner scroll (for screens that manage their own list/scroll). Default false. */
  noScroll?: boolean;
}

/**
 * Standard page scaffold for a detail/form screen: the themed {@link ScreenHeader} (safe-area top
 * inset + left-aligned back) over a keyboard-avoiding, scrollable body on the app background, padded
 * by the device's bottom inset so content clears the gesture bar. Every MVP screen uses this so the
 * header, back behaviour, spacing, notch and gesture handling are identical across the app
 * (steering: reuse, don't hand-roll per screen).
 */
export function FormScreen({ title, subtitle, onBack, headerRight, children, noScroll = false }: FormScreenProps) {
  const insets = useSafeInsets();
  const body = (
    <View style={[styles.body, { paddingBottom: theme.spacing.xl + insets.bottom }]}>{children}</View>
  );
  return (
    <View style={styles.root}>
      <ScreenHeader title={title} {...(subtitle ? { subtitle } : {})} {...(onBack ? { onBack } : {})} {...(headerRight ? { right: headerRight } : {})} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {noScroll ? (
          <View style={styles.flex}>{body}</View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
          >
            {body}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  body: { padding: theme.spacing.lg, gap: theme.spacing.md },
});
