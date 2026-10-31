import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { parseUtc } from '@/utils/datetime';
import { FormSection } from '@/components/ui/FormSection';
import { AppTextField } from '@/components/ui/AppTextField';
import { AppButton } from '@/components/ui/AppButton';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { Badge } from '@/components/ui/Badge';
import { FormBanner } from '@/components/ui/FormBanner';
import { MasterDataDropdown } from '@/components/ui/MasterDataDropdown';
import { useAsync, useAsyncAction } from '@/hooks';
import { theme } from '@/theme';
import { MaintenanceMasterDataKeys, WorkOrderStatus } from '@/types/maintenance';
import type { WorkOrder, WorkOrderPart, WorkOrderLabour } from '@/types/maintenance';
import type { ResourceClients } from '@/services/resources';
import { workOrderStatusTone, humanizeCode } from '@/utils/status';

export interface WorkOrderDetailScreenProps {
  resources: ResourceClients;
  workOrderId: string;
  /** The row the staff tapped, shown immediately while the fresh copy loads. */
  initialWorkOrder?: WorkOrder;
  onBack?: () => void;
}

/**
 * Staff work-order detail (Req 36.3, 36.4) — redesigned to the shared card/section style. A status
 * hero card up top, then grouped {@link FormSection}s: change status (configurable
 * `Work_Order_Status` transition, illegal ones rejected server-side), assign/re-assign to a staff
 * user, and record parts + labour (Req 36.4 — totals computed server-side). Parts/labour re-fetch
 * after each add so the running list + totals stay current. No hardcoded status list.
 *
 * <p>Assignment takes the assignee's user id directly: there's no staff-user search client yet
 * (ponytail: YAGNI — the server validates the id names a valid assignee and returns a field error).</p>
 */
