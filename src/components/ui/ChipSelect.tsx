import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';
import type { SelectOption } from './Select';

export interface ChipSelectProps {
  label: string;
  /** Mark the field required — appends a red "*" to the label. */
  required?: boolean;
  /** Current value, or null when nothing is selected. */
  value: string | null;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  testID?: string;
}

/**
 * Inline single-select rendered as a wrapping row of tappable pills — NOT a modal/dialog picker.
 * This is the native-app pattern for a short, fixed set of choices (validity windows, entry counts,
 * a handful of units): the user taps a chip in place, no popup. For long or data-driven lists prefer
 * {@link Select} / {@link MasterDataDropdown}. Each chip is a ≥44pt accessible button. Styled from
 * the shared {@link theme}.
 */
export function ChipSelect({ label, required = false, value, options, onChange, disabled = false, testID }: ChipSelectProps) {
  return (
    <View style={styles.container} testID={testID}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <View style={styles.row}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              disabled={disabled}
              onPress={() => onChange(opt.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
              accessibilityLabel={opt.label}
              style={({ pressed }) => [
                styles.chip,
                active ? styles.chipActive : null,
                pressed && !disabled ? styles.pressed : null,
                disabled ? styles.disabled : null,
              ]}
            >
              <Text style={[styles.chipText, active ? styles.chipTextActive : null]} numberOfLines={1}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing.xs },
  label: { fontSize: theme.fontSize.label, color: theme.color.text, fontWeight: '600' },
  required: { color: theme.color.danger, fontWeight: '800' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: {
    minHeight: theme.minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
  },
  chipActive: { backgroundColor: theme.color.primary, borderColor: theme.color.primary },
  pressed: { opacity: 0.7 },
  disabled: { backgroundColor: '#f2f4f7' },
  chipText: { fontSize: theme.fontSize.label, color: theme.color.text, fontWeight: '600' },
  chipTextActive: { color: theme.color.primaryText },
});
