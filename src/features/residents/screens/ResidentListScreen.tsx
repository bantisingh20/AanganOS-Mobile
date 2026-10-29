import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { AppTextField } from '@/components/ui/AppTextField';
import { PhoneField } from '@/components/ui/PhoneField';
import { AppButton } from '@/components/ui/AppButton';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PhotoPicker } from '@/components/ui/PhotoPicker';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { Badge } from '@/components/ui/Badge';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { useAsync, useAsyncAction } from '@/hooks';
import { showSuccessAlert, showErrorAlert } from '@/utils/errorAlert';
import { toFormError, type FormErrorView } from '@/utils/formError';
import { emitToast } from '@/utils/toastBus';
import { theme } from '@/theme';
import { ResidentVerificationStatus } from '@/types/resident';
import type { PagedData } from '@/types/envelope';
import type { Resident } from '@/types/resident';
import type { Unit } from '@/types/community';
import { UserStatus } from '@/services/resources/usersClient';
import type { ResourceClients } from '@/services/resources';
import type { LocalFile } from '@/services/resources/fileClient';
import { verificationTone, humanizeCode } from '@/utils/status';
import { VerificationActions } from '@/features/residents/components/VerificationActions';

export interface ResidentListScreenProps {
  resources: ResourceClients;
  /** Start in the verification queue (verificationStatus=pending) with approve/reject (Req 17.2). */
  queueOnly?: boolean;
  /** Deprecated: the list now opens an in-screen bottom sheet. Kept for navigation compatibility. */
  onAddResident?: () => void;
  onBack?: () => void;
}

/** How many residents to load per page (lazy-load / infinite scroll) — matches the Security list. */
const PAGE_SIZE = 10;

/** A resident row = the person record + the resolved status of its linked login (if any). */
interface ResidentRow {
  readonly resident: Resident;
  /** "Active" | "Suspended" | null (no login linked). */
  readonly status: string | null;
}

