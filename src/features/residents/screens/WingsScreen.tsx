import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { AppTextField } from '@/components/ui/AppTextField';
import { AppButton } from '@/components/ui/AppButton';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Select, type SelectOption } from '@/components/ui/Select';
import { MasterDataDropdown } from '@/components/ui/MasterDataDropdown';
import { Badge } from '@/components/ui/Badge';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { useAsync, useAsyncAction } from '@/hooks';
import { showSuccessAlert, showErrorAlert } from '@/utils/errorAlert';
import { toFormError, type FormErrorView } from '@/utils/formError';
import { emitToast } from '@/utils/toastBus';
import { theme } from '@/theme';
import { MasterDataKeys } from '@/types/masterData';
import type { Community, HierarchyNode } from '@/types/community';
import type { ResourceClients } from '@/services/resources';
import { humanizeCode } from '@/utils/status';

export interface WingsScreenProps {
  resources: ResourceClients;
  community: Community;
  onBack?: () => void;
}

/** A per-level icon so each structure node reads at a glance. */
function levelIcon(level: string): keyof typeof Ionicons.glyphMap {
  switch (level) {
    case 'phase': return 'map';
    case 'building_tower': return 'business';
    case 'block': return 'grid';
    case 'zone': return 'location';
    case 'floor': return 'layers';
    default: return 'git-branch';
  }
}

function warn(message: string): void {
  emitToast({ tone: 'error', title: 'Check the form', message });
}

/** What the bottom sheet is doing: closed, adding a new node, or editing an existing one. */
type SheetMode = { kind: 'closed' } | { kind: 'add' } | { kind: 'edit'; node: HierarchyNode };

/**
 * Manage a community's structure — its wings / buildings / floors (Req 13.1–13.5) — in the same
 * product-list design as the Security staff list. Each node is a card with a per-level icon tile,
 * its name, the level, a level badge, an edit pencil and a delete trash. The header "+" (and the
 * edit pencil) open a keyboard-aware **bottom-sheet form** that creates or edits a node (name,
 * configurable level, optional parent so a node can nest under an existing one). Admin-gated
 * server-side.
 */
export function WingsScreen({ resources, community, onBack }: WingsScreenProps) {
  const [nodes, setNodes] = useState<HierarchyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FormErrorView | null>(null);
  const [sheet, setSheet] = useState<SheetMode>({ kind: 'closed' });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await resources.hierarchy.listForCommunity(community.id);
      setNodes(list);
    } catch (e) {
      setError(toFormError(e));
    } finally {
      setLoading(false);
    }
  }, [resources, community.id]);

  useEffect(() => { void load(); }, [load]);

  const act = useAsyncAction(async (fn: () => Promise<unknown>, successMsg: string) => {
    await fn();
    showSuccessAlert(successMsg);
    void load();
  });

  const confirmDelete = (node: HierarchyNode) => {
    Alert.alert(
      'Remove structure item',
      `Delete "${node.name}"? It will be removed from the community structure.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void act.run(() => resources.hierarchy.delete(node.id), `"${node.name}" removed.`),
        },
      ],
    );
  };

  const busy = act.running;

  const renderItem = useCallback(
    ({ item: n }: { item: HierarchyNode }) => {
      const parent = n.parentId ? nodes.find((p) => p.id === n.parentId) : null;
      const sub = parent ? `${humanizeCode(n.level)} · under ${parent.name}` : humanizeCode(n.level);
      return (
        <View style={styles.card}>
          <View style={styles.iconTile}>
            <Ionicons name={levelIcon(n.level)} size={22} color={theme.color.primary} />
          </View>

          <Pressable
            style={styles.cardBody}
            onPress={() => setSheet({ kind: 'edit', node: n })}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${n.name}`}
          >
            <Text style={styles.cardTitle} numberOfLines={1}>{n.name}</Text>
            <Text style={styles.cardSub} numberOfLines={1}>{sub}</Text>
            <View style={styles.badgeRow}>
              <Badge label={humanizeCode(n.level)} tone="neutral" />
            </View>
          </Pressable>

          <View style={styles.cardRight}>
            <Pressable
              onPress={() => setSheet({ kind: 'edit', node: n })}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${n.name}`}
              hitSlop={8}
              style={styles.iconBtn}
            >
              <Ionicons name="create-outline" size={20} color={theme.color.primary} />
            </Pressable>
            <Pressable
              onPress={() => confirmDelete(n)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${n.name}`}
              hitSlop={8}
              style={styles.iconBtn}
            >
              <Ionicons name="trash-outline" size={20} color={theme.color.danger} />
            </Pressable>
          </View>
        </View>
      );
    },
    [busy, act, nodes],
  );

  return (
    <FormScreen
      title="Wings & structure"
      subtitle={nodes.length ? `${nodes.length} ${nodes.length === 1 ? 'item' : 'items'} · ${community.name}` : community.name}
      noScroll
      {...(onBack ? { onBack } : {})}
      headerRight={
        <Pressable onPress={() => setSheet({ kind: 'add' })} accessibilityRole="button" accessibilityLabel="Add wing" hitSlop={8}>
          <Ionicons name="add" size={26} color={theme.color.primaryText} />
        </Pressable>
      }
    >
      <AsyncBoundary
        loading={loading}
        error={error}
        empty={!loading && nodes.length === 0}
        emptyMessage="No wings or buildings yet. Tap + to add one."
        onRetry={load}
      >
        <FlatList
          data={nodes}
          keyExtractor={(n) => n.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          showsVerticalScrollIndicator={false}
        />
      </AsyncBoundary>

      <WingSheet
        resources={resources}
        community={community}
        nodes={nodes}
        mode={sheet}
        onClose={() => setSheet({ kind: 'closed' })}
        onSaved={() => { setSheet({ kind: 'closed' }); void load(); }}
      />
    </FormScreen>
  );
}

