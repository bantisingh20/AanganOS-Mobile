import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '../../ui/FormScreen';
import { AppTextField } from '../../ui/AppTextField';
import { AppButton } from '../../ui/AppButton';
import { AsyncBoundary } from '../../ui/AsyncBoundary';
import { Badge } from '../../ui/Badge';
import { BottomSheet } from '../../ui/BottomSheet';
import { DateField } from '../../ui/DateField';
import { Pager } from '../../ui/Pager';
import { FormBanner } from '../../ui/FormBanner';
import { useAsync, useAsyncAction } from '../../ui/hooks';
import { useAuth } from '../../auth/AuthContext';
import { theme } from '../../ui/theme';
import { DEFAULT_PAGE_SIZE } from '../../models/query';
import { VisitorStatus } from '../../models/gate';
import type { PagedData } from '../../models/envelope';
import type { Visitor } from '../../models/gate';
import type { ResourceClients } from '../../resources';
import { gateStatusTone, humanizeCode } from '../shared/status';
import { hasSecurityRole } from '../shared/roles';
import { useMyResident } from './useMyResident';

export interface WalkInApprovalsScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

/** Status filter tabs. "pending" is the resident action queue; the rest are review/history. */
type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';
const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

/** Local day boundaries for the registered-date filter (sent to the server as ISO >= / <=). */
function startOfToday(): Date { return startOfDay(new Date()); }
function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date): Date { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function daysAgo(n: number): Date { const x = startOfToday(); x.setDate(x.getDate() - n); return x; }
function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}
function isToday(d: Date | null): boolean { return isSameDay(d, startOfToday()); }
/** True when [from,to] is exactly the last `spanDays`+1 window ending today (for preset highlight). */
function isRange(from: Date | null, to: Date | null, spanDays: number): boolean {
  return isSameDay(from, daysAgo(spanDays)) && isToday(to);
}
/** Short human label of the selected range for the card header. */
function rangeLabel(from: Date | null, to: Date | null): string {
  if (!from && !to) return 'All dates';
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
  if (from && to) return isSameDay(from, to) ? (isToday(from) ? 'Today' : fmt(from)) : `${fmt(from)} – ${fmt(to)}`;
  if (from) return `From ${fmt(from)}`;
  return `Until ${fmt(to!)}`;
}

/**
 * Walk-in visitors — ONE screen for residents AND security (Req 24.3, 24.4), scoped SERVER-SIDE by
 * who is signed in (no new endpoints, no `hostUnitId`): `Visitor` is `IUnitScoped`, so a resident is
 * restricted to their OWN unit's walk-ins while security (not resident-self-scoped) sees the WHOLE
 * community's walk-ins. So after a guard registers a walk-in they open this screen to see it and
 * whether it's been approved/rejected; a resident uses it to approve/reject their own unit's requests.
 *
 * A segmented status filter (Pending / Approved / Rejected / All) + card list with a status badge.
 * **Approve / Reject actions show for RESIDENTS only, on PENDING items** — approval is a resident
 * action the backend gates on `(Approve, Visitor)` (security can't). Security gets the same list,
 * read-only, which is exactly "where do I see my registered walk-ins and their status".
 */
export function WalkInApprovalsScreen({ resources, onBack }: WalkInApprovalsScreenProps) {
  const { roles } = useAuth();
  const isSecurity = useMemo(() => hasSecurityRole(roles), [roles]);

  // Resolve the signed-in resident ONLY when they're a resident principal (security has no resident
  // row and doesn't act on approvals). For security we skip the resident lookup entirely.
  const me = useMyResident(resources);
  const resident = isSecurity ? null : (me.data?.resident ?? null);

  // Security's view is ready immediately (no resident needed). A resident's view waits for their row
  // (so the empty-state is accurate) — but a resident with no row still sees the read-only list.
  const residentLoading = !isSecurity && me.loading;

  return (
    <FormScreen
      title={isSecurity ? 'Walk-in visitors' : 'Visitor approvals'}
      subtitle={isSecurity ? 'Status of gate walk-ins (all units)' : 'Walk-ins at your gate'}
      {...(onBack ? { onBack } : {})}
    >
      <AsyncBoundary
        loading={residentLoading}
        error={isSecurity ? null : me.error}
        empty={false}
        onRetry={me.reload}
      >
        <VisitorList
          resources={resources}
          isSecurity={isSecurity}
          residentId={resident?.id ?? null}
        />
      </AsyncBoundary>
    </FormScreen>
  );
}

