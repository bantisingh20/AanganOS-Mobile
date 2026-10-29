import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { AppTextField } from '@/components/ui/AppTextField';
import { AppButton } from '@/components/ui/AppButton';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { Badge } from '@/components/ui/Badge';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Pager } from '@/components/ui/Pager';
import { Select, type SelectOption } from '@/components/ui/Select';
import { MasterDataDropdown } from '@/components/ui/MasterDataDropdown';
import { useAsync, useAsyncAction } from '@/hooks';
import { emitToast } from '@/utils/toastBus';
import { theme } from '@/theme';
import { DEFAULT_PAGE_SIZE } from '@/types/query';
import { GateMasterDataKeys, WatchlistStatus } from '@/types/gate';
import type { PagedData } from '@/types/envelope';
import type { WatchlistEntry } from '@/types/gate';
import type { Community } from '@/types/community';
import type { ResourceClients } from '@/services/resources';
import { watchlistTone, humanizeCode } from '@/utils/status';

export interface WatchlistScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

/**
 * Guard watchlist (Req 26.1, 26.3, 26.5) — redesigned to the shared card + bottom-sheet pattern. The
 * community's active flagged subjects (View-gated) render as **product-row cards** (alert tile +
 * identifier + "type · reason" + severity badge + a Clear action); the header **"+"** opens a
 * **keyboard-aware bottom sheet** to add an entry. A flagged subject is what the gate matches at
 * entry; admitting one then needs an Approve override (enforced server-side). Subject type/severity
 * options come from master-data (`Watchlist_Subject_Type`, `Watchlist_Severity`), never hardcoded.
 */
