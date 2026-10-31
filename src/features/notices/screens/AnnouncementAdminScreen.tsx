import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { parseUtc } from '@/utils/datetime';
import { AppTextField } from '@/components/ui/AppTextField';
import { AppButton } from '@/components/ui/AppButton';
import { Select, type SelectOption } from '@/components/ui/Select';
import { MasterDataDropdown } from '@/components/ui/MasterDataDropdown';
import { Badge } from '@/components/ui/Badge';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { useAsync, useAsyncAction } from '@/hooks';
import { showSuccessAlert, showErrorAlert } from '@/utils/errorAlert';
import { toFormError, type FormErrorView } from '@/utils/formError';
import { emitToast } from '@/utils/toastBus';
import { theme } from '@/theme';
import { useSafeInsets } from '@/utils/safeInsets';
import { MasterDataKeys } from '@/types/masterData';
import type { PagedData } from '@/types/envelope';
import type { Announcement } from '@/types/announcement';
import type { Community } from '@/types/community';
import type { ResourceClients } from '@/services/resources';
import { announcementCategoryTone, humanizeCode } from '@/utils/status';

export interface AnnouncementAdminScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

/** How many announcements to load per page (lazy-load / infinite scroll). */
const PAGE_SIZE = 10;

/** A per-category icon so each notice reads at a glance. */
function categoryIcon(code: string): keyof typeof Ionicons.glyphMap {
  switch (code) {
    case 'event': return 'calendar';
    case 'maintenance': return 'construct';
    case 'emergency': return 'warning';
    default: return 'megaphone';
  }
}

