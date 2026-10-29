import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { AppTextField } from '@/components/ui/AppTextField';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { Badge } from '@/components/ui/Badge';
import { Pager } from '@/components/ui/Pager';
import { useAsync } from '@/hooks';
import { theme } from '@/theme';
import { DEFAULT_PAGE_SIZE } from '@/types/query';
import type { PagedData } from '@/types/envelope';
import type { Unit } from '@/types/community';
import type { Resident } from '@/types/resident';
import type { ResourceClients } from '@/services/resources';
import { verificationTone, humanizeCode } from '@/utils/status';

export interface GuardLookupScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

type Mode = 'units' | 'residents';

/**
 * Guard read-only lookup (Phase 2 minimal guard need) — redesigned to the shared card style. Search
 * units or residents, scoped server-side to the guard's authorized communities. Read-only (no verify
 * or edit — those live in the resident/admin app). A pill segmented control switches the entity;
 * results render as **product-row cards**.
 */
export function GuardLookupScreen({ resources, onBack }: GuardLookupScreenProps) {
  const [mode, setMode] = useState<Mode>('units');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const switchMode = (m: Mode) => {
    setMode(m);
    setPage(1);
    setSearch('');
  };

  return (
    <FormScreen title="Lookup" subtitle="Find a unit or resident" {...(onBack ? { onBack } : {})}>
      <View style={styles.segment} accessibilityRole="tablist">
        <SegTab label="Units" active={mode === 'units'} onPress={() => switchMode('units')} />
        <SegTab label="Residents" active={mode === 'residents'} onPress={() => switchMode('residents')} />
      </View>

      <AppTextField
        label="Search"
        value={search}
        onChangeText={(t) => {
          setPage(1);
          setSearch(t);
        }}
        placeholder={mode === 'units' ? 'Search by unit number' : 'Search by name'}
        autoCapitalize={mode === 'units' ? 'characters' : 'words'}
        returnKeyType="search"
      />

      {mode === 'units' ? (
        <UnitResults resources={resources} search={search} page={page} onPageChange={setPage} />
      ) : (
        <ResidentResults resources={resources} search={search} page={page} onPageChange={setPage} />
      )}
    </FormScreen>
  );
}

/** A pill tab in the segmented control. */
function SegTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.segTab, active ? styles.segTabActive : null]}
    >
      <Text style={[styles.segText, active ? styles.segTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function UnitResults({
  resources,
  search,
  page,
  onPageChange,
}: {
  resources: ResourceClients;
  search: string;
  page: number;
  onPageChange: (p: number) => void;
}) {
  const { data, loading, error, reload } = useAsync<PagedData<Unit>>(
    (signal) => resources.units.list({ search: search.trim() || undefined, page, pageSize: DEFAULT_PAGE_SIZE }, {}, { signal }),
    [search, page],
  );
  const items = data?.items ?? [];
  return (
    <AsyncBoundary
      loading={loading}
      error={error}
      empty={!loading && items.length === 0}
      emptyMessage="No units found."
      onRetry={reload}
    >
      <View style={styles.list}>
        {items.map((u) => (
          <View key={u.id} style={styles.card}>
            <View style={[styles.iconTile, { backgroundColor: `${theme.color.info}1f` }]}>
              <Ionicons name="home" size={22} color={theme.color.info} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={1}>Unit {u.unitNumber}</Text>
              <Text style={styles.cardSub} numberOfLines={1}>{humanizeCode(u.unitType)}</Text>
            </View>
            <Badge label={humanizeCode(u.unitStatus)} tone="neutral" />
          </View>
        ))}
      </View>
      {data ? (
        <Pager page={data.page} pageSize={data.pageSize} totalCount={data.totalCount} onPageChange={onPageChange} disabled={loading} />
      ) : null}
    </AsyncBoundary>
  );
}

function ResidentResults({
  resources,
  search,
  page,
  onPageChange,
}: {
  resources: ResourceClients;
  search: string;
  page: number;
  onPageChange: (p: number) => void;
}) {
  const { data, loading, error, reload } = useAsync<PagedData<Resident>>(
    (signal) => resources.residents.list({ search: search.trim() || undefined, page, pageSize: DEFAULT_PAGE_SIZE }, {}, { signal }),
    [search, page],
  );
  const items = data?.items ?? [];
  return (
    <AsyncBoundary
      loading={loading}
      error={error}
      empty={!loading && items.length === 0}
      emptyMessage="No residents found."
      onRetry={reload}
    >
      <View style={styles.list}>
        {items.map((r) => (
          <View key={r.id} style={styles.card}>
            <View style={[styles.iconTile, { backgroundColor: `${theme.color.primary}1f` }]}>
              <Ionicons name="person" size={22} color={theme.color.primary} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={1}>{r.name}</Text>
              <Text style={styles.cardSub} numberOfLines={1}>
                {humanizeCode(r.residentType)}{r.phone ? ` · ${r.phone}` : ''}
              </Text>
            </View>
            <Badge label={humanizeCode(r.verificationStatus)} tone={verificationTone(r.verificationStatus)} />
          </View>
        ))}
      </View>
      {data ? (
        <Pager page={data.page} pageSize={data.pageSize} totalCount={data.totalCount} onPageChange={onPageChange} disabled={loading} />
      ) : null}
    </AsyncBoundary>
  );
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.pill,
    padding: 4,
    ...theme.shadow.soft,
  },
  segTab: { flex: 1, alignItems: 'center', paddingVertical: theme.spacing.sm, borderRadius: theme.radius.pill },
  segTabActive: { backgroundColor: theme.color.primary },
  segText: { fontSize: theme.fontSize.label, fontWeight: '700', color: theme.color.mutedText },
  segTextActive: { color: theme.color.primaryText },
  list: { gap: theme.spacing.md, marginBottom: theme.spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    ...theme.shadow.soft,
  },
  iconTile: { width: 48, height: 48, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  cardSub: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
});
