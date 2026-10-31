import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { AppTextField } from '@/components/ui/AppTextField';
import { PhoneField } from '@/components/ui/PhoneField';
import { AppButton } from '@/components/ui/AppButton';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PhotoPicker } from '@/components/ui/PhotoPicker';
import { Select, type SelectOption } from '@/components/ui/Select';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { useAsync, useAsyncAction } from '@/hooks';
import { showSuccessAlert, showErrorAlert } from '@/utils/errorAlert';
import { toFormError, type FormErrorView } from '@/utils/formError';
import { emitToast } from '@/utils/toastBus';
import { theme } from '@/theme';
import type { PagedData } from '@/types/envelope';
import type { Resident } from '@/types/resident';
import type { Community } from '@/types/community';
import { UserStatus } from '@/services/resources/usersClient';
import type { ResourceClients } from '@/services/resources';
import type { LocalFile } from '@/services/resources/fileClient';

export interface SecurityStaffListScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

const SECURITY_RESIDENT_TYPE = 'security';
const SECURITY_ROLE_NAME = 'Security';
/** How many guards to load per page (lazy-load / infinite scroll). */
const PAGE_SIZE = 10;

/** A guard row = the resident(person) record + the resolved status of its linked login (if any). */
interface GuardRow {
  readonly resident: Resident;
  /** "Active" | "Suspended" | null (no login linked). */
  readonly status: string | null;
}

function toRows(residents: readonly Resident[]): GuardRow[] {
  return residents.map((resident) => ({
    resident,
    status: resident.userId ? resident.loginStatus : null,
  }));
}

function warn(message: string): void {
  emitToast({ tone: 'error', title: 'Check the form', message });
}

/** What the bottom sheet is doing: closed, adding a new guard, or editing an existing one. */
type SheetMode = { kind: 'closed' } | { kind: 'add' } | { kind: 'edit'; resident: Resident };

/**
 * Admin "Security staff" screen (product-list style). Guards are lazy-loaded 10 at a time into a
 * {@link FlatList} that fetches the next page on scroll. Each card: shield tile, name + "Security ·
 * phone", an inline switch for active/inactive, an edit pencil and a delete trash. The header "+"
 * (and the edit pencil) open a keyboard-avoiding **bottom-sheet form** that creates or edits a guard.
 * Admin-gated server-side.
 */
