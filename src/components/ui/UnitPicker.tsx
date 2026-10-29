import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppTextField } from './AppTextField';
import { AsyncBoundary } from './AsyncBoundary';
import { ListRow } from './ListRow';
import { Badge } from './Badge';
import { useAsync } from '@/hooks';
import { theme } from '@/theme';
import { DEFAULT_PAGE_SIZE } from '@/types/query';
import type { PagedData } from '@/types/envelope';
import type { Unit } from '@/types/community';
import type { ResourceClients } from '@/services/resources';
import { humanizeCode } from '@/utils/status';

export interface UnitPickerProps {
  resources: ResourceClients;
  /** The currently selected unit, or null. */
  value: Unit | null;
  onSelect: (unit: Unit) => void;
}

/**
 * Reusable "find and pick a host unit" control for the guard gate screens (walk-in capture, SOS).
 * Searches the tenant-scoped unit list server-side (same {@link ResourceClients.units} list the
 * Phase 2 lookup uses) and shows the picked unit as a selected row the guard can change. Kept here
 * so the walk-in and SOS screens don't each re-implement unit search (steering: reuse, don't
 * hand-roll).
 */
export function UnitPicker({ resources, value, onSelect }: UnitPickerProps) {
  const [search, setSearch] = useState('');

  const { data, loading, error, reload } = useAsync<PagedData<Unit>>(
    (signal) =>
      resources.units.list({ search: search.trim() || undefined, page: 1, pageSize: DEFAULT_PAGE_SIZE }, {}, { signal }),
    [search],
  );

  if (value) {
    return (
      <View style={styles.stack}>
        <ListRow
          title={`Unit ${value.unitNumber}`}
          subtitle={humanizeCode(value.unitType)}
          trailing={<Badge label="Selected" tone="positive" />}
          onPress={() => onSelect(value)}
          accessibilityHint="Change the selected unit"
        />
        <AppTextField
          label="Change unit"
          value={search}
          onChangeText={setSearch}
          placeholder="Search by unit number"
          autoCapitalize="characters"
          returnKeyType="search"
        />
        <UnitResults data={data} loading={loading} error={error} reload={reload} onSelect={onSelect} />
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <AppTextField
        label="Host unit"
        value={search}
        onChangeText={setSearch}
        placeholder="Search by unit number"
        autoCapitalize="characters"
        returnKeyType="search"
      />
      <UnitResults data={data} loading={loading} error={error} reload={reload} onSelect={onSelect} />
    </View>
  );
}

function UnitResults({
  data,
  loading,
  error,
  reload,
  onSelect,
}: {
  data: PagedData<Unit> | null;
  loading: boolean;
  error: ReturnType<typeof useAsync<PagedData<Unit>>>['error'];
  reload: () => void;
  onSelect: (unit: Unit) => void;
}) {
  const items = data?.items ?? [];
  return (
    <AsyncBoundary
      loading={loading}
      error={error}
      empty={!loading && items.length === 0}
      emptyMessage="No units match your search."
      onRetry={reload}
    >
      <View style={styles.stack}>
        {items.map((u) => (
          <ListRow
            key={u.id}
            title={`Unit ${u.unitNumber}`}
            subtitle={`${humanizeCode(u.unitType)} · ${humanizeCode(u.unitStatus)}`}
            onPress={() => onSelect(u)}
            accessibilityHint={`Select unit ${u.unitNumber}`}
          />
        ))}
      </View>
    </AsyncBoundary>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.spacing.sm },
});
