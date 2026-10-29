import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { theme } from '@/theme';

export interface ToggleProps {
  label: string;
  /** Secondary line under the label. */
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
}

/**
 * Accessible labelled switch (Req 65.6): a visible label used as the accessibility label, the switch
 * exposed with `role="switch"` and a `checked` state, and a ≥44pt row. Reused by the communication
 * preferences screen (per-category opt-in) instead of a bare `<Switch>`.
 */
export function Toggle({ label, description, value, onValueChange, disabled = false, testID }: ToggleProps) {
  return (
    <View style={styles.row}>
      <View style={styles.textCol}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <Switch
        testID={testID}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled }}
        trackColor={{ true: theme.color.primary, false: theme.color.disabled }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: theme.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  textCol: { flex: 1, gap: theme.spacing.xs },
  label: { fontSize: theme.fontSize.body, color: theme.color.text, fontWeight: '600' },
  description: { fontSize: theme.fontSize.label, color: theme.color.mutedText },
});