function VisitorList({
  resources,
  isSecurity,
  residentId,
}: {
  resources: ResourceClients;
  isSecurity: boolean;
  /** The signed-in resident's id (null for security) — gates the approve/reject actions. */
  residentId: string | null;
}) {
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState<Visitor | null>(null);
  const [reason, setReason] = useState('');
  // Registered-date RANGE filter — DEFAULTS TO TODAY→TODAY so the screen opens on today's walk-ins.
  // Either end null = open-ended on that side; both null = all dates. Sent to the server as
  // start-of-fromDay / end-of-toDay ISO (createdAtUtc >= from, <= to) — proper server-side filtering.
  const [fromDay, setFromDay] = useState<Date | null>(startOfToday());
  const [toDay, setToDay] = useState<Date | null>(startOfToday());

  const dateFilter = {
    ...(fromDay ? { fromDate: startOfDay(fromDay).toISOString() } : {}),
    ...(toDay ? { toDate: endOfDay(toDay).toISOString() } : {}),
  };
  // Guard an inverted range (from after to) in the UI — swap-safe so the query stays sensible.
  const rangeInverted = fromDay !== null && toDay !== null && startOfDay(fromDay) > startOfDay(toDay);

  const list = useAsync<PagedData<Visitor>>(
    // NOTE: the Visitor list allows sort on status/category/name (see GateService VisitorQueryConfig)
    // — NOT createdAtUtc — so we pass no sort (default). createdAtUtc IS filterable (fromDate/toDate).
    (signal) =>
      resources.gate.listVisitors(
        { page, pageSize: DEFAULT_PAGE_SIZE },
        { ...(filter === 'all' ? {} : { status: filter }), ...(rangeInverted ? {} : dateFilter) },
        { signal },
      ),
    [page, filter, fromDay, toDay],
  );

  const approve = useAsyncAction((id: string) => {
    if (!residentId) return Promise.reject(new Error('Only a resident can approve.'));
    return resources.gate.approveWalkIn(id, residentId);
  });
  const reject = useAsyncAction((id: string, r: string) => {
    if (!residentId) return Promise.reject(new Error('Only a resident can reject.'));
    return resources.gate.rejectWalkIn(id, residentId, r || undefined);
  });

  // SECURITY admits an APPROVED walk-in at the gate → records a gate entry (visitorId), which then
  // shows on the Entry/Exit tab (On-site). No new endpoint: gate.recordEntry already accepts a
  // visitorId. Residents never admit at the gate, so this is security-only.
  const admit = useAsyncAction((visitorId: string) => resources.gate.recordEntry({ visitorId }));
  const [notice, setNotice] = useState<string | null>(null);
  // Walk-ins whose entry has already been recorded this session → hide "Record entry" so the guard
  // can't double-admit. The backend also rejects a second entry while one is open (CONFLICT), so a
  // conflict is treated the same as "already admitted".
  const [admittedIds, setAdmittedIds] = useState<Set<string>>(new Set());
  const markAdmitted = (id: string) => setAdmittedIds((prev) => new Set(prev).add(id));

  const items = list.data?.items ?? [];
  const total = list.data?.totalCount ?? 0;

  // A resident may act only on their own PENDING requests; security is read-only for approve/reject.
  const canAct = (v: Visitor) => !isSecurity && Boolean(residentId) && v.status === VisitorStatus.Pending;
  // Security admits an APPROVED + admittable walk-in → records the gate entry. Hidden once admitted
  // this session (and the backend rejects a duplicate open entry regardless).
  const canAdmit = (v: Visitor) =>
    isSecurity && v.status === VisitorStatus.Approved && v.isAdmittable && !admittedIds.has(v.id);

  const switchFilter = (f: StatusFilter) => { setPage(1); setFilter(f); };

  const submitReject = async () => {
    if (!rejecting) return;
    if (await reject.run(rejecting.id, reason.trim())) {
      setRejecting(null);
      setReason('');
      list.reload();
    }
  };

  const emptyMessage =
    filter === 'pending'
      ? (isSecurity ? 'No walk-ins are waiting for resident approval.' : 'No visitors are waiting for your approval.')
      : `No ${filter === 'all' ? '' : filter + ' '}walk-ins to show.`;

  return (
    <>
      {/* Status segmented filter */}
      <View style={styles.segment} accessibilityRole="tablist">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => switchFilter(f.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.segTab, active ? styles.segTabActive : null]}
            >
              <Text style={[styles.segText, active ? styles.segTextActive : null]} numberOfLines={1}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Registered-date RANGE filter — a soft "glass" card with From/To pickers + quick chips. */}
      <View style={styles.dateCard}>
        <View style={styles.dateCardHead}>
          <View style={styles.dateCardTitleWrap}>
            <View style={styles.dateIcon}>
              <Ionicons name="calendar-outline" size={16} color={theme.color.primary} />
            </View>
            <Text style={styles.dateCardTitle}>Filter by date</Text>
          </View>
          <Text style={styles.dateRangeHint} numberOfLines={1}>{rangeLabel(fromDay, toDay)}</Text>
        </View>

        <View style={styles.dateFields}>
          <View style={styles.flex}>
            <DateField
              label="From"
              value={fromDay}
              onChange={(d) => { setPage(1); setFromDay(d); }}
              maximumDate={new Date()}
            />
          </View>
          <View style={styles.dateArrow}><Ionicons name="arrow-forward" size={16} color={theme.color.mutedText} /></View>
          <View style={styles.flex}>
            <DateField
              label="To"
              value={toDay}
              onChange={(d) => { setPage(1); setToDay(d); }}
              {...(fromDay ? { minimumDate: fromDay } : {})}
              maximumDate={new Date()}
            />
          </View>
        </View>

        {rangeInverted ? (
          <Text style={styles.dateWarn}>From date is after To date — showing all dates until fixed.</Text>
        ) : null}

        {/* Quick presets — the soft-UI pill chips. */}
        <View style={styles.chipRow}>
          <DateChip label="Today" active={isSameDay(fromDay, toDay) && isToday(fromDay)} onPress={() => { setPage(1); setFromDay(startOfToday()); setToDay(startOfToday()); }} />
          <DateChip label="7 days" active={isRange(fromDay, toDay, 6)} onPress={() => { setPage(1); setFromDay(daysAgo(6)); setToDay(startOfToday()); }} />
          <DateChip label="30 days" active={isRange(fromDay, toDay, 29)} onPress={() => { setPage(1); setFromDay(daysAgo(29)); setToDay(startOfToday()); }} />
          <DateChip label="All" active={fromDay === null && toDay === null} onPress={() => { setPage(1); setFromDay(null); setToDay(null); }} />
        </View>
      </View>

      {approve.error ? <FormBanner message={approve.error.message} tone="error" /> : null}
      {admit.error ? <FormBanner message={admit.error.message} tone="error" /> : null}
      {notice ? <FormBanner message={notice} tone="success" /> : null}

      <AsyncBoundary
        loading={list.loading}
        error={list.error}
        empty={!list.loading && items.length === 0}
        emptyMessage={emptyMessage}
        onRetry={list.reload}
      >
        <View style={styles.list}>
          {items.map((v) => (
            <View key={v.id} style={styles.card}>
              <View style={styles.cardTop}>
                {v.photoFileId ? (
                  <PhotoThumb resources={resources} fileId={v.photoFileId} name={v.name} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: `${theme.color.primary}1f` }]}>
                    <Ionicons name="person" size={22} color={theme.color.primary} />
                  </View>
                )}
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{v.name}</Text>
                  <Text style={styles.cardSub} numberOfLines={1}>
                    {humanizeCode(v.category)}
                    {v.vehicleNumber ? ` · ${v.vehicleNumber}` : ''}
                    {v.gateLocation ? ` · ${v.gateLocation}` : ''}
                  </Text>
                  {v.whomToMeet ? (
                    <Text style={styles.cardMeta} numberOfLines={1}>To meet: {v.whomToMeet}</Text>
                  ) : null}
                </View>
                <Badge label={humanizeCode(v.status)} tone={gateStatusTone(v.status)} />
              </View>

              {canAct(v) ? (
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <AppButton
                      title="Approve"
                      loading={approve.running}
                      disabled={reject.running}
                      onPress={async () => { if (await approve.run(v.id)) list.reload(); }}
                      accessibilityHint={`Approve ${v.name}`}
                    />
                  </View>
                  <View style={styles.flex}>
                    <AppButton
                      title="Reject"
                      variant="secondary"
                      disabled={approve.running}
                      onPress={() => { reject.reset(); setReason(''); setRejecting(v); }}
                      accessibilityHint={`Reject ${v.name}`}
                    />
                  </View>
                </View>
              ) : null}

              {canAdmit(v) ? (
                <AppButton
                  title="Record entry"
                  loading={admit.running}
                  onPress={async () => {
                    setNotice(null);
                    admit.reset();
                    const ok = await admit.run(v.id);
                    if (ok) {
                      markAdmitted(v.id); // hide the button — entry recorded
                      setNotice(`${v.name} admitted — entry recorded. See the Entry / Exit tab.`);
                    } else if (admit.error && /already on-site|already an open|conflict/i.test(admit.error.message)) {
                      // Backend says an entry is already open for this visitor → treat as admitted.
                      markAdmitted(v.id);
                      setNotice(`${v.name} is already on-site. Record their exit from the Entry / Exit tab.`);
                    }
                  }}
                  accessibilityHint={`Record ${v.name}'s entry at the gate`}
                />
              ) : isSecurity && v.status === VisitorStatus.Approved && admittedIds.has(v.id) ? (
                <View style={styles.enteredChip}>
                  <Ionicons name="checkmark-circle" size={16} color={theme.color.success} />
                  <Text style={styles.enteredText}>Entry recorded</Text>
                </View>
              ) : null}
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

      <BottomSheet
        visible={rejecting !== null}
        title={rejecting ? `Reject ${rejecting.name}` : 'Reject visitor'}
        onClose={() => setRejecting(null)}
        footer={<AppButton title="Confirm reject" variant="danger" loading={reject.running} onPress={submitReject} accessibilityHint="Reject this walk-in" />}
      >
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScroll}>
          <AppTextField
            label="Reason (optional)"
            value={reason}
            onChangeText={setReason}
            placeholder="Why are you rejecting this visitor?"
            multiline
          />
          {reject.error ? <FormBanner message={reject.error.message} tone="error" /> : null}
        </ScrollView>
      </BottomSheet>

      {/* Context note so the count is meaningful at a glance. */}
      {total > 0 ? <Text style={styles.countNote}>{total} {total === 1 ? 'walk-in' : 'walk-ins'}</Text> : null}
    </>
  );
}

