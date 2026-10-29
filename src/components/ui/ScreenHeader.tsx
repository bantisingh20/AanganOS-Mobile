import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
import { useSafeInsets } from '@/utils/safeInsets';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** When provided, a left-aligned back button is shown (route-based back / hardware-back parity). */
  onBack?: () => void;
  /** Optional right-aligned action (e.g. an add button). */
  right?: React.ReactNode;
}

/**
 * The standard screen header for detail/form screens: a safe-area-aware bar (padded by the device's
 * top inset so it clears the status bar / notch), a left-aligned back button (chevron, consistent
 * everywhere), a title + optional subtitle, and an optional right action. Styled entirely from the
 * shared {@link theme} so a global colour change flows through. Pairs with the route stack — the
 * back button pops the same way the Android hardware back does.
 */
export function ScreenHeader({ title, subtitle, onBack, right }: ScreenHeaderProps) {
  const insets = useSafeInsets();
  return (
    <View style={[styles.bar, { paddingTop: theme.spacing.sm + insets.top }]}>
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={10}
            style={({ pressed }) => [styles.backBtn, pressed ? styles.pressed : null]}
          >
            <Ionicons name="chevron-back" size={24} color={theme.color.primaryText} />
          </Pressable>
        ) : (
          <View style={styles.backSpacer} />
        )}
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : <View style={styles.backSpacer} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: theme.color.primary,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  backBtn: {
    width: theme.minTouchTarget,
    height: theme.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -theme.spacing.sm,
  },
  backSpacer: { width: theme.minTouchTarget - theme.spacing.sm },
  pressed: { opacity: 0.6 },
  titleWrap: { flex: 1 },
  title: { color: theme.color.primaryText, fontSize: theme.fontSize.title, fontWeight: '800' },
  subtitle: { color: theme.color.primaryText, opacity: 0.85, fontSize: theme.fontSize.caption, marginTop: 1 },
  right: { minWidth: theme.minTouchTarget - theme.spacing.sm, alignItems: 'flex-end' },
});