/** Short, locale-aware date for the card subtitle. */
function shortDate(iso: string): string {
  const d = parseUtc(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

function warn(message: string): void {
  emitToast({ tone: 'error', title: 'Check the form', message });
}

/** What the bottom sheet is doing: closed, adding a new notice, or editing an existing one. */
type SheetMode = { kind: 'closed' } | { kind: 'add' } | { kind: 'edit'; announcement: Announcement };

/**
 * Admin "Announcements" screen (product-list style, like the Security staff list). Notices are
 * lazy-loaded 10 at a time; the list INCLUDES deactivated notices (the admin view) so they can be
 * re-activated or edited. Each card: a category tile, the title + "category · date", an inline
 * active switch (show/hide on the resident board), an edit pencil and a delete trash. The header "+"
 * (and the edit pencil) open a keyboard-aware bottom-sheet form that publishes or edits a notice.
 * Admin-gated server-side (superadmin bypasses the gate).
 */
export function AnnouncementAdminScreen({ resources, onBack }: AnnouncementAdminScreenProps) {
  const [rows, setRows] = useState<Announcement[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<FormErrorView | null>(null);
  const [sheet, setSheet] = useState<SheetMode>({ kind: 'closed' });

  const hasMore = rows.length < totalCount;
  const inFlightRef = useRef(false);

  const loadPage = useCallback(
    async (p: number) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        if (p === 1) { setInitialLoading(true); setError(null); }
        else setLoadingMore(true);
        const list: PagedData<Announcement> = await resources.announcements.list(
          { page: p, pageSize: PAGE_SIZE },
          { includeInactive: true },
        );
        setTotalCount(list.totalCount);
        setPage(p);
        setRows((prev) => (p === 1 ? list.items : [...prev, ...list.items]));
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

  const setActive = (a: Announcement, active: boolean) => {
    void act.run(
      () => (active ? resources.announcements.activate(a.id) : resources.announcements.deactivate(a.id)),
      `"${a.title}" ${active ? 'shown on the board' : 'hidden from the board'}.`,
    );
  };

  const confirmDelete = (a: Announcement) => {
    Alert.alert(
      'Delete announcement',
      `Delete "${a.title}"? It will be removed from the notice board.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void act.run(() => resources.announcements.delete(a.id), `"${a.title}" deleted.`),
        },
      ],
    );
  };

  const busy = act.running;

  const renderItem = useCallback(
    ({ item: a }: { item: Announcement }) => (
      <View style={styles.card}>
        <View style={[styles.iconTile, { backgroundColor: a.isActive ? '#eaf2fb' : '#eef1f5' }]}>
          <Ionicons name={categoryIcon(a.category)} size={22} color={a.isActive ? theme.color.primary : theme.color.mutedText} />
        </View>

        <Pressable
          style={styles.cardBody}
          onPress={() => setSheet({ kind: 'edit', announcement: a })}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${a.title}`}
        >
          <Text style={styles.cardTitle} numberOfLines={1}>{a.title}</Text>
          <Text style={styles.cardSub} numberOfLines={1}>
            {humanizeCode(a.category)}{a.publishedAtUtc ? ` · ${shortDate(a.publishedAtUtc)}` : ''}
          </Text>
          <View style={styles.badgeRow}>
            <Badge label={humanizeCode(a.category)} tone={announcementCategoryTone(a.category)} />
            <Text style={[styles.state, { color: a.isActive ? theme.color.success : theme.color.mutedText }]}>
              {a.isActive ? 'Active' : 'Hidden'}
            </Text>
          </View>
        </Pressable>

        <View style={styles.cardRight}>
          <Switch
            value={a.isActive}
            disabled={busy}
            onValueChange={(v) => setActive(a, v)}
            trackColor={{ true: theme.color.success, false: theme.color.disabled }}
            accessibilityRole="switch"
            accessibilityLabel={`${a.title} active`}
            accessibilityState={{ checked: a.isActive, disabled: busy }}
          />
          <View style={styles.rowActions}>
            <Pressable
              onPress={() => setSheet({ kind: 'edit', announcement: a })}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${a.title}`}
              hitSlop={8}
              style={styles.iconBtn}
            >
              <Ionicons name="create-outline" size={20} color={theme.color.primary} />
            </Pressable>
            <Pressable
              onPress={() => confirmDelete(a)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${a.title}`}
              hitSlop={8}
              style={styles.iconBtn}
            >
              <Ionicons name="trash-outline" size={20} color={theme.color.danger} />
            </Pressable>
          </View>
        </View>
      </View>
    ),
    [busy, act],
  );

  return (
    <FormScreen
      title="Announcements"
      subtitle={totalCount ? `${totalCount} ${totalCount === 1 ? 'notice' : 'notices'}` : 'Notice board'}
      noScroll
      {...(onBack ? { onBack } : {})}
      headerRight={
        <Pressable onPress={() => setSheet({ kind: 'add' })} accessibilityRole="button" accessibilityLabel="New announcement" hitSlop={8}>
          <Ionicons name="add" size={26} color={theme.color.primaryText} />
        </Pressable>
      }
    >
      <AsyncBoundary
        loading={initialLoading}
        error={error}
        empty={!initialLoading && rows.length === 0}
        emptyMessage="No announcements yet. Tap + to publish one."
        onRetry={reload}
      >
        <FlatList
          data={rows}
          keyExtractor={(a) => a.id}
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

      <AnnouncementSheet
        resources={resources}
        mode={sheet}
        onClose={() => setSheet({ kind: 'closed' })}
        onSaved={() => { setSheet({ kind: 'closed' }); reload(); }}
      />
    </FormScreen>
  );
}

/**
 * Keyboard-avoiding bottom-sheet form that PUBLISHES a new announcement (community / title / body /
 * category) or EDITS an existing one (title / body / category). Same structure as the other admin
 * sheets. The category comes from the configurable `Announcement_Category` master-data list.
 */
function AnnouncementSheet({
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
  const insets = useSafeInsets();
  const isEdit = mode.kind === 'edit';
  const editing = mode.kind === 'edit' ? mode.announcement : null;

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates?.height ?? 0));
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const screenH = Dimensions.get('window').height;
  const scrollMaxHeight = Math.max(160, screenH * 0.6 - keyboardHeight);

  // Communities for the add selector (edit is pinned to the notice's own community).
  const communities = useAsync<PagedData<Community>>(
    (signal) => (mode.kind === 'add' ? resources.communities.list({ pageSize: 100 }, {}, { signal }) : Promise.resolve({ items: [], page: 1, pageSize: 0, totalCount: 0 } as PagedData<Community>)),
    [mode.kind],
  );
  const communityOptions: SelectOption[] = (communities.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }));

  const [communityId, setCommunityId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<string | null>('general');

  useEffect(() => {
    if (mode.kind === 'edit') {
      setTitle(mode.announcement.title);
      setBody(mode.announcement.body);
      setCategory(mode.announcement.category);
      setCommunityId(mode.announcement.communityId);
    } else if (mode.kind === 'add') {
      setTitle(''); setBody(''); setCategory('general'); setCommunityId(null);
    }
  }, [mode]);

  const soleCommunity = communityOptions.length === 1 ? communityOptions[0]!.value : null;
  const effectiveCommunityId = communityId ?? soleCommunity;

  const save = useAsyncAction(async () => {
    if (isEdit && editing) {
      await resources.announcements.update(editing.id, {
        title: title.trim(),
        body: body.trim(),
        category: category!,
      });
      showSuccessAlert(`"${title.trim()}" updated.`, 'Announcement updated');
      onSaved();
      return;
    }
    await resources.announcements.create({
      communityId: effectiveCommunityId!,
      title: title.trim(),
      body: body.trim(),
      category: category!,
    });
    showSuccessAlert(`"${title.trim()}" published.`, 'Announcement published');
    onSaved();
  });

  const onSubmit = () => {
    if (!isEdit && !effectiveCommunityId) { warn('Select a community.'); return; }
    if (!title.trim()) { warn('Enter a title.'); return; }
    if (!body.trim()) { warn('Enter the message.'); return; }
    if (!category) { warn('Choose a category.'); return; }
    void save.run();
  };

  return (
    <Modal visible={mode.kind !== 'closed'} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} accessibilityLabel="Close" onPress={onClose}>
        <View style={[styles.sheetWrap, { marginBottom: keyboardHeight }]}>
          <Pressable
            style={[styles.sheet, { paddingBottom: (keyboardHeight > 0 ? theme.spacing.lg : insets.bottom + theme.spacing.lg) }]}
            onPress={() => { }}
          >
            <View style={styles.grabber} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{isEdit ? 'Edit announcement' : 'New announcement'}</Text>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
                <Ionicons name="close" size={22} color={theme.color.mutedText} />
              </Pressable>
            </View>

            <ScrollView
              style={[styles.sheetScrollView, { maxHeight: scrollMaxHeight }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetScroll}
            >
              {!isEdit && communityOptions.length > 1 ? (
                <Select label="Community" required value={effectiveCommunityId} options={communityOptions} onChange={setCommunityId} placeholder="Choose a community" />
              ) : null}

              <AppTextField label="Title" required value={title} onChangeText={setTitle} placeholder="e.g. Water supply maintenance" editable={!save.running} />
              <AppTextField
                label="Message"
                required
                value={body}
                onChangeText={setBody}
                placeholder="Write the announcement…"
                multiline
                numberOfLines={5}
                editable={!save.running}
              />
              <MasterDataDropdown
                label="Category"
                required
                listKey={MasterDataKeys.AnnouncementCategory}
                masterData={resources.masterData}
                value={category}
                onChange={setCategory}
                {...(effectiveCommunityId ? { communityId: effectiveCommunityId } : {})}
                placeholder="Choose a category"
              />
            </ScrollView>

            <View style={styles.sheetActions}>
              <AppButton
                title={isEdit ? 'Save changes' : 'Publish'}
                loading={save.running}
                onPress={onSubmit}
                accessibilityHint={isEdit ? 'Save the edits' : 'Publishes the announcement to the board'}
              />
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: theme.spacing.xl, paddingTop: theme.spacing.md },
  sep: { height: theme.spacing.md },

  // Product-row card (same shape as the other admin lists).
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
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: 2 },
  state: { fontSize: theme.fontSize.label, fontWeight: '700' },
  cardRight: { alignItems: 'center', gap: theme.spacing.xs },
  rowActions: { flexDirection: 'row', gap: theme.spacing.sm },
  iconBtn: { padding: 4 },
  footer: { textAlign: 'center', color: theme.color.mutedText, fontSize: theme.fontSize.caption, paddingVertical: theme.spacing.md },

  // Bottom sheet (same structure as the other admin sheets).
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheetWrap: { width: '100%' },
  sheet: {
    backgroundColor: theme.color.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  sheetScrollView: { flexShrink: 1 },
  sheetScroll: { gap: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.sm },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.color.border, marginBottom: theme.spacing.xs },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: theme.fontSize.title, fontWeight: '800', color: theme.color.text },
  sheetActions: { marginTop: theme.spacing.xs },
});
