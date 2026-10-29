import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';

export interface FormSectionProps {
  /** Section heading shown above the card. */
  title?: string;
  /** Optional helper line under the title. */
  subtitle?: string;
  /** Optional leading icon beside the title. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Accent for the icon (defaults to brand primary). */
  tint?: string;
  children: React.ReactNode;
}

/**
 * A titled, elevated card that groups related form fields on the app's tinted background. Gives every
 * form a structured, modern look (a header row + a surface card) instead of loose fields stacked on
 * the page. Fields passed as children sit in a consistently spaced column. Styled from the shared
 * {@link theme}.
 */
export function FormSection({ title, subtitle, icon, tint = theme.color.primary, children }: FormSectionProps) {
  return (
    <View style={styles.wrap}>
      {title ? (
        <View style={styles.header}>
          {icon ? (
            <View style={[styles.icon, { backgroundColor: `${tint}1f` }]}>
              <Ionicons name={icon} size={16} color={tint} />
            </View>
          ) : null}
          <View style={styles.headerText}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>
      ) : null}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  icon: { width: 28, height: 28, borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  title: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  subtitle: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, marginTop: 1 },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadow.soft,
  },
});