export function WorkOrderDetailScreen({ resources, workOrderId, initialWorkOrder, onBack }: WorkOrderDetailScreenProps) {
  const { data, loading, error, reload } = useAsync<WorkOrder>(
    (signal) => resources.maintenance.getWorkOrder(workOrderId, { signal }),
    [workOrderId],
  );
  const partsState = useAsync<WorkOrderPart[]>(
    (signal) => resources.maintenance.getWorkOrderParts(workOrderId, { signal }),
    [workOrderId],
  );
  const labourState = useAsync<WorkOrderLabour[]>(
    (signal) => resources.maintenance.getWorkOrderLabour(workOrderId, { signal }),
    [workOrderId],
  );

  const workOrder = data ?? initialWorkOrder ?? null;

  // --- Status change ---
  const [toStatus, setToStatus] = useState<string | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const changeStatus = useAsyncAction(() => {
    if (!toStatus) {
      return Promise.reject(new Error('Select a status'));
    }
    return resources.maintenance
      .changeWorkOrderStatus(workOrderId, {
        toStatus,
        ...(toStatus === WorkOrderStatus.Completed && completionNotes.trim()
          ? { completionNotes: completionNotes.trim() }
          : {}),
      })
      .then((w) => {
        setToStatus(null);
        setCompletionNotes('');
        reload();
        return w;
      });
  });

  // --- Assignment ---
  const [assignee, setAssignee] = useState('');
  const assign = useAsyncAction(() => {
    if (!assignee.trim()) {
      return Promise.reject(new Error('Enter an assignee'));
    }
    return resources.maintenance.assignWorkOrder(workOrderId, { assignedToUserId: assignee.trim() }).then((w) => {
      setAssignee('');
      reload();
      return w;
    });
  });

  // --- Add part ---
  const [partName, setPartName] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [partQty, setPartQty] = useState('');
  const [partUnitCost, setPartUnitCost] = useState('');
  const addPart = useAsyncAction(() => {
    const quantity = Number(partQty);
    const unitCost = Number(partUnitCost);
    if (!partName.trim() || Number.isNaN(quantity) || Number.isNaN(unitCost)) {
      return Promise.reject(new Error('Enter a part name, quantity and unit cost'));
    }
    return resources.maintenance
      .addWorkOrderPart(workOrderId, {
        partName: partName.trim(),
        ...(partNumber.trim() ? { partNumber: partNumber.trim() } : {}),
        quantity,
        unitCost,
      })
      .then((p) => {
        setPartName('');
        setPartNumber('');
        setPartQty('');
        setPartUnitCost('');
        partsState.reload();
        return p;
      });
  });

  // --- Add labour ---
  const [workerName, setWorkerName] = useState('');
  const [hours, setHours] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [labourNotes, setLabourNotes] = useState('');
  const addLabour = useAsyncAction(() => {
    const h = Number(hours.trim());
    const rate = Number(hourlyRate.trim());
    if (!workerName.trim() || hours.trim() === '' || hourlyRate.trim() === '' || !Number.isFinite(h) || !Number.isFinite(rate) || h <= 0 || rate < 0) {
      return Promise.reject(new Error('Enter a worker name, positive hours and a valid hourly rate'));
    }
    return resources.maintenance
      .addWorkOrderLabour(workOrderId, {
        workerName: workerName.trim(),
        hours: h,
        hourlyRate: rate,
        ...(labourNotes.trim() ? { notes: labourNotes.trim() } : {}),
      })
      .then((l) => {
        setWorkerName('');
        setHours('');
        setHourlyRate('');
        setLabourNotes('');
        labourState.reload();
        return l;
      });
  });

  const parts = partsState.data ?? [];
  const labour = labourState.data ?? [];

  return (
    <FormScreen title="Work order" subtitle={workOrder?.title ?? 'Details & progress'} {...(onBack ? { onBack } : {})}>
      <AsyncBoundary
        loading={loading && !workOrder}
        error={workOrder ? null : error}
        empty={!loading && !workOrder}
        emptyMessage="This work order could not be loaded."
        onRetry={reload}
      >
        {workOrder ? (
          <>
            {/* Status hero */}
            <View style={styles.hero}>
              <View style={styles.heroTop}>
                <View style={[styles.iconTile, { backgroundColor: `${theme.color.warning}1f` }]}>
                  <Ionicons name="construct" size={22} color={theme.color.warning} />
                </View>
                <View style={styles.heroText}>
                  <Text style={styles.heroTitle} numberOfLines={2}>{workOrder.title}</Text>
                  <Text style={styles.heroSub} numberOfLines={1}>
                    {humanizeCode(workOrder.workOrderType)} · {humanizeCode(workOrder.priority)} priority
                  </Text>
                </View>
                <Badge label={humanizeCode(workOrder.status)} tone={workOrderStatusTone(workOrder.status)} />
              </View>
              {workOrder.description ? <Text style={styles.heroDesc}>{workOrder.description}</Text> : null}
              {workOrder.assignedToUserId ? (
                <MetaRow icon="person-outline" label={`Assigned to ${workOrder.assignedToUserId}`} />
              ) : null}
              {workOrder.completedAtUtc ? (
                <MetaRow icon="checkmark-done-outline" label={`Completed ${formatDateTime(workOrder.completedAtUtc)}`} />
              ) : null}
              {workOrder.completionNotes ? (
                <MetaRow icon="document-text-outline" label={workOrder.completionNotes} />
              ) : null}
            </View>

            {/* Status change */}
            <FormSection title="Change status" icon="swap-vertical" tint={theme.color.primary}>
              <MasterDataDropdown
                label="New status"
                listKey={MaintenanceMasterDataKeys.WorkOrderStatus}
                masterData={resources.masterData}
                value={toStatus}
                onChange={setToStatus}
                placeholder="Select the next status"
              />
              {toStatus === WorkOrderStatus.Completed ? (
                <AppTextField
                  label="Completion notes (optional)"
                  value={completionNotes}
                  onChangeText={setCompletionNotes}
                  placeholder="What was done"
                  autoCapitalize="sentences"
                  multiline
                />
              ) : null}
              {changeStatus.error ? <FormBanner message={changeStatus.error.message} tone="error" /> : null}
              <AppButton
                title="Update status"
                loading={changeStatus.running}
                disabled={!toStatus}
                onPress={() => changeStatus.run()}
                accessibilityHint="Change this work order's status"
              />
            </FormSection>

            {/* Assignment */}
            <FormSection title="Assign" icon="person-add" tint={theme.color.info}>
              <AppTextField
                label="Assignee user id"
                value={assignee}
                onChangeText={setAssignee}
                placeholder="Maintenance staff user id"
                autoCapitalize="none"
                {...(assign.error?.fieldErrors.assignedToUserId ? { error: assign.error.fieldErrors.assignedToUserId } : {})}
              />
              {assign.error && !assign.error.fieldErrors.assignedToUserId ? (
                <FormBanner message={assign.error.message} tone="error" />
              ) : null}
              <AppButton
                title="Assign work order"
                variant="secondary"
                loading={assign.running}
                disabled={assignee.trim().length === 0}
                onPress={() => assign.run()}
                accessibilityHint="Assign or re-assign this work order"
              />
            </FormSection>

            {/* Parts */}
            <FormSection title="Parts" icon="hardware-chip-outline" tint="#8250df">
              <AsyncBoundary
                loading={partsState.loading}
                error={partsState.error}
                empty={!partsState.loading && parts.length === 0}
                emptyMessage="No parts recorded yet."
                onRetry={partsState.reload}
              >
                <View style={styles.lineList}>
                  {parts.map((p) => (
                    <LineRow
                      key={p.id}
                      title={p.partName}
                      sub={`${p.quantity} × ${p.unitCost}${p.partNumber ? ` · ${p.partNumber}` : ''}`}
                      total={String(p.lineTotal)}
                    />
                  ))}
                </View>
              </AsyncBoundary>
              <AppTextField label="Part name" value={partName} onChangeText={setPartName} placeholder="e.g. Pump seal" autoCapitalize="sentences" />
              <AppTextField label="Part number (optional)" value={partNumber} onChangeText={setPartNumber} placeholder="SKU / reference" autoCapitalize="characters" />
              <AppTextField label="Quantity" value={partQty} onChangeText={setPartQty} placeholder="0" keyboardType="numeric" />
              <AppTextField label="Unit cost" value={partUnitCost} onChangeText={setPartUnitCost} placeholder="0.00" keyboardType="numeric" />
              {addPart.error ? <FormBanner message={addPart.error.message} tone="error" /> : null}
              <AppButton
                title="Add part"
                variant="secondary"
                loading={addPart.running}
                onPress={() => addPart.run()}
                accessibilityHint="Record a part used on this work order"
              />
            </FormSection>

            {/* Labour */}
            <FormSection title="Labour" icon="time-outline" tint={theme.color.success}>
              <AsyncBoundary
                loading={labourState.loading}
                error={labourState.error}
                empty={!labourState.loading && labour.length === 0}
                emptyMessage="No labour recorded yet."
                onRetry={labourState.reload}
              >
                <View style={styles.lineList}>
                  {labour.map((l) => (
                    <LineRow
                      key={l.id}
                      title={l.workerName}
                      sub={`${l.hours}h × ${l.hourlyRate}${l.notes ? ` · ${l.notes}` : ''}`}
                      total={String(l.labourCost)}
                    />
                  ))}
                </View>
              </AsyncBoundary>
              <AppTextField label="Worker name" value={workerName} onChangeText={setWorkerName} placeholder="Technician name" autoCapitalize="words" />
              <AppTextField label="Hours" value={hours} onChangeText={setHours} placeholder="0" keyboardType="numeric" />
              <AppTextField label="Hourly rate" value={hourlyRate} onChangeText={setHourlyRate} placeholder="0.00" keyboardType="numeric" />
              <AppTextField label="Notes (optional)" value={labourNotes} onChangeText={setLabourNotes} placeholder="What was done" autoCapitalize="sentences" />
              {addLabour.error ? <FormBanner message={addLabour.error.message} tone="error" /> : null}
              <AppButton
                title="Add labour"
                variant="secondary"
                loading={addLabour.running}
                onPress={() => addLabour.run()}
                accessibilityHint="Record a labour entry on this work order"
              />
            </FormSection>
          </>
        ) : null}
      </AsyncBoundary>
    </FormScreen>
  );
}

