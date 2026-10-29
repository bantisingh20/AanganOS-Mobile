import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
import { useSafeInsets } from '@/utils/safeInsets';

export interface TopBarProps {
  /** Primary line: the society/community name, or the app name when no society is known. */
  title: string;
  /** Secondary line: the signed-in user's name/identifier. */
  subtitle?: string;
  /** Unread notification count; shows a badge on the bell when > 0. */
  notificationCount?: number;
  /** Tapped the notification bell. */
  onPressNotifications?: () => void;
}

/**
 * Branded top app bar: the society/app name + the current user on the left, a notification bell
 * (with an optional unread badge) on the right. Styled from the shared {@link theme} so a global
 * colour change flows here automatically (steering: single source of truth for theming).
 */
export function TopBar({ title, subtitle, notificationCount = 0, onPressNotifications }: TopBarProps) {
  const hasUnread = notificationCount > 0;
  const insets = useSafeInsets();
  return (
    <View style={[styles.bar, { paddingTop: theme.spacing.md + insets.top }]}>
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

      <Pressable
        onPress={onPressNotifications}
        style={({ pressed }) => [styles.bell, pressed ? styles.bellPressed : null]}
        accessibilityRole="button"
        accessibilityLabel={hasUnread ? `Notifications, ${notificationCount} unread` : 'Notifications'}
        hitSlop={8}
      >
        <Ionicons name="notifications-outline" size={22} color={theme.color.primaryText} />
        {hasUnread ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{notificationCount > 99 ? '99+' : notificationCount}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.color.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.md,
  },
  titleWrap: { flex: 1 },
  title: { color: theme.color.primaryText, fontSize: theme.fontSize.title, fontWeight: '800' },
  subtitle: { color: theme.color.primaryText, opacity: 0.85, fontSize: theme.fontSize.label, marginTop: 2 },
  bell: {
    width: theme.minTouchTarget,
    height: theme.minTouchTarget,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  bellPressed: { opacity: 0.7 },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: theme.color.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: theme.color.primaryText, fontSize: 10, fontWeight: '800' },
});
