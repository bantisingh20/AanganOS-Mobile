import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { AppTextField } from '@/components/ui/AppTextField';
import { AppButton } from '@/components/ui/AppButton';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Select, type SelectOption } from '@/components/ui/Select';
import { MasterDataDropdown } from '@/components/ui/MasterDataDropdown';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { useAsync, useAsyncAction } from '@/hooks';
import { showSuccessAlert, showErrorAlert } from '@/utils/errorAlert';
import { toFormError, type FormErrorView } from '@/utils/formError';
import { emitToast } from '@/utils/toastBus';
import { theme } from '@/theme';
import { MasterDataKeys } from '@/types/masterData';
import type { PagedData } from '@/types/envelope';
import type { Community, HierarchyNode, Unit } from '@/types/community';
import type { ResourceClients } from '@/services/resources';
import { humanizeCode } from '@/utils/status';

export interface UnitListScreenProps {
  resources: ResourceClients;
  /** The community whose units are shown — enables add/edit (master-data + create need a community). */
  community?: Community;
  onOpenUnit?: (unit: Unit) => void;
  onBack?: () => void;
}

/** How many units to load per page (lazy-load / infinite scroll) — matches the Security list. */
const PAGE_SIZE = 10;

/** Unit status → badge tone (configurable codes, so unknown falls back to neutral). */
function unitStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'available': return 'positive';
    case 'occupied': return 'neutral';
    case 'vacant': return 'warning';
    case 'under_maintenance': return 'warning';
    case 'blocked': return 'danger';
    default: return 'neutral';
  }
}

function warn(message: string): void {
  emitToast({ tone: 'error', title: 'Check the form', message });
}

/** What the bottom sheet is doing: closed, adding a new unit, or editing an existing one. */
type SheetMode = { kind: 'closed' } | { kind: 'add' } | { kind: 'edit'; unit: Unit };

/**
 * Unit list for a community — same product-list design as the Security staff list. Units are
 * lazy-loaded 10 at a time into a {@link FlatList} that fetches the next page on scroll. Each card
 * shows a home tile, the unit number, "type · floor · N BHK", a status badge, an edit pencil and a
 * delete trash. The header "+" (and the edit pencil) open a keyboard-aware **bottom-sheet form**
 * that creates or edits a unit. Tapping the card body opens the unit detail. Add/edit need a
 * community context (for the configurable Unit_Type / Unit_Status lists); the all-units view (no
 * community) is read + open only. Scoped server-side to the caller's authorized communities.
 *
 * ponytail: the units list endpoint has no `communityId` filter param (it is tenant-scoped by the
 * token's authorized communities), so when a specific `community` is given we narrow the current
 * page client-side. Upgrade path: add a `communityId` filter to the backend list allow-list.
 */
