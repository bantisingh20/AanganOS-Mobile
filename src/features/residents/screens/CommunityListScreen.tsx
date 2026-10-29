import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { AppTextField } from '@/components/ui/AppTextField';
import { AppButton } from '@/components/ui/AppButton';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { MasterDataDropdown } from '@/components/ui/MasterDataDropdown';
import { Badge } from '@/components/ui/Badge';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { useAsync, useAsyncAction } from '@/hooks';
import { showSuccessAlert, showErrorAlert } from '@/utils/errorAlert';
import { toFormError, type FormErrorView } from '@/utils/formError';
import { emitToast } from '@/utils/toastBus';
import { theme } from '@/theme';
import { MasterDataKeys } from '@/types/masterData';
import type { MasterDataEntry } from '@/types/masterData';
import type { PagedData } from '@/types/envelope';
import type { Community } from '@/types/community';
import type { ResourceClients } from '@/services/resources';
import { humanizeCode } from '@/utils/status';

export interface CommunityListScreenProps {
  resources: ResourceClients;
  /** Open a community to manage it (edit / wings / units). */
  onOpenCommunity?: (community: Community) => void;
  /** When true, show the "+" that opens the create bottom sheet (super-admin surface). */
  canCreate?: boolean;
  /** Optional back affordance for the home navigator. */
  onBack?: () => void;
}

/** How many communities to load per page (lazy-load / infinite scroll). */
const PAGE_SIZE = 10;

/** A per-community-type icon so the cards read at a glance (configurable code → sensible default). */
function typeIcon(code: string): keyof typeof Ionicons.glyphMap {
  switch (code) {
    case 'apartment_society': return 'business';
    case 'gated_community': return 'shield-checkmark';
    case 'villa_bungalow': return 'home';
    case 'townhouse': return 'grid';
    case 'mixed': return 'layers';
    default: return 'business';
  }
}

/**
 * Community list — a modern, card-based admin surface (Req 12.4). A clean search bar + a horizontal
 * row of type filter chips (resolved from the configurable `Community_Type` list) sit above a
 * lazy-loaded list of community cards. The header "+" opens a bottom sheet to create a new community.
 * Scoped server-side to the caller's authorized communities.
 */
