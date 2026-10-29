import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { AppButton } from '@/components/ui/AppButton';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { Pager } from '@/components/ui/Pager';
import { useAsync, useAsyncAction } from '@/hooks';
import { theme } from '@/theme';
import { DEFAULT_PAGE_SIZE } from '@/types/query';
import type { PagedData } from '@/types/envelope';
import type { AppNotification } from '@/types/notification';
import type { ResourceClients } from '@/services/resources';
import { humanizeCode } from '@/utils/status';
import { parseUtc } from '@/utils/datetime';

export interface NotificationsScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

/** Per-category icon + tint so each notification reads at a glance. Falls back to a bell. */
const CATEGORY_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; tint: string }> = {
  visitor: { icon: 'people', tint: theme.color.info },
  account: { icon: 'shield-checkmark', tint: theme.color.primary },
  emergency: { icon: 'warning', tint: theme.color.danger },
  responder: { icon: 'alert-circle', tint: theme.color.danger },
  parcel: { icon: 'cube', tint: '#cf5500' },
  complaint: { icon: 'construct', tint: theme.color.warning },
  invoice: { icon: 'receipt', tint: theme.color.info },
  facility_booking: { icon: 'calendar', tint: '#8250df' },
  document_expiry: { icon: 'document-text', tint: theme.color.info },
  announcement: { icon: 'megaphone', tint: '#8250df' },
  parking: { icon: 'car-sport', tint: theme.color.warning },
  event: { icon: 'sparkles', tint: '#8250df' },
};
function metaFor(category: string) {
  return CATEGORY_META[category] ?? { icon: 'notifications' as const, tint: theme.color.primary };
}

/**
 * In-app notification INBOX — shared by residents and security (same self-scoped endpoint). Lists
 * the signed-in user's notifications (walk-in registered/approved/rejected, verification, tickets,
 * parcels, …) newest-first as cards; unread items are highlighted. Tapping a card marks it read;
 * a header "Mark all read" clears the unread badge. The rows are written by the backend's one common
 * enqueue helper, so this screen needs no per-event wiring — anything enqueued to the user shows up.
 */
export function NotificationsScreen({ resources, onBack }: NotificationsScreenProps) {
  const [page, setPage] = useState(1);

  const list = useAsync<PagedData<AppNotification>>(
    (signal) => resources.notifications.list({ page, pageSize: DEFAULT_PAGE_SIZE }, { signal }),
    [page],
  );

  const markRead = useAsyncAction((id: string) => resources.notifications.markRead(id));
  const markAll = useAsyncAction(() => resources.notifications.markAllRead());
  // Soft-delete (backend marks IsDeleted; the row stays in the table but is hidden from the inbox).
  const del = useAsyncAction((id: string) => resources.notifications.delete(id));
  const delAll = useAsyncAction(() => resources.notifications.deleteAll());

  const items = list.data?.items ?? [];
  const hasUnread = items.some((n) => !n.isRead);
  const hasAny = items.length > 0;

  const confirmDeleteAll = () => {
    Alert.alert(
      'Delete all notifications',
      'This clears your notification list. Deleted notifications are removed from view.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: async () => { if (await delAll.run()) list.reload(); },
        },
      ],
    );
  };

  const onOpen = async (n: AppNotification) => {
    if (n.isRead) return;
    if (await markRead.run(n.id)) list.reload();
  };

  return (
    <FormScreen
      title="Notifications"
      subtitle={list.data ? `${list.data.totalCount} total` : 'Your alerts & updates'}
      {...(onBack ? { onBack } : {})}
      headerRight={
        hasAny ? (
          <View style={styles.headerActions}>
            {hasUnread ? (
              <Pressable
                onPress={async () => { if (await markAll.run()) list.reload(); }}
                accessibilityRole="button"
                accessibilityLabel="Mark all read"
                hitSlop={8}
              >
                <Ionicons name="checkmark-done" size={24} color={theme.color.primaryText} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={confirmDeleteAll}
              accessibilityRole="button"
              accessibilityLabel="Delete all notifications"
              hitSlop={8}
            >
              <Ionicons name="trash-outline" size={22} color={theme.color.primaryText} />
            </Pressable>
          </View>
        ) : undefined
      }
    >
      <AsyncBoundary
        loading={list.loading}
        error={list.error}
        empty={!list.loading && items.length === 0}
        emptyMessage="You have no notifications yet."
        onRetry={list.reload}
      >
        <View style={styles.list}>
          {items.map((n) => {
            const m = metaFor(n.category);
            return (
              <Pressable
                key={n.id}
                style={[styles.card, n.isRead ? null : styles.cardUnread]}
                onPress={() => onOpen(n)}
                accessibilityRole="button"
                accessibilityLabel={`${n.title}${n.isRead ? '' : ', unread'}`}
              >
                <View style={[styles.iconTile, { backgroundColor: `${m.tint}1f` }]}>
                  <Ionicons name={m.icon} size={22} color={m.tint} />
                </View>
                <View style={styles.body}>
                  <Text style={[styles.title, n.isRead ? null : styles.titleUnread]} numberOfLines={1}>{n.title}</Text>
                  <Text style={styles.text} numberOfLines={3}>{n.body}</Text>
                  <Text style={styles.time}>{formatWhen(n.createdAtUtc)} · {humanizeCode(n.category)}</Text>
                </View>
                <View style={styles.cardRight}>
                  {n.isRead ? null : <View style={styles.dot} />}
                  <Pressable
                    onPress={async () => { if (await del.run(n.id)) list.reload(); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${n.title}`}
                    hitSlop={8}
                    style={styles.cardDelete}
                  >
                    <Ionicons name="trash-outline" size={18} color={theme.color.mutedText} />
                  </Pressable>
                </View>
              </Pressable>
            );
          })}
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
    </FormScreen>
  );
}

/** Friendly relative-ish time: "just now", "2h ago", or a local date for older items. */
function formatWhen(iso: string): string {
  const d = parseUtc(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  list: { gap: theme.spacing.md, marginBottom: theme.spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    ...theme.shadow.soft,
  },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: theme.color.primary },
  iconTile: { width: 44, height: 44, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  title: { fontSize: theme.fontSize.body, fontWeight: '700', color: theme.color.text },
  titleUnread: { fontWeight: '800' },
  text: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, lineHeight: 18 },
  time: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, marginTop: 2 },
  cardRight: { alignItems: 'center', gap: theme.spacing.sm },
  cardDelete: { padding: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.color.primary },
});