/** A meta line in the status hero (icon + text). */
function MetaRow({ icon, label }: { icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.metaRow}>
      <Ionicons name={icon} size={15} color={theme.color.mutedText} />
      <Text style={styles.metaText}>{label}</Text>
    </View>
  );
}

/** A compact part/labour line: title + sub on the left, running total badge on the right. */
function LineRow({ title, sub, total }: { title: string; sub: string; total: string }) {
  return (
    <View style={styles.lineRow}>
      <View style={styles.lineBody}>
        <Text style={styles.lineTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.lineSub} numberOfLines={1}>{sub}</Text>
      </View>
      <Badge label={total} tone="neutral" />
    </View>
  );
}

function formatDateTime(iso: string): string {
  const d = parseUtc(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    ...theme.shadow.card,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  iconTile: { width: 48, height: 48, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  heroText: { flex: 1, gap: 2 },
  heroTitle: { fontSize: theme.fontSize.title, fontWeight: '800', color: theme.color.text },
  heroSub: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
  heroDesc: { fontSize: theme.fontSize.body, color: theme.color.text, lineHeight: 22 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { flex: 1, fontSize: theme.fontSize.label, color: theme.color.mutedText },
  lineList: { gap: theme.spacing.sm },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.color.background,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
  },
  lineBody: { flex: 1, gap: 2 },
  lineTitle: { fontSize: theme.fontSize.label, fontWeight: '700', color: theme.color.text },
  lineSub: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
});
