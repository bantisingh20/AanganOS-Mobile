import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
import { Badge, type BadgeProps } from './Badge';

/** A small labelled meta chip (icon + text) shown in a card's meta row. */
export interface MetaChip {
  readonly icon?: keyof typeof Ionicons.glyphMap;
  readonly label: string;
}

export interface EntityCardProps {
  /** Primary line. */
  title: string;
  /** Optional secondary line under the title. */
  subtitle?: string;
  /**
   * Leading visual: either an Ionicon name (rendered in a tinted rounded badge) or 1–2 letter
   * initials (rendered in a tinted avatar). Omit for no leading visual.
   */
  icon?: keyof typeof Ionicons.glyphMap;
  initials?: string;
  /** Accent colour for the leading badge/avatar + chip icons. Defaults to the brand primary. */
  tint?: string;
  /** Status pill on the top-right. */
  badge?: BadgeProps;
  /** Meta chips rendered in a wrapping row beneath the title (type, floor, phone, …). */
  meta?: readonly MetaChip[];
  /** Makes the whole card a button + shows a chevron. */
  onPress?: () => void;
  accessibilityHint?: string;
  /** Extra content rendered inside the card below the meta row (e.g. inline actions). */
  children?: React.ReactNode;
  testID?: string;
}

/**
 * Rich entity card for the admin/list surfaces — a modern replacement for a plain {@link ListRow}.
 * Shows a leading icon badge or initials avatar, a title + subtitle, an optional status {@link Badge}
 * top-right, a wrapping row of meta chips, and optional inline children (actions). When `onPress` is
 * set the whole card is an accessible ≥44pt button with a trailing chevron. Styled entirely from the
 * shared {@link theme} so a global colour change flows through every list.
 */
export function EntityCard({
  title,
  subtitle,
  icon,
  initials,
  tint = theme.color.primary,
  badge,
  meta,
  onPress,
  accessibilityHint,
  children,
  testID,
}: EntityCardProps) {
  const body = (
    <View style={styles.card}>
      <View style={styles.row}>
        {icon ? (
          <View style={[styles.badge, { backgroundColor: `${tint}1f` }]}>
            <Ionicons name={icon} size={22} color={tint} />
          </View>
        ) : initials ? (
          <View style={[styles.avatar, { backgroundColor: `${tint}1f` }]}>
            <Text style={[styles.avatarText, { color: tint }]}>{initials}</Text>
          </View>
        ) : null}

        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>

        {badge ? <Badge {...badge} /> : null}
        {onPress ? <Ionicons name="chevron-forward" size={18} color={theme.color.mutedText} style={styles.chevron} /> : null}
      </View>

      {meta && meta.length > 0 ? (
        <View style={styles.metaRow}>
          {meta.map((m, i) => (
            <View key={`${m.label}-${i}`} style={styles.chip}>
              {m.icon ? <Ionicons name={m.icon} size={13} color={theme.color.mutedText} /> : null}
              <Text style={styles.chipText} numberOfLines={1}>{m.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        accessibilityHint={accessibilityHint}
        style={({ pressed }) => [pressed ? styles.pressed : null]}
      >
        {body}
      </Pressable>
    );
  }
  return body;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    ...theme.shadow.soft,
  },
  pressed: { opacity: 0.75 },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  badge: { width: 44, height: 44, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 44, height: 44, borderRadius: theme.radius.pill, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: theme.fontSize.body, fontWeight: '800' },
  textCol: { flex: 1 },
  title: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  subtitle: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, marginTop: 2 },
  chevron: { marginLeft: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.color.background,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  chipText: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, fontWeight: '600' },
});
