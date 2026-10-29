import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { Badge } from '@/components/ui/Badge';
import { Pager } from '@/components/ui/Pager';
import { MasterDataDropdown } from '@/components/ui/MasterDataDropdown';
import { useAsync } from '@/hooks';
import { theme } from '@/theme';
import { DEFAULT_PAGE_SIZE } from '@/types/query';
import { MaintenanceMasterDataKeys } from '@/types/maintenance';
import type { PagedData } from '@/types/envelope';
import type { WorkOrder } from '@/types/maintenance';
import type { ResourceClients } from '@/services/resources';
import { workOrderStatusTone, humanizeCode } from '@/utils/status';
import { WorkOrderDetailScreen } from './WorkOrderDetailScreen';

export interface WorkOrderListScreenProps {
  resources: ResourceClients;
  /** Narrow the list to one asset's work orders (e.g. opened from the asset lookup). */
  assetId?: string;
  /** Optional heading override, e.g. when scoped to one asset. */
  title?: string;
  onBack?: () => void;
}

type WorkOrderView = { name: 'list' } | { name: 'detail'; workOrder: WorkOrder };

/**
 * Staff work-order list (Req 36.2, 36.3) — redesigned to the shared card style. Lists the maintenance
 * work orders in the staff member's authorized communities, newest-first and paginated, with a
 * configurable-status filter (from the `Work_Order_Status` master-data list — never hardcoded).
 * Tapping a **product-row card** opens its detail (status/assign/parts/labour) through a small
 * internal view switch so the app navigator keeps a single route. An optional `assetId` narrows the
 * list to one asset's orders. Tenant-scoped server-side.
 */
export function WorkOrderListScreen({ resources, assetId, title, onBack }: WorkOrderListScreenProps) {
  const [view, setView] = useState<WorkOrderView>({ name: 'list' });
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useAsync<PagedData<WorkOrder>>(
    (signal) =>
      resources.maintenance.listWorkOrders(
        { page, pageSize: DEFAULT_PAGE_SIZE, sort: '-createdAtUtc' },
        { ...(status ? { status } : {}), ...(assetId ? { assetId } : {}) },
        { signal },
      ),
    [page, status, assetId],
  );

  if (view.name === 'detail') {
    return (
      <WorkOrderDetailScreen
        resources={resources}
        workOrderId={view.workOrder.id}
        initialWorkOrder={view.workOrder}
        onBack={() => {
          setView({ name: 'list' });
          reload();
        }}
      />
    );
  }

  const items = data?.items ?? [];
  const total = data?.totalCount ?? 0;

  return (
    <FormScreen
      title={title ?? 'Work orders'}
      subtitle={total ? `${total} ${total === 1 ? 'job' : 'jobs'}` : 'Jobs to do & their status'}
      {...(onBack ? { onBack } : {})}
    >
      <MasterDataDropdown
        label="Filter by status"
        listKey={MaintenanceMasterDataKeys.WorkOrderStatus}
        masterData={resources.masterData}
        value={status}
        onChange={(s) => {
          setPage(1);
          setStatus(s);
        }}
        placeholder="All statuses"
        allowClear
        clearLabel="All statuses"
      />

      <AsyncBoundary
        loading={loading}
        error={error}
        empty={!loading && items.length === 0}
        emptyMessage="No work orders match."
        onRetry={reload}
      >
        <View style={styles.list}>
          {items.map((w) => (
            <Pressable
              key={w.id}
              style={styles.card}
              onPress={() => setView({ name: 'detail', workOrder: w })}
              accessibilityRole="button"
              accessibilityLabel={`Open work order ${w.title}`}
            >
              <View style={[styles.iconTile, { backgroundColor: `${theme.color.warning}1f` }]}>
                <Ionicons name="construct" size={22} color={theme.color.warning} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={1}>{w.title}</Text>
                <Text style={styles.cardSub} numberOfLines={1}>
                  {humanizeCode(w.workOrderType)} · {humanizeCode(w.priority)} · raised {formatDate(w.createdAtUtc)}
                </Text>
              </View>
              <View style={styles.cardRight}>
                <Badge label={humanizeCode(w.status)} tone={workOrderStatusTone(w.status)} />
                <Ionicons name="chevron-forward" size={18} color={theme.color.mutedText} />
              </View>
            </Pressable>
          ))}
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing.md, marginBottom: theme.spacing.md },
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
  cardRight: { alignItems: 'flex-end', gap: theme.spacing.xs },
});
