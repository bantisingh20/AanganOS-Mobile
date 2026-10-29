import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppTextField } from './AppTextField';
import { AsyncBoundary } from './AsyncBoundary';
import { BottomSheet } from './BottomSheet';
import { useAsync } from '@/hooks';
import { theme } from '@/theme';
import type { PagedData } from '@/types/envelope';
import type { Unit } from '@/types/community';
import type { ResourceClients } from '@/services/resources';
import { humanizeCode } from '@/utils/status';

export interface UnitDropdownProps {
  resources: ResourceClients;
  label?: string;
  required?: boolean;
  /** Currently selected unit, or null. */
  value: Unit | null;
  onSelect: (unit: Unit | null) => void;
  disabled?: boolean;
}

/** How many units to show per search page — never load the whole register (can be 2000–3000+). */
const PAGE_SIZE = 20;

/**
 * Searchable host-unit dropdown for the guard gate screens. A labelled trigger (shows the selected
 * unit) opens a modal with a SEARCH field + a results list backed by SERVER-SIDE
 * `units.list({ search })` (debounced, paged `PAGE_SIZE` at a time). It NEVER loads every unit —
 * a community can have 2000–3000+ units, so an inline list or a load-everything `Select` would be
 * unusable (steering: unit selection is always a searchable dropdown). Reports the full {@link Unit}
 * so callers get `communityId`. The one shared unit picker — don't hand-roll another.
 */
export function UnitDropdown({ resources, label = 'Host unit', required = false, value, onSelect, disabled = false }: UnitDropdownProps) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.req}> *</Text> : null}
      </Text>
      <Pressable
        style={[styles.trigger, disabled ? styles.triggerDisabled : null]}
        onPress={() => !disabled && setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={value ? `Host unit ${value.unitNumber}, change` : 'Select the host unit'}
        accessibilityState={{ disabled }}
      >
        <Text style={[styles.triggerText, !value ? styles.placeholder : null]} numberOfLines={1}>
          {value ? `Unit ${value.unitNumber} · ${humanizeCode(value.unitType)}` : 'Search & select the host unit'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={theme.color.mutedText} />
      </Pressable>

      <UnitSearchModal
        visible={open}
        resources={resources}
        onClose={() => setOpen(false)}
        onPick={(u) => {
          onSelect(u);
          setOpen(false);
        }}
      />
    </View>
  );
}

/** Modal: debounced server-side unit search + a paged results list. */
function UnitSearchModal({
  visible,
  resources,
  onClose,
  onPick,
}: {
  visible: boolean;
  resources: ResourceClients;
  onClose: () => void;
  onPick: (unit: Unit) => void;
}) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  // Debounce typing so each keystroke doesn't fire a request (steering: don't spam the API).
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset the query each time the modal opens.
  useEffect(() => {
    if (visible) { setSearch(''); setDebounced(''); }
  }, [visible]);

  const { data, loading, error, reload } = useAsync<PagedData<Unit>>(
    (signal) =>
      resources.units.list({ search: debounced || undefined, page: 1, pageSize: PAGE_SIZE }, {}, { signal }),
    [debounced],
  );
  const items = data?.items ?? [];
  const more = data ? data.totalCount > items.length : false;

  // The search field + the results list are the sheet BODY. BottomSheet lifts the whole sheet above
  // the keyboard, so the search field stays visible while typing (the bug this fixes).
  return (
    <BottomSheet visible={visible} title="Select host unit" onClose={onClose}>
      <AppTextField
        label="Search units"
        value={search}
        onChangeText={setSearch}
        placeholder="Type a unit number"
        autoCapitalize="characters"
        returnKeyType="search"
      />
      <View style={styles.results}>
        <AsyncBoundary
          loading={loading}
          error={error}
          empty={!loading && items.length === 0}
          emptyMessage={debounced ? 'No units match your search.' : 'Type to search units.'}
          onRetry={reload}
        >
          <FlatList
            data={items}
            keyExtractor={(u) => u.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: u }) => (
              <Pressable
                style={styles.row}
                onPress={() => onPick(u)}
                accessibilityRole="button"
                accessibilityLabel={`Select unit ${u.unitNumber}`}
              >
                <View style={[styles.rowIcon, { backgroundColor: `${theme.color.info}1f` }]}>
                  <Ionicons name="home" size={18} color={theme.color.info} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>Unit {u.unitNumber}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {humanizeCode(u.unitType)} · {humanizeCode(u.unitStatus)}
                  </Text>
                </View>
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            ListFooterComponent={more ? <Text style={styles.more}>Refine your search to narrow results</Text> : null}
            showsVerticalScrollIndicator={false}
          />
        </AsyncBoundary>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: theme.fontSize.label, fontWeight: '600', color: theme.color.text },
  req: { color: theme.color.danger },
  trigger: {
    minHeight: theme.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.color.surface,
  },
  triggerDisabled: { opacity: 0.5 },
  triggerText: { flex: 1, fontSize: theme.fontSize.body, color: theme.color.text },
  placeholder: { color: theme.color.mutedText },

  results: { marginTop: theme.spacing.sm, minHeight: 120, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.sm },
  rowIcon: { width: 36, height: 36, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: theme.fontSize.body, fontWeight: '700', color: theme.color.text },
  rowSub: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: theme.color.border },
  more: { textAlign: 'center', color: theme.color.mutedText, fontSize: theme.fontSize.caption, paddingVertical: theme.spacing.md },
});
