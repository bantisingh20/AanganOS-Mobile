import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';
import { Select, type SelectOption } from './Select';
import { useAsync } from '@/hooks';
import type { MasterDataClient } from '@/services/resources/masterDataClient';
import type { MasterDataKey, MasterDataEntry } from '@/types/masterData';

export interface MasterDataDropdownProps {
  label: string;
  /** Mark the field required — appends a red "*" to the label. */
  required?: boolean;
  /** The master-data list to resolve options from, e.g. `Unit_Status`, `Resident_Type`. */
  listKey: MasterDataKey | string;
  /** The resolver that reaches the backend master-data endpoint. */
  masterData: MasterDataClient;
  value: string | null;
  onChange: (value: string | null) => void;
  /** Scope the list to a community (per-community overrides); omit for the platform default. */
  communityId?: string;
  /** Also include retired codes already stored on a record (so a legacy value still renders). */
  includeInactive?: boolean;
  placeholder?: string;
  allowClear?: boolean;
  clearLabel?: string;
  testID?: string;
}

/**
 * A {@link Select} whose options come from the configurable master-data list — never a hardcoded
 * option array in the app (steering: no hardcoding; Req 8.4). Every status/type/category dropdown in
 * the Phase 2 screens uses this, so adding/retiring a code on the backend changes the UI with no app
 * release. Shows a small inline spinner while the list loads and a quiet error line if it can't
 * (the surrounding form stays usable).
 */
export function MasterDataDropdown({
  label,
  required = false,
  listKey,
  masterData,
  value,
  onChange,
  communityId,
  includeInactive,
  placeholder,
  allowClear = false,
  clearLabel,
  testID,
}: MasterDataDropdownProps) {
  const { data, loading, error } = useAsync<MasterDataEntry[]>(
    (signal) => masterData.list(listKey, { communityId, includeInactive, signal }),
    [listKey, communityId, includeInactive],
  );

  const options: SelectOption[] = useMemo(
    () => (data ?? []).map((e) => ({ value: e.code, label: e.label })),
    [data],
  );

  if (loading && !data) {
    return (
      <View style={styles.loadingRow} accessibilityRole="progressbar" accessibilityLabel={`Loading ${label} options`}>
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
        <ActivityIndicator color={theme.color.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Select
        label={label}
        required={required}
        value={value}
        options={options}
        onChange={onChange}
        placeholder={placeholder}
        allowClear={allowClear}
        {...(clearLabel ? { clearLabel } : {})}
        testID={testID}
      />
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          Couldn&apos;t load options. {error.message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing.xs },
  loadingRow: { gap: theme.spacing.xs },
  label: { fontSize: theme.fontSize.label, color: theme.color.text, fontWeight: '600' },
  required: { color: theme.color.danger, fontWeight: '800' },
  error: { fontSize: theme.fontSize.label, color: theme.color.danger },
});