export function UnitListScreen({ resources, community, onOpenUnit, onBack }: UnitListScreenProps) {
  const [rows, setRows] = useState<Unit[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<FormErrorView | null>(null);
  const [sheet, setSheet] = useState<SheetMode>({ kind: 'closed' });

  const canManage = Boolean(community);
  // When scoped to a community, the list is narrowed to it client-side (see class note), so "more"
  // is driven by the server's total rather than the filtered count.
  const hasMore = rows.length < totalCount;

  const loadPage = useCallback(
    async (p: number) => {
      try {
        if (p === 1) { setInitialLoading(true); setError(null); }
        else setLoadingMore(true);
        const list: PagedData<Unit> = await resources.units.list({ page: p, pageSize: PAGE_SIZE }, {});
        const pageItems = community ? list.items.filter((u) => u.communityId === community.id) : list.items;
        setTotalCount(list.totalCount);
        setPage(p);
        setRows((prev) => (p === 1 ? pageItems : [...prev, ...pageItems]));
      } catch (e) {
        if (p === 1) setError(toFormError(e));
        else showErrorAlert(e, 'Could not load more');
      } finally {
        setInitialLoading(false);
        setLoadingMore(false);
      }
    },
    [resources, community],
  );

  const reload = useCallback(() => { void loadPage(1); }, [loadPage]);
  useEffect(() => { void loadPage(1); }, [loadPage]);

  const loadMore = useCallback(() => {
    if (!loadingMore && !initialLoading && hasMore) {
      void loadPage(page + 1);
    }
  }, [loadingMore, initialLoading, hasMore, page, loadPage]);

  const act = useAsyncAction(async (fn: () => Promise<unknown>, successMsg: string) => {
    await fn();
    showSuccessAlert(successMsg);
    reload();
  });

  const confirmDelete = (unit: Unit) => {
    Alert.alert(
      'Remove unit',
      `Delete Unit ${unit.unitNumber}? It will be removed from the community.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void act.run(() => resources.units.delete(unit.id), `Unit ${unit.unitNumber} removed.`),
        },
      ],
    );
  };

  const busy = act.running;

  const renderItem = useCallback(
    ({ item: u }: { item: Unit }) => {
      const sub = [humanizeCode(u.unitType), u.floor ? `Floor ${u.floor}` : null, u.bedrooms != null ? `${u.bedrooms} BHK` : null]
        .filter(Boolean)
        .join(' · ');
      return (
        <View style={styles.card}>
          <View style={styles.iconTile}>
            <Ionicons name="home" size={22} color={theme.color.info} />
          </View>

          <Pressable
            style={styles.cardBody}
            onPress={() => (onOpenUnit ? onOpenUnit(u) : canManage ? setSheet({ kind: 'edit', unit: u }) : undefined)}
            accessibilityRole="button"
            accessibilityLabel={`Unit ${u.unitNumber}`}
            accessibilityHint={onOpenUnit ? 'View unit details' : 'Edit unit'}
          >
            <Text style={styles.cardTitle} numberOfLines={1}>Unit {u.unitNumber}</Text>
            {sub ? <Text style={styles.cardSub} numberOfLines={1}>{sub}</Text> : null}
            <View style={styles.badgeRow}>
              <Badge label={humanizeCode(u.unitStatus)} tone={unitStatusTone(u.unitStatus)} />
            </View>
          </Pressable>

          {canManage ? (
            <View style={styles.cardRight}>
              <Pressable
                onPress={() => setSheet({ kind: 'edit', unit: u })}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Edit Unit ${u.unitNumber}`}
                hitSlop={8}
                style={styles.iconBtn}
              >
                <Ionicons name="create-outline" size={20} color={theme.color.primary} />
              </Pressable>
              <Pressable
                onPress={() => confirmDelete(u)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Delete Unit ${u.unitNumber}`}
                hitSlop={8}
                style={styles.iconBtn}
              >
                <Ionicons name="trash-outline" size={20} color={theme.color.danger} />
              </Pressable>
            </View>
          ) : null}
        </View>
      );
    },
    [busy, act, onOpenUnit, canManage],
  );

  return (
    <FormScreen
      title={community ? `Units — ${community.name}` : 'Units'}
      subtitle={totalCount ? `${rows.length} shown` : 'Unit records'}
      noScroll
      {...(onBack ? { onBack } : {})}
      headerRight={
        canManage ? (
          <Pressable onPress={() => setSheet({ kind: 'add' })} accessibilityRole="button" accessibilityLabel="Add unit" hitSlop={8}>
            <Ionicons name="add" size={26} color={theme.color.primaryText} />
          </Pressable>
        ) : undefined
      }
    >
      <AsyncBoundary
        loading={initialLoading}
        error={error}
        empty={!initialLoading && rows.length === 0}
        emptyMessage={canManage ? 'No units yet. Tap + to add a unit.' : 'No units found.'}
        onRetry={reload}
      >
        <FlatList
          data={rows}
          keyExtractor={(u) => u.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <Text style={styles.footer}>Loading more…</Text>
              : hasMore ? <Text style={styles.footer}>Scroll for more</Text>
                : null
          }
          showsVerticalScrollIndicator={false}
        />
      </AsyncBoundary>

      {community ? (
        <UnitSheet
          resources={resources}
          community={community}
          mode={sheet}
          onClose={() => setSheet({ kind: 'closed' })}
          onSaved={() => { setSheet({ kind: 'closed' }); reload(); }}
        />
      ) : null}
    </FormScreen>
  );
}

/**
 * Keyboard-avoiding bottom-sheet form that CREATES a unit (number/type/status/floor/bedrooms, under
 * an optional wing) or EDITS an existing one. Same structure as the Security/Resident sheets: the
 * whole sheet lifts above the keyboard, a bounded ScrollView holds the fields, and the submit button
 * is pinned below it so it's always visible. Type/status come from the configurable master-data
 * lists scoped to the community (never hardcoded).
 */
function UnitSheet({
  resources,
  community,
  mode,
  onClose,
  onSaved,
}: {
  resources: ResourceClients;
  community: Community;
  mode: SheetMode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = mode.kind === 'edit';
  const editing = mode.kind === 'edit' ? mode.unit : null;

  // Wings/buildings for the optional location picker (the community's hierarchy).
  const wingsQuery = useAsync<HierarchyNode[]>(
    (signal) => resources.hierarchy.listForCommunity(community.id, { signal }),
    [community.id],
  );
  const wingOptions: SelectOption[] = useMemo(
    () => (wingsQuery.data ?? []).map((n) => ({ value: n.id, label: n.name })),
    [wingsQuery.data],
  );

  const [hierarchyNodeId, setHierarchyNodeId] = useState<string | null>(null);
  const [unitNumber, setUnitNumber] = useState('');
  const [unitType, setUnitType] = useState<string | null>('apartment');
  const [unitStatus, setUnitStatus] = useState<string | null>('available');
  const [floor, setFloor] = useState('');
  const [bedrooms, setBedrooms] = useState('');

  // Reset / prefill whenever the sheet opens or switches target.
  useEffect(() => {
    if (mode.kind === 'edit') {
      const u = mode.unit;
      setHierarchyNodeId(u.hierarchyNodeId);
      setUnitNumber(u.unitNumber);
      setUnitType(u.unitType);
      setUnitStatus(u.unitStatus);
      setFloor(u.floor ?? '');
      setBedrooms(u.bedrooms != null ? String(u.bedrooms) : '');
    } else if (mode.kind === 'add') {
      setHierarchyNodeId(null);
      setUnitNumber('');
      setUnitType('apartment');
      setUnitStatus('available');
      setFloor('');
      setBedrooms('');
    }
  }, [mode]);

  const bedroomsValid = !bedrooms.trim() || !Number.isNaN(Number(bedrooms.trim()));

  const save = useAsyncAction(async () => {
    const beds = bedrooms.trim() ? Number(bedrooms.trim()) : undefined;
    if (isEdit && editing) {
      await resources.units.update(editing.id, {
        hierarchyNodeId: hierarchyNodeId ?? null,
        updateHierarchyNode: true,
        unitNumber: unitNumber.trim(),
        unitType: unitType!,
        unitStatus: unitStatus!,
        floor: floor.trim() ? floor.trim() : null,
        updateFloor: true,
        bedrooms: beds ?? null,
        updateBedrooms: true,
      });
      showSuccessAlert(`Unit ${unitNumber.trim()} updated.`, 'Unit updated');
      onSaved();
      return;
    }
    const created = await resources.units.create({
      communityId: community.id,
      ...(hierarchyNodeId ? { hierarchyNodeId } : {}),
      unitNumber: unitNumber.trim(),
      unitType: unitType!,
      unitStatus: unitStatus!,
      ...(floor.trim() ? { floor: floor.trim() } : {}),
      ...(beds !== undefined && !Number.isNaN(beds) ? { bedrooms: beds } : {}),
    });
    showSuccessAlert(`Unit ${created.unitNumber} added.`, 'Unit added');
    onSaved();
  });

  const onSubmit = () => {
    if (!unitNumber.trim()) { warn('Enter a unit number (e.g. C-409).'); return; }
    if (!unitType) { warn('Choose a unit type.'); return; }
    if (!unitStatus) { warn('Choose a unit status.'); return; }
    if (!bedroomsValid) { warn('Bedrooms must be a number.'); return; }
    void save.run();
  };

  return (
    <BottomSheet
      visible={mode.kind !== 'closed'}
      title={isEdit ? 'Edit unit' : 'Add unit'}
      onClose={onClose}
      footer={
        <AppButton
          title={isEdit ? 'Save changes' : 'Add unit'}
          loading={save.running}
          onPress={onSubmit}
          accessibilityHint={isEdit ? 'Save the edits' : 'Creates the unit'}
        />
      }
    >
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScroll}>
        <Select
          label="Wing / building"
          value={hierarchyNodeId}
          options={wingOptions}
          onChange={setHierarchyNodeId}
          placeholder={wingsQuery.loading ? 'Loading…' : 'Choose a wing (optional)'}
          allowClear
          clearLabel="None"
        />
        <AppTextField label="Unit number" required value={unitNumber} onChangeText={setUnitNumber} placeholder="e.g. C-409" autoCapitalize="characters" editable={!save.running} />
        <MasterDataDropdown
          label="Unit type"
          required
          listKey={MasterDataKeys.UnitType}
          masterData={resources.masterData}
          value={unitType}
          onChange={setUnitType}
          communityId={community.id}
        />
        <MasterDataDropdown
          label="Status"
          required
          listKey={MasterDataKeys.UnitStatus}
          masterData={resources.masterData}
          value={unitStatus}
          onChange={setUnitStatus}
          communityId={community.id}
        />
        <AppTextField label="Floor" value={floor} onChangeText={setFloor} placeholder="e.g. 4" editable={!save.running} />
        <AppTextField label="Bedrooms" value={bedrooms} onChangeText={setBedrooms} placeholder="e.g. 3" keyboardType="number-pad" editable={!save.running} />
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: theme.spacing.xl, paddingTop: theme.spacing.md },
  sep: { height: theme.spacing.md },

  // Product-row card (same shape as the Security / Resident lists).
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    ...theme.shadow.soft,
  },
  iconTile: { width: 48, height: 48, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eaf2fb' },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  cardSub: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: 2 },
  cardRight: { alignItems: 'center', gap: theme.spacing.xs },
  iconBtn: { padding: 4 },
  footer: { textAlign: 'center', color: theme.color.mutedText, fontSize: theme.fontSize.caption, paddingVertical: theme.spacing.md },

  // Bottom sheet (same structure as the Security / Resident sheets).
  sheetScroll: { gap: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.sm },
});
