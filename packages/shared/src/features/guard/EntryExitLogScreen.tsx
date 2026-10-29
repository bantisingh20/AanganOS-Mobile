import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '../../ui/FormScreen';
import { AppButton } from '../../ui/AppButton';
import { AsyncBoundary } from '../../ui/AsyncBoundary';
import { Badge } from '../../ui/Badge';
import { FormBanner } from '../../ui/FormBanner';
import { useAsyncAction } from '../../ui/hooks';
import { theme } from '../../ui/theme';
import type { PagedData } from '../../models/envelope';
import type { EntryExitEvent } from '../../models/gate';
import type { ResourceClients, GateOfflineQueue, QueuedGateCapture, RecordExitBody } from '../../resources';
import { ApiRequestError } from '../../api/errors';
import { toFormError, type FormErrorView } from '../../api/formError';
import { humanizeCode } from '../shared/status';

export interface EntryExitLogScreenProps {
  resources: ResourceClients;
  offlineQueue?: GateOfflineQueue;
  onBack?: () => void;
  onOpenDetail?: (event: EntryExitEvent) => void;
}

type Filter = 'onsite' | 'all';

const PAGE_SIZE = 10;

export function EntryExitLogScreen({ resources, offlineQueue, onBack, onOpenDetail }: EntryExitLogScreenProps) {
  const [filter, setFilter] = useState<Filter>('onsite');
  const [rows, setRows] = useState<EntryExitEvent[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<FormErrorView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [queued, setQueued] = useState<QueuedGateCapture[]>([]);

  const hasMore = rows.length < totalCount;

  const loadPage = useCallback(
    async (p: number, f: Filter) => {
      try {
        if (p === 1) { setInitialLoading(true); setError(null); }
        else setLoadingMore(true);
        const list: PagedData<EntryExitEvent> = await resources.gate.listEntryExitEvents(
          { page: p, pageSize: PAGE_SIZE, sort: '-entryTsUtc' },
          f === 'onsite' ? { open: true } : {},
        );
        setTotalCount(list.totalCount);
        setPage(p);
        setRows((prev) => (p === 1 ? list.items : [...prev, ...list.items]));
      } catch (e) {
        if (p === 1) setError(toFormError(e));
      } finally {
        setInitialLoading(false);
        setLoadingMore(false);
      }
    },
    [resources],
  );

  useEffect(() => { void loadPage(1, filter); }, [loadPage, filter]);

  const reload = useCallback(() => { void loadPage(1, filter); }, [loadPage, filter]);

  const loadMore = useCallback(() => {
    if (!loadingMore && !initialLoading && hasMore) {
      void loadPage(page + 1, filter);
    }
  }, [loadingMore, initialLoading, hasMore, page, loadPage, filter]);

  useEffect(() => {
    let active = true;
    if (!offlineQueue) return;
    (async () => {
      await offlineQueue.flush().catch(() => undefined);
      const pending = await offlineQueue.list();
      if (active) setQueued(pending);
    })();
    return () => { active = false; };
  }, [offlineQueue]);

  const exit = useAsyncAction((body: RecordExitBody) => recordExit(body));

  async function recordExit(body: RecordExitBody): Promise<unknown> {
    try {
      const event = await resources.gate.recordExit(body);
      setNotice('Exit recorded.');
      reload();
      return event;
    } catch (err) {
      if (offlineQueue && isTransient(err)) {
        await offlineQueue.enqueue('exit', body);
        setQueued(await offlineQueue.list());
        setNotice('Offline — exit saved and will sync when back online.');
        return undefined;
      }
      throw err;
    }
  }

  const flushNow = useAsyncAction(async () => {
    if (!offlineQueue) return;
    const result = await offlineQueue.flush();
    setQueued(await offlineQueue.list());
    setNotice(result.synced > 0 ? `Synced ${result.synced} buffered exit(s).` : 'Nothing new to sync.');
    reload();
  });

  const switchFilter = (f: Filter) => {
    setNotice(null);
    setRows([]);
    setFilter(f);
  };

  const renderItem = useCallback(
    ({ item: e }: { item: EntryExitEvent }) => {
      const onSite = e.exitTsUtc === null;
      const openDetail = onOpenDetail ? () => onOpenDetail(e) : undefined;
      return (
        <Pressable
          style={styles.card}
          onPress={openDetail}
          disabled={!openDetail}
          accessibilityRole={openDetail ? 'button' : undefined}
          accessibilityHint={openDetail ? `View details for ${e.visitorName}` : undefined}
        >
          <View style={styles.cardTop}>
            <PhotoThumb resources={resources} fileId={e.photoFileId} name={e.visitorName} onSite={onSite} />
            <View style={styles.cardBody}>
              <View style={styles.titleRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>{e.visitorName}</Text>
                <Badge label={onSite ? 'On-site' : 'Left'} tone={onSite ? 'warning' : 'neutral'} />
              </View>
              <View style={styles.chipRow}>
                <AuthChip kind={authKind(e)} />
                <Text style={styles.cardSub} numberOfLines={1}>{humanizeCode(e.category)}</Text>
              </View>
              {e.hostUnitNumber ? <MetaLine icon="home-outline" text={`Unit ${e.hostUnitNumber}`} /> : null}
              {e.whomToMeet ? <MetaLine icon="person-circle-outline" text={`To meet: ${e.whomToMeet}`} /> : null}
              {e.visitorPhone ? <MetaLine icon="call-outline" text={e.visitorPhone} /> : null}
              {e.vehicleNumber ? <MetaLine icon="car-outline" text={e.vehicleNumber} /> : null}
              <MetaLine
                icon={onSite ? 'time-outline' : 'swap-horizontal-outline'}
                text={onSite ? `In ${formatTime(e.entryTsUtc)} · ${sinceLabel(e.entryTsUtc)}` : `In ${formatTime(e.entryTsUtc)} · Out ${formatTime(e.exitTsUtc!)}`}
              />
            </View>
            {openDetail ? <Ionicons name="chevron-forward" size={18} color={theme.color.mutedText} /> : null}
          </View>

          {onSite ? (
            <AppButton
              title="Record exit"
              variant="secondary"
              loading={exit.running}
              onPress={() => { setNotice(null); exit.run(exitBodyFor(e)); }}
              accessibilityHint={`Record ${e.visitorName}'s exit`}
            />
          ) : null}
        </Pressable>
      );
    },
    [resources, onOpenDetail, exit],
  );

  return (
    <FormScreen
      title="Entry / exit"
      subtitle={filter === 'onsite' ? (totalCount ? `${totalCount} on-site now` : 'Who is on-site') : 'Full gate log'}
      noScroll
      {...(onBack ? { onBack } : {})}
    >
      <View style={styles.segment} accessibilityRole="tablist">
        <SegTab label="On-site" active={filter === 'onsite'} onPress={() => switchFilter('onsite')} />
        <SegTab label="All" active={filter === 'all'} onPress={() => switchFilter('all')} />
      </View>

      {notice ? <FormBanner message={notice} tone="success" /> : null}
      {exit.error ? <FormBanner message={exit.error.message} tone="error" /> : null}

      {offlineQueue && queued.length > 0 ? (
        <View style={styles.pending}>
          <FormBanner message={`${queued.length} exit(s) waiting to sync.`} tone="error" />
          <AppButton title="Sync now" variant="secondary" loading={flushNow.running} onPress={() => flushNow.run()} accessibilityHint="Try to send buffered exits now" />
        </View>
      ) : null}

      <AsyncBoundary
        loading={initialLoading && rows.length === 0}
        error={error}
        empty={!initialLoading && rows.length === 0}
        emptyMessage={filter === 'onsite' ? 'No visitors are currently on-site.' : 'No entry or exit events yet.'}
        onRetry={reload}
      >
        <FlatList
          data={rows}
          keyExtractor={(e) => e.id}
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
    </FormScreen>
  );
}

function SegTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }} style={[styles.segTab, active ? styles.segTabActive : null]}>
      <Text style={[styles.segText, active ? styles.segTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

type AuthKind = 'walk_in' | 'visit_pass' | 'recurring';

function authKind(e: EntryExitEvent): AuthKind {
  if (e.visitPassId) return 'visit_pass';
  if (e.recurringVisitorId) return 'recurring';
  return 'walk_in';
}

const AUTH_META: Record<AuthKind, { label: string; icon: keyof typeof Ionicons.glyphMap; tint: string }> = {
  walk_in: { label: 'Walk-in', icon: 'walk-outline', tint: '#bf8700' },
  visit_pass: { label: 'Visit pass', icon: 'qr-code-outline', tint: '#1a7f37' },
  recurring: { label: 'Recurring', icon: 'repeat-outline', tint: '#0969da' },
};

function AuthChip({ kind }: { kind: AuthKind }) {
  const m = AUTH_META[kind];
  return (
    <View style={[styles.authChip, { backgroundColor: `${m.tint}1f` }]}>
      <Ionicons name={m.icon} size={12} color={m.tint} />
      <Text style={[styles.authChipText, { color: m.tint }]}>{m.label}</Text>
    </View>
  );
}

function MetaLine({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.metaRow}>
      <Ionicons name={icon} size={14} color={theme.color.mutedText} />
      <Text style={styles.metaText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function PhotoThumb({ resources, fileId, name, onSite }: { resources: ResourceClients; fileId: string | null; name: string; onSite: boolean }) {
  const source = resources.files.downloadSource(fileId);
  const [failed, setFailed] = useState(false);
  if (!source || failed) {
    return (
      <View style={[styles.avatar, styles.avatarEmpty, { backgroundColor: onSite ? `${theme.color.warning}1f` : '#eef1f5' }]}>
        <Ionicons name={onSite ? 'walk' : 'person'} size={24} color={onSite ? theme.color.warning : theme.color.mutedText} />
      </View>
    );
  }
  return <Image source={source} style={styles.avatar} accessibilityLabel={`${name} photo`} onError={() => setFailed(true)} />;
}

function exitBodyFor(e: EntryExitEvent): RecordExitBody {
  return {
    ...(e.visitorId ? { visitorId: e.visitorId } : {}),
    ...(e.visitPassId ? { visitPassId: e.visitPassId } : {}),
    ...(e.recurringVisitorId ? { recurringVisitorId: e.recurringVisitorId } : {}),
    ...(e.gateId ? { gateId: e.gateId } : {}),
    ...(e.gateLabel ? { gateLabel: e.gateLabel } : {}),
  };
}

function isTransient(err: unknown): boolean {
  return err instanceof ApiRequestError ? err.httpStatus === 0 || err.code === 'INTEGRATION_FAILURE' : true;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function sinceLabel(iso: string): string {
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return '';
  const mins = Math.max(0, Math.floor((Date.now() - start) / 60000));
  if (mins < 60) return `${mins}m on-site`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m on-site` : `${h}h on-site`;
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.pill,
    padding: 4,
    marginBottom: theme.spacing.md,
    ...theme.shadow.soft,
  },
  segTab: { flex: 1, alignItems: 'center', paddingVertical: theme.spacing.sm, borderRadius: theme.radius.pill },
  segTabActive: { backgroundColor: theme.color.primary },
  segText: { fontSize: theme.fontSize.label, fontWeight: '700', color: theme.color.mutedText },
  segTextActive: { color: theme.color.primaryText },

  sep: { height: theme.spacing.md },
  listContent: { paddingBottom: theme.spacing.md },
  footer: { textAlign: 'center', color: theme.color.mutedText, paddingVertical: theme.spacing.md, fontSize: theme.fontSize.caption },

  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    ...theme.shadow.soft,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  avatar: { width: 52, height: 52, borderRadius: theme.radius.md, overflow: 'hidden' },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  cardTitle: { flex: 1, fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  cardSub: { flex: 1, fontSize: theme.fontSize.caption, color: theme.color.mutedText, fontWeight: '600' },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  authChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.radius.pill },
  authChipText: { fontSize: theme.fontSize.caption, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { flex: 1, fontSize: theme.fontSize.caption, color: theme.color.mutedText, fontWeight: '600' },
  pending: { gap: theme.spacing.sm },
});