/** Two-letter initials for the avatar fallback (when there's no photo). */
function initialsOf(name: string): string {
  const parts = name.replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'R';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/** Resolve the login status for a page of residents in parallel (bounded by the page size). */
async function toRows(
  residents: readonly Resident[],
  resources: ResourceClients,
  signal?: AbortSignal,
): Promise<ResidentRow[]> {
  return Promise.all(
    residents.map(async (resident) => {
      if (!resident.userId) return { resident, status: null } as ResidentRow;
      const user = await resources.users.get(resident.userId, signal ? { signal } : undefined).catch(() => null);
      return { resident, status: user ? user.status : null } as ResidentRow;
    }),
  );
}

function warn(message: string): void {
  emitToast({ tone: 'error', title: 'Check the form', message });
}

/** What the bottom sheet is doing: closed, adding a new resident, or editing an existing one. */
type SheetMode = { kind: 'closed' } | { kind: 'add' } | { kind: 'edit'; resident: Resident };

/**
 * Admin "Residents" screen — same product-list design as the Security staff list. Residents are
 * lazy-loaded 10 at a time into a {@link FlatList} that fetches the next page on scroll. Each card
 * shows a photo tile (or initials fallback), the name, "type · phone", a verification badge, an
 * inline active/inactive switch for the linked login, an edit pencil and a delete trash. The header
 * "+" (and the edit pencil) open a keyboard-aware **bottom-sheet form** that creates or edits a
 * resident. A segmented All / Pending control switches to the verification queue, where each card
 * also shows approve/reject. Admin-gated server-side.
 */
export function ResidentListScreen({ resources, queueOnly = false, onBack }: ResidentListScreenProps) {
  const [queue, setQueue] = useState(queueOnly);
  const [rows, setRows] = useState<ResidentRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<FormErrorView | null>(null);
  const [sheet, setSheet] = useState<SheetMode>({ kind: 'closed' });

  const verificationStatus = queue ? ResidentVerificationStatus.Pending : undefined;
  const hasMore = rows.length < totalCount;

  /** Load a specific page; page 1 replaces, later pages append. */
  const loadPage = useCallback(
    async (p: number) => {
      try {
        if (p === 1) { setInitialLoading(true); setError(null); }
        else setLoadingMore(true);
        const list: PagedData<Resident> = await resources.residents.list(
          { page: p, pageSize: PAGE_SIZE },
          { ...(verificationStatus ? { verificationStatus } : {}) },
        );
        const pageRows = await toRows(list.items, resources);
        setTotalCount(list.totalCount);
        setPage(p);
        setRows((prev) => (p === 1 ? pageRows : [...prev, ...pageRows]));
      } catch (e) {
        if (p === 1) setError(toFormError(e));
        else showErrorAlert(e, 'Could not load more');
      } finally {
        setInitialLoading(false);
        setLoadingMore(false);
      }
    },
    [resources, verificationStatus],
  );

  // Initial load + reload after a mutation / tab switch.
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

  const setActive = (row: ResidentRow, active: boolean) => {
    if (!row.resident.userId) {
      showErrorAlert(new Error('This resident has no login to change.'), 'No login');
      return;
    }
    const uid = row.resident.userId;
    void act.run(
      () => (active ? resources.users.activate(uid) : resources.users.deactivate(uid)),
      `${row.resident.name} ${active ? 'activated' : 'deactivated'}.`,
    );
  };

  const confirmDelete = (row: ResidentRow) => {
    Alert.alert(
      'Remove resident',
      `Delete ${row.resident.name}? Their record${row.resident.userId ? ' and login' : ''} will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            void act.run(async () => {
              if (row.resident.userId) {
                await resources.users.delete(row.resident.userId).catch(() => undefined);
              }
              await resources.residents.delete(row.resident.id);
            }, `${row.resident.name} removed.`),
        },
      ],
    );
  };

  const busy = act.running;

  const renderItem = useCallback(
    ({ item: row }: { item: ResidentRow }) => {
      const isActive = row.status === UserStatus.Active;
      const hasLogin = Boolean(row.resident.userId);
      const vStatus = row.resident.verificationStatus;
      const photoSource = resources.files.downloadSource(row.resident.photoFileId);
      return (
        <View style={styles.card}>
          {photoSource ? (
            <Image source={photoSource} style={styles.iconTile} accessibilityLabel={`${row.resident.name} photo`} />
          ) : (
            <View style={[styles.iconTile, styles.iconTileFallback, { backgroundColor: tintFor(vStatus) }]}>
              <Text style={styles.initials}>{initialsOf(row.resident.name)}</Text>
            </View>
          )}

          <Pressable
            style={styles.cardBody}
            onPress={() => setSheet({ kind: 'edit', resident: row.resident })}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${row.resident.name}`}
          >
            <Text style={styles.cardTitle} numberOfLines={1}>{row.resident.name}</Text>
            <Text style={styles.cardSub} numberOfLines={1}>
              {humanizeCode(row.resident.residentType)}{row.resident.phone ? ` · ${row.resident.phone}` : ''}
            </Text>
            <View style={styles.badgeRow}>
              <Badge label={humanizeCode(vStatus)} tone={verificationTone(vStatus)} />
              <Badge
                label={!hasLogin ? 'No login' : isActive ? 'Active' : 'Inactive'}
                tone={!hasLogin ? 'neutral' : isActive ? 'positive' : 'warning'}
              />
            </View>
          </Pressable>

          <View style={styles.cardRight}>
            <Switch
              value={isActive}
              disabled={busy || !hasLogin}
              onValueChange={(v) => setActive(row, v)}
              trackColor={{ true: theme.color.success, false: theme.color.disabled }}
              accessibilityRole="switch"
              accessibilityLabel={`${row.resident.name} active`}
              accessibilityState={{ checked: isActive, disabled: busy || !hasLogin }}
            />
            <View style={styles.rowActions}>
              <Pressable
                onPress={() => setSheet({ kind: 'edit', resident: row.resident })}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${row.resident.name}`}
                hitSlop={8}
                style={styles.iconBtn}
              >
                <Ionicons name="create-outline" size={20} color={theme.color.primary} />
              </Pressable>
              <Pressable
                onPress={() => confirmDelete(row)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${row.resident.name}`}
                hitSlop={8}
                style={styles.iconBtn}
              >
                <Ionicons name="trash-outline" size={20} color={theme.color.danger} />
              </Pressable>
            </View>
          </View>
        </View>
      );
    },
    [busy, act, resources], // setActive/confirmDelete close over act; thumbnail uses resources.files
  );

  // In the Pending queue, each card gets inline approve/reject below it (Req 17.2, 17.3).
  const renderQueueItem = useCallback(
    ({ item: row }: { item: ResidentRow }) => (
      <View style={styles.queueGroup}>
        {renderItem({ item: row })}
        <View style={styles.queueActions}>
          {row.resident.verificationStatus === ResidentVerificationStatus.Rejected && row.resident.rejectionReason ? (
            <View style={styles.reason}>
              <Text style={styles.reasonLabel}>Rejection reason</Text>
              <Text style={styles.reasonText}>{row.resident.rejectionReason}</Text>
            </View>
          ) : null}
          <VerificationActions resources={resources} resident={row.resident} onChanged={reload} />
        </View>
      </View>
    ),
    [renderItem, resources, reload],
  );

  const switchMode = (toQueue: boolean) => { setQueue(toQueue); };

  return (
    <FormScreen
      title={queue ? 'Verification queue' : 'Residents'}
      subtitle={totalCount ? `${totalCount} ${totalCount === 1 ? 'resident' : 'residents'}` : (queue ? 'Pending verification' : 'Resident records')}
      noScroll
      {...(onBack ? { onBack } : {})}
      headerRight={
        !queue ? (
          <Pressable onPress={() => setSheet({ kind: 'add' })} accessibilityRole="button" accessibilityLabel="Add resident" hitSlop={8}>
            <Ionicons name="add" size={26} color={theme.color.primaryText} />
          </Pressable>
        ) : undefined
      }
    >
      {/* Segmented All / Pending control (the verification queue). */}
      <View style={styles.segment} accessibilityRole="tablist">
        <SegmentTab label="All" active={!queue} onPress={() => switchMode(false)} />
        <SegmentTab label="Pending" active={queue} onPress={() => switchMode(true)} />
      </View>

      <AsyncBoundary
        loading={initialLoading}
        error={error}
        empty={!initialLoading && rows.length === 0}
        emptyMessage={queue ? 'No residents awaiting verification.' : 'No residents yet. Tap + to add a resident.'}
        onRetry={reload}
      >
        <FlatList
          data={rows}
          keyExtractor={(row) => row.resident.id}
          renderItem={queue ? renderQueueItem : renderItem}
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

      <ResidentSheet
        resources={resources}
        mode={sheet}
        onClose={() => setSheet({ kind: 'closed' })}
        onSaved={() => { setSheet({ kind: 'closed' }); reload(); }}
      />
    </FormScreen>
  );
}