/**
 * Keyboard-avoiding bottom-sheet form that CREATES a structure node (name + configurable level +
 * optional parent) or EDITS an existing one. Same structure as the Security/Resident/Unit sheets:
 * the whole sheet lifts above the keyboard, a bounded ScrollView holds the fields, and the submit
 * button is pinned below it. The level comes from the configurable `Hierarchy_Level` list.
 */
function WingSheet({
  resources,
  community,
  nodes,
  mode,
  onClose,
  onSaved,
}: {
  resources: ResourceClients;
  community: Community;
  nodes: readonly HierarchyNode[];
  mode: SheetMode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = mode.kind === 'edit';
  const editing = mode.kind === 'edit' ? mode.node : null;

  const [name, setName] = useState('');
  const [level, setLevel] = useState<string | null>('building_tower');
  const [parentId, setParentId] = useState<string | null>(null);

  // Parent options = the other existing nodes (a node can't be its own parent). Optional — omit for
  // a top-level wing directly under the community.
  const parentOptions: SelectOption[] = useMemo(
    () => nodes.filter((n) => n.id !== editing?.id).map((n) => ({ value: n.id, label: `${n.name} (${humanizeCode(n.level)})` })),
    [nodes, editing?.id],
  );

  useEffect(() => {
    if (mode.kind === 'edit') {
      setName(mode.node.name);
      setLevel(mode.node.level);
      setParentId(mode.node.parentId);
    } else if (mode.kind === 'add') {
      setName('');
      setLevel('building_tower');
      setParentId(null);
    }
  }, [mode]);

  const save = useAsyncAction(async () => {
    if (isEdit && editing) {
      await resources.hierarchy.update(editing.id, {
        name: name.trim(),
        level: level!,
        parentId: parentId ?? null,
        updateParent: true,
      });
      showSuccessAlert(`"${name.trim()}" updated.`, 'Structure updated');
      onSaved();
      return;
    }
    await resources.hierarchy.create({
      communityId: community.id,
      level: level!,
      name: name.trim(),
      ...(parentId ? { parentId } : {}),
    });
    showSuccessAlert(`"${name.trim()}" added.`, 'Wing added');
    onSaved();
  });

  const onSubmit = () => {
    if (!name.trim()) { warn('Enter a name (e.g. Wing C).'); return; }
    if (!level) { warn('Choose a level.'); return; }
    void save.run();
  };

  return (
    <BottomSheet
      visible={mode.kind !== 'closed'}
      title={isEdit ? 'Edit structure' : 'Add wing / building'}
      onClose={onClose}
      footer={
        <AppButton
          title={isEdit ? 'Save changes' : 'Add'}
          loading={save.running}
          onPress={onSubmit}
          accessibilityHint={isEdit ? 'Save the edits' : 'Adds the wing to this community'}
        />
      }
    >
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScroll}>
        <AppTextField label="Name" required value={name} onChangeText={setName} placeholder="e.g. Wing C" editable={!save.running} />
        <MasterDataDropdown
          label="Level"
          required
          listKey={MasterDataKeys.HierarchyLevel}
          masterData={resources.masterData}
          value={level}
          onChange={setLevel}
          communityId={community.id}
          placeholder="Choose a level"
        />
        {parentOptions.length > 0 ? (
          <Select
            label="Parent (optional)"
            value={parentId}
            options={parentOptions}
            onChange={setParentId}
            placeholder="Top level (no parent)"
            allowClear
            clearLabel="Top level (no parent)"
          />
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: theme.spacing.xl, paddingTop: theme.spacing.md },
  sep: { height: theme.spacing.md },

  // Product-row card (same shape as the Security / Resident / Unit lists).
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    ...theme.shadow.soft,
  },
  iconTile: { width: 48, height: 48, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef0fb' },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  cardSub: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: 2 },
  cardRight: { alignItems: 'center', gap: theme.spacing.xs },
  iconBtn: { padding: 4 },

  // Bottom sheet (same structure as the other admin sheets).
  sheetScroll: { gap: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.sm },
});
