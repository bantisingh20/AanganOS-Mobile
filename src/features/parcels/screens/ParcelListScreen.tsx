import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FormScreen } from '@/components/ui/FormScreen';
import { AppButton } from '@/components/ui/AppButton';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { EntityCard, type MetaChip } from '@/components/ui/EntityCard';
import { Pager } from '@/components/ui/Pager';
import { useAsync } from '@/hooks';
import { theme } from '@/theme';
import { DEFAULT_PAGE_SIZE } from '@/types/query';
import type { PagedData } from '@/types/envelope';
import type { Parcel } from '@/types/parcel';
import { ParcelStatus } from '@/types/parcel';
import type { ResourceClients } from '@/services/resources';
import { parcelStatusTone, humanizeCode } from '@/utils/status';
import { AuthorizeCollectorScreen } from './AuthorizeCollectorScreen';
import { ParcelTimelineScreen } from './ParcelTimelineScreen';

export interface ParcelListScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

type ParcelView = { name: 'list' } | { name: 'authorize'; parcel: Parcel } | { name: 'timeline'; parcel: Parcel };

/**
 * Resident parcel list (Req 28.5, 30.1, 31.5) — a modern, card-based surface. Shows the parcels
 * addressed to the resident's own unit, paginated and newest-first; the list is self-scoped
 * server-side. Each parcel is an {@link EntityCard} (cube icon, tracking number, provider/category/
 * date meta chips, priority + status badges) with inline "Authorize collector" / "Timeline" actions.
 * Authorize + timeline are reached through a small internal view switch so the app navigator keeps a
 * single "My parcels" route.
 */
export function ParcelListScreen({ resources, onBack }: ParcelListScreenProps) {
  const [view, setView] = useState<ParcelView>({ name: 'list' });
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useAsync<PagedData<Parcel>>(
    (signal) =>
      resources.parcels.listParcels({ page, pageSize: DEFAULT_PAGE_SIZE, sort: 'receivedAtUtc:desc' }, {}, { signal }),
    [page],
  );

  if (view.name === 'authorize') {
    return (
      <AuthorizeCollectorScreen
        resources={resources}
        parcel={view.parcel}
        onBack={() => {
          setView({ name: 'list' });
          reload();
        }}
      />
    );
  }
  if (view.name === 'timeline') {
    return (
      <ParcelTimelineScreen resources={resources} parcel={view.parcel} onBack={() => setView({ name: 'list' })} />
    );
  }

  const items = data?.items ?? [];

  return (
    <FormScreen
      title="My parcels"
      subtitle={data ? `${data.totalCount} ${data.totalCount === 1 ? 'parcel' : 'parcels'}` : 'Deliveries to your unit'}
      {...(onBack ? { onBack } : {})}
    >
      <AsyncBoundary
        loading={loading}
        error={error}
        empty={!loading && items.length === 0}
        emptyMessage="No parcels have been delivered to your unit yet."
        onRetry={reload}
      >
        <View style={styles.list}>
          {items.map((p) => {
            const meta: MetaChip[] = [
              { icon: 'business-outline', label: p.provider },
              { icon: 'pricetag-outline', label: humanizeCode(p.category) },
              { icon: 'time-outline', label: formatDate(p.receivedAtUtc) },
            ];
            if (p.isPriority) meta.push({ icon: 'flash-outline', label: 'Priority' });
            return (
              <EntityCard
                key={p.id}
                title={p.trackingNumber}
                icon="cube"
                tint="#cf5500"
                badge={{ label: humanizeCode(p.status), tone: parcelStatusTone(p.status) }}
                meta={meta}
              >
                <View style={styles.actions}>
                  {canAuthorize(p) ? (
                    <View style={styles.flex}>
                      <AppButton
                        title="Authorize collector"
                        variant="secondary"
                        onPress={() => setView({ name: 'authorize', parcel: p })}
                        accessibilityHint={`Authorize someone to collect ${p.trackingNumber}`}
                      />
                    </View>
                  ) : null}
                  <View style={styles.flex}>
                    <AppButton
                      title="Timeline"
                      variant="secondary"
                      onPress={() => setView({ name: 'timeline', parcel: p })}
                      accessibilityHint={`View the custody timeline for ${p.trackingNumber}`}
                    />
                  </View>
                </View>
              </EntityCard>
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

/** A collector can be authorized while the parcel is still in the community's custody (not terminal). */
function canAuthorize(p: Parcel): boolean {
  return (
    p.status === ParcelStatus.Received ||
    p.status === ParcelStatus.InCustody ||
    p.status === ParcelStatus.ReadyForPickup ||
    p.status === ParcelStatus.OwnerNotAvailable
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing.md, marginBottom: theme.spacing.md },
  actions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  flex: { flex: 1 },
});