/** A tint per verification status for the initials avatar (reinforces state when there's no photo). */
function tintFor(status: string): string {
  switch (status) {
    case ResidentVerificationStatus.Verified: return '#e6f4ea';
    case ResidentVerificationStatus.Rejected: return '#fdecec';
    default: return '#fff4e5';
  }
}

/**
 * Keyboard-avoiding bottom-sheet form that CREATES a new resident (owner of an available unit +
 * optional login + optional photo) or EDITS an existing one (name/phone/photo via residents.update).
 * The structure mirrors the Security sheet: the whole sheet lifts above the keyboard, a bounded
 * ScrollView holds the fields, and the submit button is pinned below it so it's always visible.
 */
function ResidentSheet({
  resources,
  mode,
  onClose,
  onSaved,
}: {
  resources: ResourceClients;
  mode: SheetMode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = mode.kind === 'edit';
  const editing = mode.kind === 'edit' ? mode.resident : null;

  // Available units for ADD = units with no owner in their active household (an owner is defined
  // exactly once per unit). Only loaded when adding; editing doesn't change the unit here.
  const available = useAsync<Unit[]>(
    async (signal) => {
      if (mode.kind !== 'add') return [];
      const list: PagedData<Unit> = await resources.units.list({ pageSize: 100 }, {}, { signal });
      const checks = await Promise.all(
        list.items.map(async (unit) => {
          const members = await resources.units.listHousehold(unit.id, { signal }).catch(() => []);
          return members.some((m) => m.residentType === 'owner') ? null : unit;
        }),
      );
      return checks.filter((u): u is Unit => u !== null);
    },
    [mode.kind],
  );
  const unitOptions: SelectOption[] = useMemo(
    () => (available.data ?? []).map((u) => ({ value: u.id, label: `Unit ${u.unitNumber}` })),
    [available.data],
  );

  const [unitId, setUnitId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [createLogin, setCreateLogin] = useState(true);
  const [password, setPassword] = useState('');
  // Optional photo. EDIT uploads immediately (resident exists) and holds the stored reference. ADD
  // is DEFERRED: hold the local file and upload it after the resident is created (bound to its id).
  const [photoFileId, setPhotoFileId] = useState<string | null>(null);
  const [localPhoto, setLocalPhoto] = useState<LocalFile | null>(null);

  // Reset / prefill whenever the sheet opens or switches target.
  useEffect(() => {
    if (mode.kind === 'edit') {
      setName(mode.resident.name);
      setPhone(mode.resident.phone ?? '');
      setEmail(mode.resident.email ?? '');
      setPhotoFileId(mode.resident.photoFileId);
      setLocalPhoto(null);
      setUnitId(null); setPassword(''); setCreateLogin(true);
    } else if (mode.kind === 'add') {
      setName(''); setPhone(''); setEmail(''); setPassword(''); setCreateLogin(true);
      setUnitId(null); setPhotoFileId(null); setLocalPhoto(null);
    }
  }, [mode]);

  const selectedUnit = (available.data ?? []).find((u) => u.id === unitId) ?? null;
  const phoneValid = /^\+\d{6,}$/.test(phone.trim());

  // Edit-only: the picker uploads immediately, bound to the existing resident instance.
  const photoUpload = {
    owningResourceType: 'Resident',
    communityId: editing?.communityId ?? '',
    ...(editing ? { owningResourceId: editing.id } : {}),
  };

  const save = useAsyncAction(async () => {
    if (isEdit && editing) {
      await resources.residents.update(editing.id, {
        name: name.trim(),
        phone: phone.trim(),
        updatePhone: true,
        email: email.trim() ? email.trim() : null,
        updateEmail: true,
        photoFileId,
        updatePhotoFileId: true,
      });
      showSuccessAlert(`${name.trim()} updated.`, 'Resident updated');
      onSaved();
      return;
    }
    // Add: create the owner FIRST (so we have its id), link to the unit as owner, then the optional
    // login, then — only now that the resident exists — upload the held photo bound to that id.
    const unit = selectedUnit!;
    const person = await resources.residents.create({
      communityId: unit.communityId,
      name: name.trim(),
      residentType: 'owner',
      phone: phone.trim(),
      ...(email.trim() ? { email: email.trim() } : {}),
    });
    await resources.residents.addHousehold(person.id, { unitId: unit.id, relationship: 'owner' });
    if (createLogin) {
      await resources.residents.createLogin(person.id, { identifier: phone.trim(), password });
    }
    // Photo is optional; a failure must not undo the created resident (fail safe).
    if (localPhoto) {
      try {
        const stored = await resources.files.upload(localPhoto, {
          owningResourceType: 'Resident',
          communityId: unit.communityId,
          owningResourceId: person.id,
        });
        await resources.residents.update(person.id, { photoFileId: stored.reference, updatePhotoFileId: true });
      } catch {
        emitToast({ tone: 'error', title: 'Photo not saved', message: 'The resident was created, but the photo upload failed. Edit the resident to add it again.' });
      }
    }
    showSuccessAlert(`${name.trim()} added as owner of Unit ${unit.unitNumber}.`, 'Resident added');
    onSaved();
  });

  const onSubmit = () => {
    if (!isEdit && !unitId) { warn('Select an available unit.'); return; }
    if (!name.trim()) { warn('Enter the resident\u2019s name.'); return; }
    if (!phoneValid) { warn('Enter a valid contact number.'); return; }
    if (!isEdit && createLogin && password.length < 4) { warn('Enter a password (at least 4 characters).'); return; }
    void save.run();
  };

  return (
    <BottomSheet
      visible={mode.kind !== 'closed'}
      title={isEdit ? 'Edit resident' : 'Add resident'}
      onClose={onClose}
      footer={
        <AppButton
          title={isEdit ? 'Save changes' : 'Add resident'}
          loading={save.running}
          onPress={onSubmit}
          accessibilityHint={isEdit ? 'Save the edits' : 'Creates the resident, owner link and optional login'}
        />
      }
    >
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScroll}>
        {!isEdit ? (
          available.loading ? (
            <Text style={styles.note}>Loading available units…</Text>
          ) : unitOptions.length === 0 ? (
            <Text style={styles.note}>No available units. Every unit already has an owner — add a unit first.</Text>
          ) : (
            <>
              <Select label="Available unit" required value={unitId} options={unitOptions} onChange={setUnitId} placeholder="Choose a unit without an owner" />
              <Text style={styles.note}>Only units that don't have an owner yet are listed.</Text>
            </>
          )
        ) : null}

        <AppTextField label="Full name" required value={name} onChangeText={setName} placeholder="e.g. Ramesh Patel" autoCapitalize="words" editable={!save.running} />
        <PhoneField label="Contact number" required value={phone} onChangeText={setPhone} editable={!save.running} placeholder="98765 43210" />
        {!isEdit ? <Text style={styles.note}>The contact number is also used as the login — it must be unique.</Text> : null}
        <AppTextField label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="name@example.com" editable={!save.running} />

        {!isEdit ? (
          <>
            <Toggle label="Create a login for this owner" description="They sign in with their phone number" value={createLogin} onValueChange={setCreateLogin} />
            {createLogin ? (
              <AppTextField label="Password" required value={password} onChangeText={setPassword} secureTextEntry placeholder="Initial password" editable={!save.running} />
            ) : null}
          </>
        ) : (
          <Text style={styles.note}>Editing updates the name, contact, email and photo. To change the password, use the login/reset flow.</Text>
        )}

        {/* Optional photo (never required). EDIT uploads immediately; ADD defers until the resident
            exists, then binds the upload to its id. ADD shows the picker once a unit is chosen. */}
        {isEdit ? (
          <PhotoPicker label="Photo (optional)" files={resources.files} upload={photoUpload} value={photoFileId} onChange={setPhotoFileId} disabled={save.running} />
        ) : unitId ? (
          <PhotoPicker label="Photo (optional)" files={resources.files} upload={photoUpload} value={null} onChange={setPhotoFileId} onPickLocal={setLocalPhoto} disabled={save.running} />
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}

/** One pill in the segmented All/Pending control. */
function SegmentTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={[styles.tab, active ? styles.tabActive : null]}
    >
      <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: theme.spacing.xl, paddingTop: theme.spacing.md },
  sep: { height: theme.spacing.md },

  // Segmented control (All / Pending).
  segment: {
    flexDirection: 'row',
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.pill,
    padding: theme.spacing.xs,
    gap: theme.spacing.xs,
    ...theme.shadow.soft,
  },
  tab: { flex: 1, minHeight: theme.minTouchTarget - 8, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.pill },
  tabActive: { backgroundColor: theme.color.primary },
  tabText: { fontSize: theme.fontSize.label, fontWeight: '700', color: theme.color.mutedText },
  tabTextActive: { color: theme.color.primaryText },

  // Product-row card (same shape as the Security list).
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    ...theme.shadow.soft,
  },
  iconTile: { width: 48, height: 48, borderRadius: theme.radius.md, overflow: 'hidden' },
  iconTileFallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  cardSub: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing.xs, marginTop: 4 },
  cardRight: { alignItems: 'center', gap: theme.spacing.xs },
  rowActions: { flexDirection: 'row', gap: theme.spacing.sm },
  iconBtn: { padding: 4 },
  footer: { textAlign: 'center', color: theme.color.mutedText, fontSize: theme.fontSize.caption, paddingVertical: theme.spacing.md },

  // Verification queue grouping (card + approve/reject below it).
  queueGroup: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    ...theme.shadow.soft,
  },
  queueActions: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.md },
  reason: { backgroundColor: '#fdecec', borderRadius: theme.radius.md, padding: theme.spacing.md, gap: 2, marginTop: theme.spacing.sm },
  reasonLabel: { fontSize: theme.fontSize.caption, fontWeight: '800', color: theme.color.danger, textTransform: 'uppercase', letterSpacing: 0.5 },
  reasonText: { fontSize: theme.fontSize.label, color: theme.color.text },

  // Bottom sheet (same structure as the Security sheet).
  sheetScroll: { gap: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.sm },
  note: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, lineHeight: 18 },
});