export function SecurityStaffListScreen({ resources, onBack }: SecurityStaffListScreenProps) {
  const [rows, setRows] = useState<GuardRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<FormErrorView | null>(null);
  const [sheet, setSheet] = useState<SheetMode>({ kind: 'closed' });
  const inFlightRef = useRef(false);

  const hasMore = rows.length < totalCount;

  /** Load a specific page; page 1 replaces, later pages append. */
  const loadPage = useCallback(
    async (p: number) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        if (p === 1) { setInitialLoading(true); setError(null); }
        else setLoadingMore(true);
        const list: PagedData<Resident> = await resources.residents.list(
          { page: p, pageSize: PAGE_SIZE },
          { residentType: SECURITY_RESIDENT_TYPE },
        );
        const pageRows = toRows(list.items);
        setTotalCount(list.totalCount);
        setPage(p);
        setRows((prev) => (p === 1 ? pageRows : [...prev, ...pageRows]));
      } catch (e) {
        if (p === 1) setError(toFormError(e));
        else showErrorAlert(e, 'Could not load more');
      } finally {
        inFlightRef.current = false;
        setInitialLoading(false);
        setLoadingMore(false);
      }
    },
    [resources],
  );

  // Initial load + reload after a mutation.
  const reload = useCallback(() => { void loadPage(1); }, [loadPage]);
  useEffect(() => { void loadPage(1); }, [loadPage]);

  const loadMore = useCallback(() => {
    if (!inFlightRef.current && !loadingMore && !initialLoading && hasMore) {
      void loadPage(page + 1);
    }
  }, [loadingMore, initialLoading, hasMore, page, loadPage]);

  const act = useAsyncAction(async (fn: () => Promise<unknown>, successMsg: string) => {
    await fn();
    showSuccessAlert(successMsg);
    reload();
  });

  const setActive = (row: GuardRow, active: boolean) => {
    if (!row.resident.userId) {
      showErrorAlert(new Error('This guard has no login to change.'), 'No login');
      return;
    }
    const uid = row.resident.userId;
    void act.run(
      () => (active ? resources.users.activate(uid) : resources.users.deactivate(uid)),
      `${row.resident.name} ${active ? 'activated' : 'deactivated'}.`,
    );
  };

  const confirmDelete = (row: GuardRow) => {
    Alert.alert(
      'Remove security staff',
      `Delete ${row.resident.name}? Their login will be removed and they won't be able to sign in.`,
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
    ({ item: row }: { item: GuardRow }) => {
      const isActive = row.status === UserStatus.Active;
      const hasLogin = Boolean(row.resident.userId);
      const photoSource = resources.files.downloadSource(row.resident.photoFileId);
      return (
        <View style={styles.card}>
          {photoSource ? (
            <Image
              source={photoSource}
              style={styles.iconTile}
              accessibilityLabel={`${row.resident.name} photo`}
            />
          ) : (
            <View style={[styles.iconTile, styles.iconTileFallback, { backgroundColor: isActive ? '#e6f4ea' : '#eef1f5' }]}>
              <Ionicons name="shield-checkmark" size={22} color={isActive ? theme.color.success : theme.color.mutedText} />
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
              Security{row.resident.phone ? ` · ${row.resident.phone}` : ''}
            </Text>
            <Text style={[styles.cardStatus, { color: isActive ? theme.color.success : theme.color.mutedText }]}>
              {!hasLogin ? 'No login' : isActive ? 'Active' : 'Inactive'}
            </Text>
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
    [busy, act, resources], // setActive/confirmDelete close over act; card thumbnail uses resources.files
  );

  return (
    <FormScreen
      title="Security staff"
      subtitle={totalCount ? `${totalCount} ${totalCount === 1 ? 'guard' : 'guards'}` : 'Guard logins'}
      noScroll
      {...(onBack ? { onBack } : {})}
      headerRight={
        <Pressable onPress={() => setSheet({ kind: 'add' })} accessibilityRole="button" accessibilityLabel="Add security" hitSlop={8}>
          <Ionicons name="add" size={26} color={theme.color.primaryText} />
        </Pressable>
      }
    >
      <AsyncBoundary
        loading={initialLoading}
        error={error}
        empty={!initialLoading && rows.length === 0}
        emptyMessage="No security staff yet. Tap + to add a guard login."
        onRetry={reload}
      >
        <FlatList
          data={rows}
          keyExtractor={(row) => row.resident.id}
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

      <SecuritySheet
        resources={resources}
        mode={sheet}
        onClose={() => setSheet({ kind: 'closed' })}
        onSaved={() => { setSheet({ kind: 'closed' }); reload(); }}
      />
    </FormScreen>
  );
}

/**
 * Keyboard-avoiding bottom-sheet form that CREATES a new guard (community/name/phone/password →
 * resident + Security login) or EDITS an existing one (name/phone via residents.update; password is
 * not changed here). The sheet is a KeyboardAvoidingView + inner ScrollView so the focused field
 * (e.g. password) always stays above the on-screen keyboard.
 */
function SecuritySheet({
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

  const communities = useAsync<PagedData<Community>>(
    (signal) => resources.communities.list({ pageSize: 100 }, {}, { signal }),
    [],
  );
  const options: SelectOption[] = (communities.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }));

  const [communityId, setCommunityId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  // Optional photo. On EDIT the resident id exists, so the picker uploads immediately and we hold the
  // stored reference here. On ADD the id doesn't exist yet, so the picker is DEFERRED: it hands us the
  // local file and we upload it after the resident is created (bound to the new resident id).
  const [photoFileId, setPhotoFileId] = useState<string | null>(null);
  const [localPhoto, setLocalPhoto] = useState<LocalFile | null>(null);

  // Reset / prefill whenever the sheet opens or switches target.
  useEffect(() => {
    if (mode.kind === 'edit') {
      setName(mode.resident.name);
      setPhone(mode.resident.phone ?? '');
      setPassword('');
      setCommunityId(mode.resident.communityId);
      setPhotoFileId(mode.resident.photoFileId);
      setLocalPhoto(null);
    } else if (mode.kind === 'add') {
      setName(''); setPhone(''); setPassword(''); setCommunityId(null); setPhotoFileId(null); setLocalPhoto(null);
    }
  }, [mode]);

  const sole = options.length === 1 ? options[0]!.value : null;
  const effectiveCommunityId = communityId ?? sole;
  const phoneValid = /^\+\d{6,}$/.test(phone.trim());

  // Edit-only: the picker uploads immediately, bound to the existing resident instance.
  const photoUpload = {
    owningResourceType: 'Resident',
    communityId: editing?.communityId ?? '',
    ...(editing ? { owningResourceId: editing.id } : {}),
  };

  const save = useAsyncAction(async () => {
    if (isEdit && editing) {
      // Edit: update name + phone + photo on the person record (password isn't changed here).
      await resources.residents.update(editing.id, {
        name: name.trim(),
        phone: phone.trim(),
        updatePhone: true,
        photoFileId,
        updatePhotoFileId: true,
      });
      showSuccessAlert(`${name.trim()} updated.`, 'Security staff updated');
      onSaved();
      return;
    }
    // Add: create the person FIRST so we have its id, then the Security login, then — only now that
    // the resident exists — upload the held photo bound to that resident id and save the reference.
    const cid = effectiveCommunityId!;
    const person = await resources.residents.create({
      communityId: cid,
      name: name.trim(),
      residentType: SECURITY_RESIDENT_TYPE,
      phone: phone.trim(),
    });
    const res = await resources.residents.createLogin(person.id, {
      identifier: phone.trim(),
      password,
      roleName: SECURITY_ROLE_NAME,
    });
    // Photo is optional. If one was picked, upload it bound to the new resident id, then link it.
    // A photo failure must not undo the created guard (fail safe): surface it but keep the guard.
    if (localPhoto) {
      try {
        const stored = await resources.files.upload(localPhoto, {
          owningResourceType: 'Resident',
          communityId: cid,
          owningResourceId: person.id,
        });
        await resources.residents.update(person.id, { photoFileId: stored.reference, updatePhotoFileId: true });
      } catch {
        emitToast({ tone: 'error', title: 'Photo not saved', message: 'The guard was created, but the photo upload failed. Edit the guard to add it again.' });
      }
    }
    showSuccessAlert(`${name.trim()} added as security staff. Login: ${res.identifier}`, 'Security login created');
    onSaved();
  });

  const onSubmit = () => {
    if (!isEdit && !effectiveCommunityId) { warn('Select a community.'); return; }
    if (!name.trim()) { warn('Enter the guard\u2019s name.'); return; }
    if (!phoneValid) { warn('Enter a valid phone number.'); return; }
    if (!isEdit && password.length < 4) { warn('Enter a password (at least 4 characters).'); return; }
    void save.run();
  };

  return (
    <BottomSheet
      visible={mode.kind !== 'closed'}
      title={isEdit ? 'Edit security' : 'Add security'}
      onClose={onClose}
      footer={
        <AppButton title={isEdit ? 'Save changes' : 'Create security login'} loading={save.running} onPress={onSubmit} accessibilityHint={isEdit ? 'Save the edits' : 'Creates the guard and a Security-role login'} />
      }
    >
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScroll}>
        {!isEdit && communities.loading ? (
          <Text style={styles.note}>Loading communities…</Text>
        ) : null}
        {!isEdit && !communities.loading && options.length === 0 ? (
          <Text style={styles.note}>No community found. Create a community first.</Text>
        ) : null}
        {!isEdit && options.length > 1 ? (
          <Select label="Community" required value={effectiveCommunityId} options={options} onChange={setCommunityId} placeholder="Choose a community" />
        ) : null}

        <AppTextField label="Full name" required value={name} onChangeText={setName} placeholder="e.g. Ramesh (Gate)" autoCapitalize="words" editable={!save.running} />
        <PhoneField label="Phone number" required value={phone} onChangeText={setPhone} editable={!save.running} placeholder="98765 43210" />
        {!isEdit ? (
          <>
            <AppTextField label="Password" required value={password} onChangeText={setPassword} secureTextEntry placeholder="Initial password" editable={!save.running} />
            <Text style={styles.note}>They sign in with this phone + password. The Security role grants gate operations.</Text>
          </>
        ) : (
          <Text style={styles.note}>Editing updates the name, phone and photo. To change the password, use the login/reset flow.</Text>
        )}

        {/* Optional guard photo (never required). EDIT uploads immediately (resident exists).
            ADD is DEFERRED: the picker hands us the local file and we upload it after the resident is
            created, bound to its id. ADD shows the picker only once a community is chosen. */}
        {isEdit ? (
          <PhotoPicker
            label="Photo (optional)"
            files={resources.files}
            upload={photoUpload}
            value={photoFileId}
            onChange={setPhotoFileId}
            disabled={save.running}
          />
        ) : effectiveCommunityId ? (
          <PhotoPicker
            label="Photo (optional)"
            files={resources.files}
            upload={photoUpload}
            value={null}
            onChange={setPhotoFileId}
            onPickLocal={setLocalPhoto}
            disabled={save.running}
          />
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: theme.spacing.xl },
  sep: { height: theme.spacing.md },

  // Reference-style product row card.
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
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  cardSub: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
  cardStatus: { fontSize: theme.fontSize.label, fontWeight: '700', marginTop: 2 },
  cardRight: { alignItems: 'center', gap: theme.spacing.xs },
  rowActions: { flexDirection: 'row', gap: theme.spacing.sm },
  iconBtn: { padding: 4 },
  footer: { textAlign: 'center', color: theme.color.mutedText, fontSize: theme.fontSize.caption, paddingVertical: theme.spacing.md },

  // Bottom sheet.
  sheetScroll: { gap: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.sm },
  note: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, lineHeight: 18 },
});
