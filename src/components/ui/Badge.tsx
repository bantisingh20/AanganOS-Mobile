import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';

export type BadgeTone = 'neutral' | 'positive' | 'warning' | 'danger';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  testID?: string;
}

/**
 * Small status pill reused for verification status, unit status, etc. The label text carries the
 * meaning (not colour alone — Req 65.6 / WCAG 1.4.1), with tone only reinforcing it.
 */
export function Badge({ label, tone = 'neutral', testID }: BadgeProps) {
  const palette = TONES[tone];
  return (
    <View
      testID={testID}
      style={[styles.base, { backgroundColor: palette.bg, borderColor: palette.border }]}
      accessibilityRole="text"
    >
      <Text style={[styles.text, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

const TONES: Record<BadgeTone, { bg: string; border: string; text: string }> = {
  neutral: { bg: '#eef1f5', border: theme.color.border, text: theme.color.text },
  positive: { bg: '#e6f4ea', border: '#1a7f37', text: '#1a7f37' },
  warning: { bg: '#fff4e5', border: '#9a6700', text: '#9a6700' },
  danger: { bg: '#fdecec', border: theme.color.danger, text: theme.color.danger },
};

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  text: { fontSize: theme.fontSize.label, fontWeight: '600' },
});
