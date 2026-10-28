import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '../../ui/FormScreen';
import { SectionHeading } from '../../ui/SectionHeading';
import { AppTextField } from '../../ui/AppTextField';
import { AppButton } from '../../ui/AppButton';
import { AsyncBoundary } from '../../ui/AsyncBoundary';
import { Badge } from '../../ui/Badge';
import { FormBanner } from '../../ui/FormBanner';
import { Select } from '../../ui/Select';
import { Toggle } from '../../ui/Toggle';
import { MasterDataDropdown } from '../../ui/MasterDataDropdown';
import { DateField } from '../../ui/DateField';
import { PhoneField } from '../../ui/PhoneField';
import { PhotoPicker } from '../../ui/PhotoPicker';
import { emitToast } from '../../ui/toastBus';
import { useAsyncAction } from '../../ui/hooks';
import { theme } from '../../ui/theme';
import { toFormError, type FormErrorView } from '../../api/formError';
import type { PagedData } from '../../models/envelope';
import type { RecurringVisitor } from '../../models/gate';
import { GateMasterDataKeys } from '../../models/gate';
import type { Resident, ResidentHouseholdUnit } from '../../models/resident';
import type { ResourceClients } from '../../resources';
import { humanizeCode } from '../shared/status';
import { useMyResident } from './useMyResident';

export interface RecurringVisitorsScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

type Tab = 'active' | 'expired';
const TABS: { key: Tab; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'expired', label: 'Expired' },
];

const PAGE_SIZE = 10;

const DAYS: readonly { label: string; bit: number }[] = [
  { label: 'Sun', bit: 1 },
  { label: 'Mon', bit: 2 },
  { label: 'Tue', bit: 4 },
  { label: 'Wed', bit: 8 },
  { label: 'Thu', bit: 16 },
  { label: 'Fri', bit: 32 },
  { label: 'Sat', bit: 64 },
];

