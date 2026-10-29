import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';

export interface ListRowProps {
  title: string;
  /** Secondary line under the title. */
  subtitle?: string;
  /** Right-aligned slot (e.g. a {@link Badge} or chevron). */
  trailing?: React.ReactNode;
  /** Makes the whole row a button when set. */
  onPress?: () => void;
  /** Describes the row for assistive tech; defaults to the title (+ subtitle). */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

/**
 * Accessible list row reused by every list screen (Req 65.6) so no screen hand-rolls a tappable row.
 * When `onPress` is set the whole row is a `button` with a ≥44pt target and a combined label;
 * otherwise it is a static, readable row. Both apps use this instead of a bare `Pressable`/`View`.
 */
export function ListRow({
  title,
  subtitle,
  trailing,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ListRowProps) {
  const label = accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title);
  const body = (
    <View style={styles.inner}>
      <View style={styles.textCol}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );

  if (!onPress) {
    return (
      <View testID={testID} style={styles.base} accessibilityRole="text" accessibilityLabel={label}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.base, pressed ? styles.pressed : null]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: theme.minTouchTarget,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    justifyContent: 'center',
    backgroundColor: theme.color.background,
  },
  pressed: { opacity: 0.7 },
  inner: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  textCol: { flex: 1, gap: theme.spacing.xs },
  title: { fontSize: theme.fontSize.body, fontWeight: '600', color: theme.color.text },
  subtitle: { fontSize: theme.fontSize.label, color: theme.color.mutedText },
  trailing: { flexShrink: 0 },
});