export function CommunityListScreen({ resources, onOpenCommunity, canCreate = false, onBack }: CommunityListScreenProps) {
  const [search, setSearch] = useState('');
  const [communityType, setCommunityType] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [rows, setRows] = useState<Community[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<FormErrorView | null>(null);

  const hasMore = rows.length < totalCount;

  // Type filter chips come from the configurable Community_Type list (never hardcoded).
  const types = useAsync<MasterDataEntry[]>(
    (signal) => resources.masterData.list(MasterDataKeys.CommunityType, { signal }),
    [],
  );

  const loadPage = useCallback(
    async (p: number) => {
      try {
        if (p === 1) { setInitialLoading(true); setError(null); }
        else setLoadingMore(true);
        const list: PagedData<Community> = await resources.communities.list(
          { search: search.trim() || undefined, page: p, pageSize: PAGE_SIZE },
          communityType ? { communityType } : {},
        );
        setTotalCount(list.totalCount);
        setPage(p);
        setRows((prev) => (p === 1 ? list.items : [...prev, ...list.items]));
      } catch (e) {
        if (p === 1) setError(toFormError(e));
        else showErrorAlert(e, 'Could not load more');
      } finally {
        setInitialLoading(false);
        setLoadingMore(false);
      }
    },
    [resources, search, communityType],
  );

  // Reload on search / filter change (debounced lightly by the user's typing cadence is fine here).
  const reload = useCallback(() => { void loadPage(1); }, [loadPage]);
  useEffect(() => { void loadPage(1); }, [loadPage]);

  const loadMore = useCallback(() => {
    if (!loadingMore && !initialLoading && hasMore) {
      void loadPage(page + 1);
    }
  }, [loadingMore, initialLoading, hasMore, page, loadPage]);

  // A new community must be created under an organization; derive it from any loaded community
  // (the MVP has one org and no organizations endpoint). Null when the list is empty.
  const organizationId = rows[0]?.organizationId ?? null;

  const renderItem = useCallback(
    ({ item: c }: { item: Community }) => (
      <Pressable
        style={styles.card}
        onPress={() => onOpenCommunity?.(c)}
        accessibilityRole="button"
        accessibilityLabel={c.name}
        accessibilityHint="Manage this community"
      >
        <View style={styles.iconTile}>
          <Ionicons name={typeIcon(c.communityType)} size={22} color={theme.color.primary} />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>{c.name}</Text>
          <Text style={styles.cardSub} numberOfLines={1}>{humanizeCode(c.communityType)}</Text>
          {c.isArchived ? (
            <View style={styles.badgeRow}><Badge label="Archived" tone="neutral" /></View>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.color.mutedText} />
      </Pressable>
    ),
    [onOpenCommunity],
  );

  const typeChips = types.data ?? [];

  return (
    <FormScreen
      title="Communities"
      subtitle={totalCount ? `${totalCount} ${totalCount === 1 ? 'society' : 'societies'}` : 'Societies you manage'}
      noScroll
      {...(onBack ? { onBack } : {})}
      headerRight={
        canCreate ? (
          <Pressable onPress={() => setCreating(true)} accessibilityRole="button" accessibilityLabel="New community" hitSlop={8}>
            <Ionicons name="add" size={26} color={theme.color.primaryText} />
          </Pressable>
        ) : undefined
      }
    >
      {/* Modern search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={theme.color.mutedText} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search communities"
          placeholderTextColor={theme.color.mutedText}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Search communities"
        />
        {search.length > 0 ? (
          <Pressable onPress={() => setSearch('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.color.mutedText} />
          </Pressable>
        ) : null}
      </View>

      {/* Type filter chips (horizontal). "All" + one per configurable type. */}
      {typeChips.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          keyboardShouldPersistTaps="handled"
        >
          <FilterChip label="All" active={communityType === null} onPress={() => setCommunityType(null)} />
          {typeChips.map((t) => (
            <FilterChip
              key={t.code}
              label={t.label || humanizeCode(t.code)}
              active={communityType === t.code}
              onPress={() => setCommunityType(communityType === t.code ? null : t.code)}
            />
          ))}
        </ScrollView>
      ) : null}

      <AsyncBoundary
        loading={initialLoading}
        error={error}
        empty={!initialLoading && rows.length === 0}
        emptyMessage={search.trim() || communityType ? 'No communities match your filters.' : 'No communities yet.'}
        onRetry={reload}
      >
        <FlatList
          data={rows}
          keyExtractor={(c) => c.id}
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

      <CreateCommunitySheet
        resources={resources}
        organizationId={organizationId}
        visible={creating}
        onClose={() => setCreating(false)}
        onSaved={() => { setCreating(false); reload(); }}
      />
    </FormScreen>
  );
}

/** One pill in the horizontal type-filter row. */
function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={[styles.chip, active ? styles.chipActive : null]}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/**
 * Keyboard-avoiding bottom-sheet form to create a community — name + configurable type under the
 * current organization (Req 12.1). Same sheet pattern as the other admin screens; only two fields,
 * so a full page would be overkill. The org id is derived from the list (the MVP has a single org
 * and no organizations endpoint); when none is available the sheet explains it instead of failing.
 */
function CreateCommunitySheet({
  resources,
  organizationId,
  visible,
  onClose,
  onSaved,
}: {
  resources: ResourceClients;
  organizationId: string | null;
  visible: boolean;
  onClose: () => void;
  onSaved: (created: Community) => void;
}) {
  const [name, setName] = useState('');
  const [communityType, setCommunityType] = useState<string | null>(null);

  useEffect(() => {
    if (visible) { setName(''); setCommunityType(null); }
  }, [visible]);

  const save = useAsyncAction(async () => {
    const created = await resources.communities.create({
      organizationId: organizationId!,
      name: name.trim(),
      communityType: communityType!,
    });
    showSuccessAlert('Community created.');
    onSaved(created);
  });

  const onSubmit = () => {
    if (!name.trim()) { emitToast({ tone: 'error', title: 'Check the form', message: 'Enter a community name.' }); return; }
    if (!communityType) { emitToast({ tone: 'error', title: 'Check the form', message: 'Choose a community type.' }); return; }
    if (!organizationId) { emitToast({ tone: 'error', title: 'Cannot create', message: 'No organization available to create under.' }); return; }
    void save.run();
  };

  return (
    <BottomSheet
      visible={visible}
      title="New community"
      onClose={onClose}
      footer={<AppButton title="Create community" loading={save.running} onPress={onSubmit} accessibilityHint="Creates the community" />}
    >
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScroll}>
        {!organizationId ? (
          <Text style={styles.note}>No organization is available to create a community under. Add one first.</Text>
        ) : null}
        <AppTextField
          label="Name"
          required
          value={name}
          onChangeText={setName}
          placeholder="e.g. Shree Krishna Residency"
          editable={!save.running}
          {...(save.error?.fieldErrors?.name ? { error: save.error.fieldErrors.name } : {})}
        />
        <MasterDataDropdown
          label="Community type"
          required
          listKey={MasterDataKeys.CommunityType}
          masterData={resources.masterData}
          value={communityType}
          onChange={setCommunityType}
          placeholder="Choose a type"
        />
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // Search bar.
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.lg,
    minHeight: theme.minTouchTarget,
    ...theme.shadow.soft,
  },
  searchInput: { flex: 1, fontSize: theme.fontSize.body, color: theme.color.text, paddingVertical: theme.spacing.sm },

  // Filter chips.
  chipRow: { gap: theme.spacing.sm, paddingVertical: theme.spacing.md, paddingRight: theme.spacing.sm },
  chip: {
    paddingHorizontal: theme.spacing.lg,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  chipActive: { backgroundColor: theme.color.primary, borderColor: theme.color.primary },
  chipText: { fontSize: theme.fontSize.label, fontWeight: '700', color: theme.color.mutedText },
  chipTextActive: { color: theme.color.primaryText },

  // List + cards.
  listContent: { paddingBottom: theme.spacing.xl },
  sep: { height: theme.spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    ...theme.shadow.soft,
  },
  iconTile: { width: 48, height: 48, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.accentSoft },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  cardSub: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: 2 },
  footer: { textAlign: 'center', color: theme.color.mutedText, fontSize: theme.fontSize.caption, paddingVertical: theme.spacing.md },

  // Bottom sheet (same structure as the other admin sheets).
  sheetScroll: { gap: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.sm },
  note: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, lineHeight: 18 },
});