export function WatchlistScreen({ resources, onBack }: WatchlistScreenProps) {
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);

  const list = useAsync<PagedData<WatchlistEntry>>(
    (signal) =>
      resources.securityOps.listWatchlist(
        { page, pageSize: DEFAULT_PAGE_SIZE },
        { status: WatchlistStatus.Active },
        { signal },
      ),
    [page],
  );

  const clear = useAsyncAction((id: string) => resources.securityOps.clearWatchlistEntry(id));

  const items = list.data?.items ?? [];
  const total = list.data?.totalCount ?? 0;

  return (
    <FormScreen
      title="Watchlist"
      subtitle={total ? `${total} active ${total === 1 ? 'flag' : 'flags'}` : 'Flagged people & vehicles'}
      {...(onBack ? { onBack } : {})}
      headerRight={
        <Pressable onPress={() => setAdding(true)} accessibilityRole="button" accessibilityLabel="Add watchlist entry" hitSlop={8}>
          <Ionicons name="add" size={26} color={theme.color.primaryText} />
        </Pressable>
      }
    >
      <AsyncBoundary
        loading={list.loading}
        error={list.error}
        empty={!list.loading && items.length === 0}
        emptyMessage="No active watchlist entries. Tap + to flag a person or vehicle."
        onRetry={list.reload}
      >
        <View style={styles.list}>
          {items.map((e) => (
            <View key={e.id} style={styles.card}>
              <View style={[styles.iconTile, { backgroundColor: `${theme.color.danger}1f` }]}>
                <Ionicons name="alert-circle" size={22} color={theme.color.danger} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={1}>{e.subjectIdentifier}</Text>
                <Text style={styles.cardSub} numberOfLines={2}>
                  {humanizeCode(e.subjectType)} · {e.reason}
                </Text>
              </View>
              <View style={styles.cardRight}>
                <Badge label={humanizeCode(e.severity)} tone={watchlistTone(e.status)} />
                <Pressable
                  onPress={async () => {
                    if (await clear.run(e.id)) list.reload();
                  }}
                  disabled={clear.running}
                  accessibilityRole="button"
                  accessibilityLabel={`Clear the flag for ${e.subjectIdentifier}`}
                  hitSlop={8}
                  style={styles.clearBtn}
                >
                  <Ionicons name="checkmark-done" size={18} color={theme.color.success} />
                  <Text style={styles.clearText}>Clear</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
        {list.data ? (
          <Pager
            page={list.data.page}
            pageSize={list.data.pageSize}
            totalCount={list.data.totalCount}
            onPageChange={setPage}
            disabled={list.loading}
          />
        ) : null}
      </AsyncBoundary>

      <AddWatchlistSheet
        visible={adding}
        resources={resources}
        onClose={() => setAdding(false)}
        onAdded={() => {
          setAdding(false);
          setPage(1);
          list.reload();
        }}
      />
    </FormScreen>
  );
}

/**
 * Keyboard-aware bottom-sheet to add a watchlist entry: community (when the guard spans several),
 * subject type, identifier, severity, reason. Mirrors the admin sheet pattern — lift the whole sheet
 * by the keyboard height, bounded inner ScrollView, pinned submit button.
 */
function AddWatchlistSheet({
  visible,
  resources,
  onClose,
  onAdded,
}: {
  visible: boolean;
  resources: ResourceClients;
  onClose: () => void;
  onAdded: () => void;
}) {
  const communities = useAsync<PagedData<Community>>(
    (signal) => resources.communities.list({ pageSize: 100 }, {}, { signal }),
    [],
  );
  const options: SelectOption[] = (communities.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }));
  const sole = options.length === 1 ? options[0]!.value : null;

  const [communityId, setCommunityId] = useState<string | null>(null);
  const [subjectType, setSubjectType] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [reason, setReason] = useState('');

  // Reset whenever the sheet opens.
  useEffect(() => {
    if (visible) {
      setCommunityId(null); setSubjectType(null); setSeverity(null); setIdentifier(''); setReason('');
    }
  }, [visible]);

  const effectiveCommunityId = communityId ?? sole;

  const add = useAsyncAction(() => {
    if (!effectiveCommunityId || !subjectType || !severity) {
      return Promise.reject(new Error('Missing fields'));
    }
    return resources.securityOps.addWatchlistEntry({
      communityId: effectiveCommunityId,
      subjectType,
      severity,
      subjectIdentifier: identifier.trim(),
      reason: reason.trim(),
    });
  });

  const canSubmit =
    Boolean(effectiveCommunityId) && Boolean(subjectType) && Boolean(severity) &&
    identifier.trim().length > 0 && reason.trim().length > 0;

  const onSubmit = () => {
    if (!canSubmit) {
      emitToast({ tone: 'error', title: 'Check the form', message: 'Fill community, type, identifier, severity and reason.' });
      return;
    }
    void add.run().then((ok) => { if (ok) onAdded(); });
  };

  return (
    <BottomSheet
      visible={visible}
      title="Add to watchlist"
      onClose={onClose}
      footer={
        <AppButton
          title="Add to watchlist"
          loading={add.running}
          disabled={!canSubmit}
          onPress={onSubmit}
          accessibilityHint="Flag this subject at the gate"
        />
      }
    >
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScroll}>
        {options.length > 1 ? (
          <Select label="Community" required value={effectiveCommunityId} options={options} onChange={setCommunityId} placeholder="Choose a community" />
        ) : null}
        <MasterDataDropdown
          label="Subject type"
          listKey={GateMasterDataKeys.WatchlistSubjectType}
          masterData={resources.masterData}
          value={subjectType}
          onChange={setSubjectType}
          placeholder="Person or vehicle"
          {...(effectiveCommunityId ? { communityId: effectiveCommunityId } : {})}
        />
        <AppTextField
          label="Subject identifier"
          required
          value={identifier}
          onChangeText={setIdentifier}
          placeholder="Name / phone / vehicle number"
          autoCapitalize="characters"
          editable={!add.running}
          {...(add.error?.fieldErrors.subjectIdentifier ? { error: add.error.fieldErrors.subjectIdentifier } : {})}
        />
        <MasterDataDropdown
          label="Severity"
          listKey={GateMasterDataKeys.WatchlistSeverity}
          masterData={resources.masterData}
          value={severity}
          onChange={setSeverity}
          placeholder="Select severity"
          {...(effectiveCommunityId ? { communityId: effectiveCommunityId } : {})}
        />
        <AppTextField
          label="Reason"
          required
          value={reason}
          onChangeText={setReason}
          placeholder="Why is this subject watchlisted?"
          editable={!add.running}
          {...(add.error?.fieldErrors.reason ? { error: add.error.fieldErrors.reason } : {})}
        />
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
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
  cardRight: { alignItems: 'flex-end', gap: theme.spacing.xs },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  clearText: { color: theme.color.success, fontWeight: '700', fontSize: theme.fontSize.caption },

  sheetScroll: { gap: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.sm },
});
