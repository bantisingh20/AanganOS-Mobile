import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { parseUtc } from '@/utils/datetime';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { Badge } from '@/components/ui/Badge';
import { Pager } from '@/components/ui/Pager';
import { useAsync } from '@/hooks';
import { theme } from '@/theme';
import { DEFAULT_PAGE_SIZE } from '@/types/query';
import type { PagedData } from '@/types/envelope';
import type { Announcement } from '@/types/announcement';
import type { ResourceClients } from '@/services/resources';
import { announcementCategoryTone, humanizeCode } from '@/utils/status';

export interface AnnouncementsScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

/** A per-category icon so each notice reads at a glance. */
function categoryIcon(code: string): keyof typeof Ionicons.glyphMap {
  switch (code) {
    case 'event': return 'calendar';
    case 'maintenance': return 'construct';
    case 'emergency': return 'warning';
    default: return 'megaphone';
  }
}

/**
 * Resident community notice board (MVP notices slice). Lists the announcements published for the
 * resident's community, newest-first and paginated, as rich **cards** that show everything inline —
 * a category chip, the title, the published date, and the FULL message body — so a resident reads a
 * notice without tapping through to a separate detail page. The list is tenant-scoped server-side (a
 * resident only sees their own community's active board), so no scope is passed. Read-only — the
 * board is published by the community admin, not the resident.
 */
export function AnnouncementsScreen({ resources, onBack }: AnnouncementsScreenProps) {
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useAsync<PagedData<Announcement>>(
    (signal) =>
      resources.announcements.list({ page, pageSize: DEFAULT_PAGE_SIZE, sort: 'publishedAtUtc:desc' }, {}, { signal }),
    [page],
  );

  const items = data?.items ?? [];

  return (
    <FormScreen
      title="Announcements"
      subtitle={data?.totalCount ? `${data.totalCount} ${data.totalCount === 1 ? 'notice' : 'notices'}` : 'Community notice board'}
      {...(onBack ? { onBack } : {})}
    >
      <AsyncBoundary
        loading={loading}
        error={error}
        empty={!loading && items.length === 0}
        emptyMessage="No announcements yet. Community notices will appear here."
        onRetry={reload}
      >
        <View style={styles.list}>
          {items.map((a) => {
            const tone = announcementCategoryTone(a.category);
            return (
              <View key={a.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconTile, { backgroundColor: `${toneColor(tone)}1f` }]}>
                    <Ionicons name={categoryIcon(a.category)} size={20} color={toneColor(tone)} />
                  </View>
                  <View style={styles.headerText}>
                    <Text style={styles.title}>{a.title}</Text>
                    <Text style={styles.date}>{formatDateTime(a.publishedAtUtc)}</Text>
                  </View>
                  <Badge label={humanizeCode(a.category)} tone={tone} />
                </View>
                <Text style={styles.body}>{a.body}</Text>
              </View>
            );
          })}
        </View>
        {data ? (
          <Pager
            page={data.page}
            pageSize={data.pageSize}
            totalCount={data.totalCount}
            onPageChange={setPage}
            disabled={loading}
          />
        ) : null}
      </AsyncBoundary>
    </FormScreen>
  );
}

/** Map a badge tone to its accent color for the icon tile (keeps the card color-coordinated). */
function toneColor(tone: ReturnType<typeof announcementCategoryTone>): string {
  switch (tone) {
    case 'positive': return theme.color.success;
    case 'warning': return theme.color.warning;
    case 'danger': return theme.color.danger;
    default: return theme.color.primary;
  }
}

function formatDateTime(iso: string): string {
  const d = parseUtc(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing.md, marginBottom: theme.spacing.md },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    ...theme.shadow.soft,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  iconTile: { width: 40, height: 40, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  date: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
  body: { fontSize: theme.fontSize.body, color: theme.color.text, lineHeight: 22 },
});