export function RecurringVisitorsScreen({ resources, onBack }: RecurringVisitorsScreenProps) {
  const me = useMyResident(resources);
  const resident = me.data?.resident ?? null;
  const units = me.data?.units ?? [];

  const [tab, setTab] = useState<Tab>('active');
  const [rows, setRows] = useState<RecurringVisitor[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<FormErrorView | null>(null);
  const [adding, setAdding] = useState(false);
  const [expiringSoonDays, setExpiringSoonDays] = useState(10);
  const [extendTarget, setExtendTarget] = useState<RecurringVisitor | null>(null);

  const hasMore = rows.length < totalCount;

  useEffect(() => {
    let live = true;
    resources.onboarding
      .getConfig()
      .then((cfg) => { if (live) setExpiringSoonDays(cfg.recurringExpiringSoonDays); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [resources.onboarding]);

  const loadPage = useCallback(
    async (p: number, wantActive: boolean) => {
      try {
        if (p === 1) { setInitialLoading(true); setError(null); }
        else setLoadingMore(true);
        const list: PagedData<RecurringVisitor> = await resources.gate.listRecurringVisitors(
          { page: p, pageSize: PAGE_SIZE, sort: 'name:asc' },
          { active: wantActive },
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

  useEffect(() => { void loadPage(1, tab === 'active'); }, [loadPage, tab]);

  const reload = useCallback(() => { void loadPage(1, tab === 'active'); }, [loadPage, tab]);

  const loadMore = useCallback(() => {
    if (!loadingMore && !initialLoading && hasMore) {
      void loadPage(page + 1, tab === 'active');
    }
  }, [loadingMore, initialLoading, hasMore, page, loadPage, tab]);

  const revoke = useAsyncAction((id: string) => resources.gate.revokeRecurringVisitor(id));

  const renderItem = useCallback(
    ({ item: r }: { item: RecurringVisitor }) => {
      const active = tab === 'active';
      const badgeLabel = r.status === 'revoked' ? 'Revoked' : active ? humanizeCode(r.status) : 'Expired';
      const expiringSoon = active && isExpiringSoon(r.endDate, expiringSoonDays);
      const showExtend = !active || expiringSoon;
      return (
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <PhotoThumb resources={resources} fileId={r.photoFileId} name={r.name} />
            <View style={styles.cardBody}>
              <View style={styles.titleRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>{r.name}</Text>
                <Badge label={badgeLabel} tone={active ? 'positive' : r.status === 'revoked' ? 'danger' : 'neutral'} />
              </View>
              <Text style={styles.cardSub} numberOfLines={1}>{humanizeCode(r.category)}</Text>
              {r.phone ? <MetaLine icon="call-outline" text={r.phone} /> : null}
              <MetaLine icon="repeat-outline" text={describeDays(r.daysOfWeek)} />
            </View>
          </View>

          <View style={styles.detailGrid}>
            <DetailCell label="Valid from" value={formatDate(r.startDate)} />
            <DetailCell label="Expires on" value={formatDate(r.endDate)} align="right" />
          </View>

          {expiringSoon ? (
            <View style={styles.soonNote}>
              <Ionicons name="alert-circle-outline" size={14} color={theme.color.warning} />
              <Text style={styles.soonText}>Expiring soon — extend to keep it active.</Text>
            </View>
          ) : null}

          <View style={styles.actionRow}>
            {showExtend ? (
              <View style={styles.flex}>
                <AppButton
                  title="Extend validity"
                  variant="secondary"
                  onPress={() => setExtendTarget(r)}
                  accessibilityHint={`Extend the validity for ${r.name}`}
                />
              </View>
            ) : null}
            {active ? (
              <View style={styles.flex}>
                <AppButton
                  title="Revoke"
                  variant="secondary"
                  loading={revoke.running}
                  onPress={async () => {
                    if (await revoke.run(r.id)) {
                      reload();
                    }
                  }}
                  accessibilityHint={`Revoke the recurring authorization for ${r.name}`}
                />
              </View>
            ) : null}
          </View>
        </View>
      );
    },
    [tab, resources, revoke, reload, expiringSoonDays],
  );

  const headerRight = (
    <Pressable
      onPress={() => setAdding(true)}
      disabled={!resident || units.length === 0}
      accessibilityRole="button"
      accessibilityLabel="Add a recurring visitor"
      hitSlop={8}
    >
      <Text style={styles.headerAdd}>+ Add</Text>
    </Pressable>
  );

  return (
    <FormScreen title="Recurring visitors" subtitle="Daily help, cabs & regular visitors" noScroll {...(onBack ? { onBack } : {})} headerRight={headerRight}>
      {revoke.error ? <FormBanner message={revoke.error.message} tone="error" /> : null}

      <View style={styles.segment} accessibilityRole="tablist">
        {TABS.map((tDef) => {
          const selected = tab === tDef.key;
          return (
            <Pressable
              key={tDef.key}
              onPress={() => setTab(tDef.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.segTab, selected ? styles.segTabActive : null]}
            >
              <Text style={[styles.segText, selected ? styles.segTextActive : null]}>{tDef.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <AsyncBoundary
        loading={(initialLoading && rows.length === 0) || me.loading}
        error={error ?? me.error}
        empty={!initialLoading && rows.length === 0}
        emptyMessage={tab === 'active' ? 'No active recurring visitors.' : 'No expired recurring visitors.'}
        onRetry={() => { reload(); me.reload(); }}
      >
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
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

      {resident ? (
        <AddRecurringModal
          visible={adding}
          resources={resources}
          resident={resident}
          units={units}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            setTab('active');
            reload();
          }}
        />
      ) : null}

      <ExtendRecurringModal
        resources={resources}
        target={extendTarget}
        onClose={() => setExtendTarget(null)}
        onExtended={() => {
          setExtendTarget(null);
          setTab('active');
          reload();
        }}
      />
    </FormScreen>
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

function DetailCell({ label, value, align = 'left' }: { label: string; value: string; align?: 'left' | 'right' }) {
  return (
    <View style={[styles.detailCell, align === 'right' ? styles.detailCellRight : null]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function PhotoThumb({ resources, fileId, name }: { resources: ResourceClients; fileId: string | null; name: string }) {
  const source = resources.files.downloadSource(fileId);
  const [failed, setFailed] = useState(false);
  if (!source || failed) {
    return (
      <View style={[styles.avatar, styles.avatarEmpty]}>
        <Ionicons name="person" size={24} color={theme.color.primary} />
      </View>
    );
  }
  return <Image source={source} style={styles.avatar} accessibilityLabel={`${name} photo`} onError={() => setFailed(true)} />;
}

function AddRecurringModal({
  visible,
  resources,
  resident,
  units,
  onClose,
  onAdded,
}: {
  visible: boolean;
  resources: ResourceClients;
  resident: Resident;
  units: ResidentHouseholdUnit[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [unitId, setUnitId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [dayMask, setDayMask] = useState(0);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [photoFileId, setPhotoFileId] = useState<string | null>(null);

  const add = useAsyncAction(() => {
    if (!unitId || !category || !startDate || !endDate) {
      return Promise.reject(new Error('Missing fields'));
    }
    return resources.gate.createRecurringVisitor({
      hostUnitId: unitId,
      hostResidentId: resident.id,
      name: name.trim(),
      category,
      daysOfWeek: dayMask,
      startDate,
      endDate,
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(photoFileId ? { photoFileId } : {}),
    });
  });

  useEffect(() => {
    if (visible) {
      setUnitId(units.length === 1 && units[0] ? units[0].unitId : null);
      setName('');
      setPhone('');
      setCategory(null);
      setDayMask(0);
      setStartDate(null);
      setEndDate(null);
      setPhotoFileId(null);
      add.reset();
    }
  }, [visible]);

  const selectedUnit = units.find((u) => u.unitId === unitId) ?? null;
  const communityId = selectedUnit?.communityId ?? resident.communityId ?? '';

  const submit = async () => {
    if (!unitId) { warn('Select the host unit.'); return; }
    if (!name.trim()) { warn('Enter the visitor\u2019s name.'); return; }
    if (!category) { warn('Select a visitor category.'); return; }
    if (dayMask <= 0) { warn('Pick at least one day of the week.'); return; }
    if (!startDate) { warn('Choose the start date.'); return; }
    if (!endDate) { warn('Choose the end date.'); return; }
    if (await add.run()) {
      onAdded();
    }
  };

  const unitOptions = units.map((u) => ({ value: u.unitId, label: `Unit ${u.unitNumber}` }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdropPress} accessibilityLabel="Close" onPress={onClose} />
        <View style={styles.sheet} accessibilityViewIsModal>
          <ScrollView
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <SectionHeading title="Add recurring visitor" />

            <PhotoPicker
              label="Photo"
              layout="vertical"
              files={resources.files}
              upload={{ owningResourceType: 'RecurringVisitor', communityId }}
              value={photoFileId}
              onChange={setPhotoFileId}
              disabled={add.running}
            />

            {unitOptions.length > 1 ? (
              <Select label="Host unit" value={unitId} options={unitOptions} onChange={setUnitId} placeholder="Select your unit" />
            ) : null}

            <AppTextField
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Recurring visitor's name"
              autoCapitalize="words"
              {...(add.error?.fieldErrors.name ? { error: add.error.fieldErrors.name } : {})}
            />
            <PhoneField
              label="Contact number"
              value={phone}
              onChangeText={setPhone}
              placeholder="98765 43210"
              editable={!add.running}
            />
            <MasterDataDropdown
              label="Category"
              listKey={GateMasterDataKeys.VisitorCategory}
              masterData={resources.masterData}
              value={category}
              onChange={setCategory}
              placeholder="Select a visitor category"
            />

            <SectionHeading title="Days" />
            <View style={styles.days}>
              {DAYS.map((d) => (
                <Toggle
                  key={d.bit}
                  label={d.label}
                  value={(dayMask & d.bit) !== 0}
                  onValueChange={(on) => setDayMask((m) => (on ? m | d.bit : m & ~d.bit))}
                  testID={`day-${d.label}`}
                />
              ))}
            </View>

            <DateField
              label="Start date"
              required
              value={startDate}
              onChange={(d) => setStartDate(d ? isoDateOnly(d) : null)}
              disabled={add.running}
            />
            <DateField
              label="End date"
              required
              value={endDate}
              onChange={(d) => setEndDate(d ? isoDateOnly(d) : null)}
              {...(startDate ? { minimumDate: startDate } : {})}
              disabled={add.running}
            />

            {add.error && !hasFieldError(add.error.fieldErrors) ? (
              <FormBanner message={add.error.message} tone="error" />
            ) : null}

            <View style={styles.row}>
              <View style={styles.flex}>
                <AppButton title="Cancel" variant="secondary" disabled={add.running} onPress={onClose} />
              </View>
              <View style={styles.flex}>
                <AppButton title="Add" loading={add.running} onPress={submit} />
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ExtendRecurringModal({
  resources,
  target,
  onClose,
  onExtended,
}: {
  resources: ResourceClients;
  target: RecurringVisitor | null;
  onClose: () => void;
  onExtended: () => void;
}) {
  const [endDate, setEndDate] = useState<string | null>(null);
  const extend = useAsyncAction((iso: string) => resources.gate.extendRecurringVisitor(target!.id, iso));

  useEffect(() => {
    if (target) {
      setEndDate(null);
      extend.reset();
    }
  }, [target]);

  const submit = async () => {
    if (!endDate) { warn('Choose the new end date.'); return; }
    if (await extend.run(endDate)) {
      onExtended();
    }
  };

  const minIso = target ? isoDateOnly(maxDate(new Date(), new Date(target.startDate))) : undefined;

  return (
    <Modal visible={Boolean(target)} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdropPress} accessibilityLabel="Close" onPress={onClose} />
        <View style={styles.sheet} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <SectionHeading title="Extend validity" />
            {target ? (
              <Text style={styles.cardSub}>
                {target.name} · currently expires {formatDate(target.endDate)}
              </Text>
            ) : null}

            <DateField
              label="New end date"
              required
              value={endDate}
              onChange={(d) => setEndDate(d ? isoDateOnly(d) : null)}
              {...(minIso ? { minimumDate: minIso } : {})}
              disabled={extend.running}
            />

            {extend.error ? <FormBanner message={extend.error.message} tone="error" /> : null}

            <View style={styles.row}>
              <View style={styles.flex}>
                <AppButton title="Cancel" variant="secondary" disabled={extend.running} onPress={onClose} />
              </View>
              <View style={styles.flex}>
                <AppButton title="Extend" loading={extend.running} onPress={submit} />
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function warn(message: string): void {
  emitToast({ tone: 'error', title: 'Check the form', message });
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function isExpiringSoon(endIso: string, withinDays: number): boolean {
  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + withinDays);
  return end >= today && end <= limit;
}

function describeDays(mask: number): string {
  const names = DAYS.filter((d) => (mask & d.bit) !== 0).map((d) => d.label);
  return names.length ? names.join(', ') : 'No days';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isoDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}T00:00:00Z`;
}

function hasFieldError(map: Readonly<Record<string, string>>): boolean {
  return ['name', 'startDate', 'endDate'].some((k) => Boolean(map[k]));
}

const styles = StyleSheet.create({
  headerAdd: { color: theme.color.primaryText, fontSize: theme.fontSize.label, fontWeight: '800' },

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
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    ...theme.shadow.soft,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  avatar: { width: 56, height: 56, borderRadius: theme.radius.md, overflow: 'hidden' },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: `${theme.color.primary}1f` },
  cardBody: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  cardTitle: { flex: 1, fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  cardSub: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { flex: 1, fontSize: theme.fontSize.caption, color: theme.color.mutedText, fontWeight: '600' },

  detailGrid: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
  },
  detailCell: { flex: 1, gap: 2 },
  detailCellRight: { alignItems: 'flex-end' },
  detailLabel: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  detailValue: { fontSize: theme.fontSize.label, color: theme.color.text, fontWeight: '700' },

  row: { flexDirection: 'row', gap: theme.spacing.sm },
  actionRow: { flexDirection: 'row', gap: theme.spacing.sm },
  flex: { flex: 1 },
  days: { gap: theme.spacing.xs },
  soonNote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  soonText: { flex: 1, fontSize: theme.fontSize.caption, color: theme.color.warning, fontWeight: '700' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: theme.spacing.lg },
  backdropPress: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: theme.color.background,
    borderRadius: theme.radius.md,
    maxHeight: '90%',
  },
  sheetContent: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
});
