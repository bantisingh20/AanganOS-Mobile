import React, { useId, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectProps {
  label: string;
  /** Mark the field required — appends a red "*" to the label. */
  required?: boolean;
  /** Current value, or null when nothing is selected. */
  value: string | null;
  options: readonly SelectOption[];
  onChange: (value: string | null) => void;
  /** Placeholder shown when `value` is null. */
  placeholder?: string;
  /** When true an "All" / clear choice is offered (for filters). */
  allowClear?: boolean;
  clearLabel?: string;
  disabled?: boolean;
  testID?: string;
}

/**
 * Accessible single-select built on a modal option list (Req 65.6): a labelled ≥44pt trigger with
 * `role="button"` reporting the current selection, and a list of `menuitem` options each a ≥44pt
 * target. React Native has no native `<select>`, so this is the shared control every dropdown uses
 * instead of hand-rolling a picker per screen. Options are data-driven — see {@link MasterDataDropdown}
 * for the master-data-backed variant (no hardcoded option lists).
 */
export function Select({
  label,
  required = false,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  allowClear = false,
  clearLabel = 'All',
  disabled = false,
  testID,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const selected = options.find((o) => o.value === value) ?? null;
  const triggerText = selected ? selected.label : allowClear && value === null ? clearLabel : placeholder;

  return (
    <View style={styles.container}>
      <Text nativeID={labelId} style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <Pressable
        testID={testID}
        disabled={disabled}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={required ? `${label}, required` : label}
        accessibilityHint={`Current selection: ${selected ? selected.label : triggerText}. Opens a list of options.`}
        accessibilityState={{ disabled, expanded: open }}
        style={({ pressed }) => [
          styles.trigger,
          pressed && !disabled ? styles.pressed : null,
          disabled ? styles.disabled : null,
        ]}
      >
        <Text style={[styles.triggerText, !selected ? styles.placeholder : null]} numberOfLines={1}>
          {triggerText}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} accessibilityLabel="Close options" onPress={() => setOpen(false)}>
          <View style={styles.sheet} accessibilityRole="menu" accessibilityLabel={`${label} options`}>
            {allowClear ? (
              <OptionRow
                label={clearLabel}
                selected={value === null}
                onPress={() => {
                  onChange(null);
                  setOpen(false);
                }}
              />
            ) : null}
            {options.map((opt) => (
              <OptionRow
                key={opt.value}
                label={opt.label}
                selected={opt.value === value}
                onPress={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              />
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function OptionRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.option, pressed ? styles.pressed : null]}
    >
      <Text style={[styles.optionText, selected ? styles.optionSelected : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing.xs },
  label: { fontSize: theme.fontSize.label, color: theme.color.text, fontWeight: '600' },
  required: { color: theme.color.danger, fontWeight: '800' },
  trigger: {
    minHeight: theme.minTouchTarget,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  disabled: { backgroundColor: '#f2f4f7' },
  triggerText: { fontSize: theme.fontSize.body, color: theme.color.text },
  placeholder: { color: theme.color.mutedText },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  sheet: {
    backgroundColor: theme.color.background,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.xs,
    maxHeight: '70%',
  },
  option: { minHeight: theme.minTouchTarget, justifyContent: 'center', paddingHorizontal: theme.spacing.lg },
  optionText: { fontSize: theme.fontSize.body, color: theme.color.text },
  optionSelected: { color: theme.color.primary, fontWeight: '700' },
});