/** A soft-UI pill chip for the date presets (Today / 7 days / 30 days / All). */
function DateChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active ? styles.chipActive : null]}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

/** Visitor photo thumbnail via the authorized file source; falls back to a person glyph on error. */
function PhotoThumb({ resources, fileId, name }: { resources: ResourceClients; fileId: string; name: string }) {
  const source = resources.files.downloadSource(fileId);
  const [failed, setFailed] = useState(false);
  if (!source || failed) {
    return (
      <View style={[styles.avatar, { backgroundColor: `${theme.color.primary}1f` }]}>
        <Ionicons name="person" size={22} color={theme.color.primary} />
      </View>
    );
  }
  return <Image source={source} style={styles.avatar} accessibilityLabel={`${name} photo`} onError={() => setFailed(true)} />;
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
  segText: { fontSize: theme.fontSize.caption, fontWeight: '700', color: theme.color.mutedText },
  segTextActive: { color: theme.color.primaryText },

  // Date-range filter card — soft "glass/clay" surface (translucent-ish tint + hairline border + soft shadow).
  dateCard: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    ...theme.shadow.soft,
  },
  dateCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  dateCardTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateIcon: { width: 28, height: 28, borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: `${theme.color.primary}1f` },
  dateCardTitle: { fontSize: theme.fontSize.label, fontWeight: '800', color: theme.color.text },
  dateRangeHint: { fontSize: theme.fontSize.caption, fontWeight: '700', color: theme.color.primary, flexShrink: 1, textAlign: 'right' },
  dateFields: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm },
  dateArrow: { paddingBottom: 14 },
  dateWarn: { fontSize: theme.fontSize.caption, color: theme.color.warning, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: 2 },
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.background,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  chipActive: { backgroundColor: theme.color.primary, borderColor: theme.color.primary },
  chipText: { fontSize: theme.fontSize.caption, fontWeight: '700', color: theme.color.mutedText },
  chipTextActive: { color: theme.color.primaryText },
  list: { gap: theme.spacing.md, marginBottom: theme.spacing.sm },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    ...theme.shadow.soft,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  avatar: { width: 48, height: 48, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  cardSub: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
  cardMeta: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
  row: { flexDirection: 'row', gap: theme.spacing.sm },
  flex: { flex: 1 },
  enteredChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: theme.spacing.xs },
  enteredText: { color: theme.color.success, fontWeight: '700', fontSize: theme.fontSize.caption },
  sheetScroll: { gap: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.sm },
  countNote: { textAlign: 'center', color: theme.color.mutedText, fontSize: theme.fontSize.caption, paddingBottom: theme.spacing.md },
});
