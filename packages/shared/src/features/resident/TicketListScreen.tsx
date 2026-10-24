import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '../../ui/FormScreen';
import { AsyncBoundary } from '../../ui/AsyncBoundary';
import { Pager } from '../../ui/Pager';
import { useAsync } from '../../ui/hooks';
import { theme } from '../../ui/theme';
import { DEFAULT_PAGE_SIZE } from '../../models/query';
import type { PagedData } from '../../models/envelope';
import type { Ticket } from '../../models/helpdesk';
import type { ResourceClients } from '../../resources';
import { ticketStatusTone, humanizeCode } from '../shared/status';
import { TicketDetailScreen } from './TicketDetailScreen';

export interface TicketListScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

type TicketView = { name: 'list' } | { name: 'detail'; ticket: Ticket };

/**
 * Resident ticket list (Req 32.4, 34.1) — a modern, card-based surface mirroring the announcements
 * board. Shows the tickets the resident raised for their own unit, paginated and newest-first,
 * self-scoped server-side. Each ticket is a rich card (category icon tile + title + category ·
 * priority · date + status badge); tapping opens its detail (status, attachments, feedback) through
 * a small internal view switch so the app navigator keeps a single "My tickets" route.
 */
export function TicketListScreen({ resources, onBack }: TicketListScreenProps) {
  const [view, setView] = useState<TicketView>({ name: 'list' });
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useAsync<PagedData<Ticket>>(
    (signal) =>
      resources.helpdesk.listTickets({ page, pageSize: DEFAULT_PAGE_SIZE, sort: '-createdAtUtc' }, {}, { signal }),
    [page],
  );

  if (view.name === 'detail') {
    return (
      <TicketDetailScreen
        resources={resources}
        ticketId={view.ticket.id}
        initialTicket={view.ticket}
        onBack={() => {
          setView({ name: 'list' });
          reload();
        }}
      />
    );
  }

  const items = data?.items ?? [];

  return (
    <FormScreen
      title="My tickets"
      subtitle={data?.totalCount ? `${data.totalCount} ${data.totalCount === 1 ? 'ticket' : 'tickets'}` : 'Your requests'}
      {...(onBack ? { onBack } : {})}
    >
      <AsyncBoundary
        loading={loading}
        error={error}
        empty={!loading && items.length === 0}
        emptyMessage="You haven't raised any tickets yet."
        onRetry={reload}
      >
        <View style={styles.list}>
          {items.map((t) => {
            const tone = ticketStatusTone(t.status);
            const accent = toneColor(tone);
            return (
              <Pressable
                key={t.id}
                style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
                onPress={() => setView({ name: 'detail', ticket: t })}
                accessibilityRole="button"
                accessibilityLabel={t.title}
                accessibilityHint="Open ticket details"
              >
                {/* Left status accent rail (reference look). */}
                <View style={[styles.rail, { backgroundColor: accent }]} />

                {/* Top row: category title + tag on the left, status pill on the right. */}
                <View style={styles.topRow}>
                  <View style={styles.titleWrap}>
                    <View style={[styles.catDot, { backgroundColor: accent }]} />
                    <Text style={styles.title} numberOfLines={1}>{humanizeCode(t.category)}</Text>
                    <Text style={styles.catTag} numberOfLines={1}>· {humanizeCode(t.priority)}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: accent }]}>
                    <Text style={styles.statusPillText}>{humanizeCode(t.status).toUpperCase()}</Text>
                  </View>
                </View>

                {/* Complaint text. */}
                <Text style={styles.body} numberOfLines={2}>{t.title}</Text>

                {/* Footer with a hairline divider: raised meta + a chevron. */}
                <View style={styles.footer}>
                  <Ionicons name="time-outline" size={13} color={theme.color.mutedText} />
                  <Text style={styles.footerText} numberOfLines={1}>
                    Raised {formatDate(t.createdAtUtc)}
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Text style={[styles.openLink, { color: accent }]}>View</Text>
                  <Ionicons name="chevron-forward" size={15} color={accent} />
                </View>
              </Pressable>
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

/** Map a status tone to an accent color for the icon tile. */
function toneColor(tone: ReturnType<typeof ticketStatusTone>): string {
  switch (tone) {
    case 'positive': return theme.color.success;
    case 'warning': return theme.color.warning;
    case 'danger': return theme.color.danger;
    default: return theme.color.primary;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing.md, marginBottom: theme.spacing.md },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    paddingLeft: theme.spacing.lg + 4,
    gap: theme.spacing.sm,
    overflow: 'hidden',
    ...theme.shadow.soft,
  },
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },
  rail: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  title: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text, flexShrink: 1 },
  catTag: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, fontWeight: '600' },
  statusPill: { borderRadius: theme.radius.pill, paddingVertical: 4, paddingHorizontal: theme.spacing.md },
  statusPillText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  body: { fontSize: theme.fontSize.label, color: theme.color.text, lineHeight: 20 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.color.border,
  },
  footerText: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, fontWeight: '600' },
  openLink: { fontSize: theme.fontSize.caption, fontWeight: '800' },
});
