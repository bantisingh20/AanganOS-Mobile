import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';

export interface QuickActionCardProps {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Accent colour for the icon badge + left rail. Defaults to the theme primary. */
  tint?: string;
  onPress: () => void;
  accessibilityHint?: string;
  testID?: string;
}

/**
 * A modern wide action card: a coloured icon badge, a title + subtitle, a chevron, and a thin
 * coloured left rail. Styled from the shared {@link theme}, so a global colour change flows through.
 * Reused on the dashboard for high-value quick actions (richer than the compact grid tile).
 */
export function QuickActionCard({
  title,
  subtitle,
  icon,
  tint,
  onPress,
  accessibilityHint,
  testID,
}: QuickActionCardProps) {
  const accent = tint ?? theme.color.primary;
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
    >
      <View style={[styles.rail, { backgroundColor: accent }]} />
      <View style={[styles.badge, { backgroundColor: softTint(accent) }]}>
        <Ionicons name={icon} size={22} color={accent} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.color.mutedText} />
    </Pressable>
  );
}

/** ~12% alpha fill of a #rrggbb accent for the icon badge; falls back to the soft accent token. */
function softTint(hex: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}1f` : theme.color.accentSoft;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    paddingRight: theme.spacing.md,
    paddingLeft: theme.spacing.lg,
    gap: theme.spacing.md,
    overflow: 'hidden',
    ...theme.shadow.soft,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },
  rail: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  badge: {
    width: 46,
    height: 46,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1, gap: 2 },
  title: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  subtitle: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
});
