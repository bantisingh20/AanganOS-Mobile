import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';

export interface StatChipProps {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
}

/**
 * A translucent stat chip for the dashboard hero (on the dark hero background): an icon, a bold
 * value and a muted label. Styled from the shared {@link theme} tokens so it tracks a global theme
 * change. Purely presentational.
 */
export function StatChip({ icon, value, label }: StatChipProps) {
  return (
    <View style={styles.chip} accessible accessibilityLabel={`${value} ${label}`}>
      <Ionicons name={icon} size={18} color={theme.color.primaryText} />
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flex: 1,
    backgroundColor: theme.color.onHeroSoft,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  value: { color: theme.color.primaryText, fontSize: theme.fontSize.title, fontWeight: '800' },
  label: { color: theme.color.primaryText, opacity: 0.8, fontSize: theme.fontSize.caption },
});
