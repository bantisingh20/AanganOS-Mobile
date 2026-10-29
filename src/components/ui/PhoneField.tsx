import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';

/** One selectable country dial code. */
export interface CountryCode {
  readonly iso: string;
  readonly name: string;
  readonly dial: string;
  readonly flag: string;
}

/**
 * Hardcoded common country codes (steering: a curated list in code, not a full ISO table). India is
 * first (the default). Extend by adding a row.
 */
export const COUNTRY_CODES: readonly CountryCode[] = [
  { iso: 'IN', name: 'India', dial: '+91', flag: '🇮🇳' },
  { iso: 'US', name: 'United States', dial: '+1', flag: '🇺🇸' },
  { iso: 'AE', name: 'United Arab Emirates', dial: '+971', flag: '🇦🇪' },
  { iso: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧' },
  { iso: 'SG', name: 'Singapore', dial: '+65', flag: '🇸🇬' },
  { iso: 'AU', name: 'Australia', dial: '+61', flag: '🇦🇺' },
  { iso: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦' },
  { iso: 'SA', name: 'Saudi Arabia', dial: '+966', flag: '🇸🇦' },
  { iso: 'NP', name: 'Nepal', dial: '+977', flag: '🇳🇵' },
  { iso: 'LK', name: 'Sri Lanka', dial: '+94', flag: '🇱🇰' },
  { iso: 'BD', name: 'Bangladesh', dial: '+880', flag: '🇧🇩' },
];

const DEFAULT_COUNTRY = COUNTRY_CODES[0]!;

export interface PhoneFieldProps {
  label: string;
  /** Current E.164-ish value, e.g. "+919876543210". The parent stores this combined value. */
  value: string;
  onChangeText: (value: string) => void;
  required?: boolean;
  error?: string;
  editable?: boolean;
  placeholder?: string;
  testID?: string;
}

/** Split a combined "+<dial><number>" into a known country + local digits (best-effort). */
function splitValue(value: string): { country: CountryCode; local: string } {
  const v = (value ?? '').replace(/\s+/g, '');
  if (v.startsWith('+')) {
    // Longest dial code match wins (e.g. +971 before +9).
    const match = [...COUNTRY_CODES]
      .sort((a, b) => b.dial.length - a.dial.length)
      .find((c) => v.startsWith(c.dial));
    if (match) {
      return { country: match, local: v.slice(match.dial.length) };
    }
  }
  return { country: DEFAULT_COUNTRY, local: v.replace(/^\+/, '') };
}

/**
 * Accessible phone input with a country-code picker (flag + dial code) and a number field. Emits the
 * COMBINED E.164-ish string (`+<dial><digits>`) via {@link onChangeText}, so the parent stores one
 * value usable as a login identifier. Reusable across every phone input (steering: one shared
 * component, no per-screen hand-rolling). The dial list is the hardcoded {@link COUNTRY_CODES}.
 */
export function PhoneField({ label, value, onChangeText, required = false, error, editable = true, placeholder = 'Phone number', testID }: PhoneFieldProps) {
  const { country, local } = useMemo(() => splitValue(value), [value]);
  const [open, setOpen] = useState(false);
  const hasError = Boolean(error);

  const emit = (dial: string, digits: string) => {
    const clean = digits.replace(/[^\d]/g, '');
    onChangeText(clean ? `${dial}${clean}` : '');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <View style={[styles.row, hasError ? styles.rowError : null]}>
        <Pressable
          onPress={() => editable && setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Country code, currently ${country.name} ${country.dial}`}
          accessibilityHint="Opens the country code list"
          style={styles.codeBtn}
          disabled={!editable}
        >
          <Text style={styles.flag}>{country.flag}</Text>
          <Text style={styles.dial}>{country.dial}</Text>
          <Ionicons name="chevron-down" size={14} color={theme.color.mutedText} />
        </Pressable>
        <View style={styles.divider} />
        <TextInput
          testID={testID}
          value={local}
          onChangeText={(t) => emit(country.dial, t)}
          editable={editable}
          keyboardType="phone-pad"
          placeholder={placeholder}
          placeholderTextColor={theme.color.mutedText}
          accessibilityLabel={required ? `${label}, required` : label}
          style={styles.input}
        />
      </View>
      {hasError ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} accessibilityLabel="Close" onPress={() => setOpen(false)}>
          <View style={styles.sheet} accessibilityRole="menu" accessibilityLabel="Country codes">
            {COUNTRY_CODES.map((c) => (
              <Pressable
                key={c.iso}
                onPress={() => { emit(c.dial, local); setOpen(false); }}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: c.iso === country.iso }}
                style={({ pressed }) => [styles.option, pressed ? styles.pressed : null]}
              >
                <Text style={styles.flag}>{c.flag}</Text>
                <Text style={styles.optName} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.optDial}>{c.dial}</Text>
                {c.iso === country.iso ? <Ionicons name="checkmark" size={18} color={theme.color.primary} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing.xs },
  label: { fontSize: theme.fontSize.label, color: theme.color.text, fontWeight: '600' },
  required: { color: theme.color.danger, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.minTouchTarget,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
  },
  rowError: { borderColor: theme.color.danger },
  codeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
  flag: { fontSize: 18 },
  dial: { fontSize: theme.fontSize.body, color: theme.color.text, fontWeight: '700' },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: theme.color.border, marginVertical: theme.spacing.sm },
  input: { flex: 1, paddingHorizontal: theme.spacing.md, fontSize: theme.fontSize.body, color: theme.color.text },
  error: { fontSize: theme.fontSize.label, color: theme.color.danger },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: theme.spacing.lg },
  sheet: { backgroundColor: theme.color.background, borderRadius: theme.radius.md, paddingVertical: theme.spacing.xs, maxHeight: '70%' },
  option: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, minHeight: theme.minTouchTarget, paddingHorizontal: theme.spacing.lg },
  pressed: { opacity: 0.7 },
  optName: { flex: 1, fontSize: theme.fontSize.body, color: theme.color.text },
  optDial: { fontSize: theme.fontSize.body, color: theme.color.mutedText, fontWeight: '600' },
});
