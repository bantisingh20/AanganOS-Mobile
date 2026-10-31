import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FormScreen } from '@/components/ui/FormScreen';
import { AppButton } from '@/components/ui/AppButton';
import { AppTextField } from '@/components/ui/AppTextField';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { Badge } from '@/components/ui/Badge';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { FormBanner } from '@/components/ui/FormBanner';
import { useAsync, useAsyncAction } from '@/hooks';
import { invalidateAsyncCache } from '@/hooks/useAsync';
import { theme } from '@/theme';
import { MyTaskType } from '@/types/myTasks';
import type { MyTaskCard, MyTaskSummaryItem, MaintenanceBill } from '@/types/myTasks';
import type { ResourceClients } from '@/services/resources';
import { useMyResident } from '@/features/profile/hooks/useMyResident';

export interface MyTasksScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
  onNavigate: (routeName: string) => void;
  initialType?: string;
}

const TYPE_LABELS: Record<string, string> = {
  [MyTaskType.WalkInApproval]: 'Walk-ins',
  [MyTaskType.ParcelPickup]: 'Parcels',
  [MyTaskType.MaintenanceDue]: 'Dues',
  [MyTaskType.KycPending]: 'Verification',
  [MyTaskType.ApprovedWalkInCheckIn]: 'Check-ins',
  [MyTaskType.ActiveSos]: 'SOS',
  [MyTaskType.ResidentToVerify]: 'Verify',
  [MyTaskType.OpenTicket]: 'Tickets',
  [MyTaskType.OverdueBill]: 'Overdue',
  [MyTaskType.PendingPaymentApproval]: 'Approvals',
};

function cardTint(type: string): string {
  switch (type) {
    case MyTaskType.ActiveSos:
      return theme.color.danger;
    case MyTaskType.MaintenanceDue:
    case MyTaskType.OverdueBill:
    case MyTaskType.PendingPaymentApproval:
      return '#d97706';
    default:
      return theme.color.primary;
  }
}

export function MyTasksScreen({ resources, onBack, onNavigate, initialType }: MyTasksScreenProps) {
  const [type, setType] = useState<string>(initialType ?? 'all');
  const [payBill, setPayBill] = useState<MyTaskCard | null>(null);
  const [rejectCard, setRejectCard] = useState<MyTaskCard | null>(null);
  const [reason, setReason] = useState('');

  const myResident = useMyResident(resources);
  const residentId = myResident.data?.resident?.id ?? null;

  const summary = useAsync<MyTaskSummaryItem[]>(
    (signal) => resources.myTasks.summary({ signal }),
    [resources],
    { cacheKey: 'tasks:summary' },
  );

  const cards = useAsync<MyTaskCard[]>(
    (signal) => resources.myTasks.cards(type, { signal }),
    [resources, type],
  );

  const reloadAll = () => {
    cards.reload();
    summary.reload();
    invalidateAsyncCache('tasks:');
    invalidateAsyncCache('dash:');
  };

  const approveWalkIn = useAsyncAction((id: string) => {
    if (!residentId) return Promise.reject(new Error('Only a resident can approve.'));
    return resources.gate.approveWalkIn(id, residentId);
  });
  const rejectWalkIn = useAsyncAction((id: string, r: string) => {
    if (!residentId) return Promise.reject(new Error('Only a resident can reject.'));
    return resources.gate.rejectWalkIn(id, residentId, r || undefined);
  });
  const checkIn = useAsyncAction((visitorId: string) => resources.gate.recordEntry({ visitorId }));
  const resolveSos = useAsyncAction((id: string) => resources.securityOps.resolveSos(id, residentId ?? ''));
  const verifyResident = useAsyncAction((id: string) => resources.residents.approve(id));

  const summaryItems = summary.data ?? [];
  const totalCount = useMemo(() => summaryItems.reduce((s, i) => s + i.count, 0), [summaryItems]);
  const cardItems = cards.data ?? [];

  const filterTypes = useMemo(() => ['all', ...summaryItems.map((i) => i.type)], [summaryItems]);

  const submitReject = async () => {
    if (!rejectCard) return;
    if (await rejectWalkIn.run(rejectCard.id, reason.trim())) {
      setRejectCard(null);
      setReason('');
      reloadAll();
    }
  };

  const renderActions = (c: MyTaskCard) => {
    switch (c.type) {
      case MyTaskType.WalkInApproval:
        return (
          <View style={styles.actionRow}>
            <View style={styles.flex}>
              <AppButton
                title="Approve"
                loading={approveWalkIn.running}
                onPress={async () => { if (await approveWalkIn.run(c.id)) reloadAll(); }}
              />
            </View>
            <View style={styles.flex}>
              <AppButton title="Reject" variant="secondary" onPress={() => { setReason(''); setRejectCard(c); }} />
            </View>
          </View>
        );
      case MyTaskType.MaintenanceDue:
        return (
          <AppButton title="Pay now" onPress={() => setPayBill(c)} />
        );
      case MyTaskType.ApprovedWalkInCheckIn:
        return (
          <AppButton
            title="Check in"
            loading={checkIn.running}
            onPress={async () => { if (await checkIn.run(c.id)) reloadAll(); }}
          />
        );
      case MyTaskType.ActiveSos:
        return (
          <AppButton
            title="Resolve"
            loading={resolveSos.running}
            onPress={async () => { if (await resolveSos.run(c.id)) reloadAll(); }}
          />
        );
      case MyTaskType.ResidentToVerify:
        return (
          <View style={styles.actionRow}>
            <View style={styles.flex}>
              <AppButton
                title="Verify"
                loading={verifyResident.running}
                onPress={async () => { if (await verifyResident.run(c.id)) reloadAll(); }}
              />
            </View>
            <View style={styles.flex}>
              <AppButton title="View" variant="secondary" onPress={() => onNavigate('queue')} />
            </View>
          </View>
        );
      case MyTaskType.KycPending:
        return <AppButton title="Complete verification" onPress={() => onNavigate('kyc')} />;
      case MyTaskType.ParcelPickup:
        return <AppButton title="View details" variant="secondary" onPress={() => onNavigate('myParcels')} />;
      case MyTaskType.OpenTicket:
        return <AppButton title="View details" variant="secondary" onPress={() => onNavigate('myTickets')} />;
      default:
        return null;
    }
  };

  return (
    <FormScreen
      title="Need to action"
      subtitle={totalCount > 0 ? `${totalCount} item${totalCount === 1 ? '' : 's'}` : 'You are all caught up'}
      {...(onBack ? { onBack } : {})}
    >
      <View style={styles.chipRow}>
        {filterTypes.map((t) => {
          const active = type === t;
          return (
            <Pressable
              key={t}
              onPress={() => setType(t)}
              style={[styles.chip, active ? styles.chipActive : null]}
            >
              <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                {t === 'all' ? 'All' : TYPE_LABELS[t] ?? t}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {approveWalkIn.error ? <FormBanner message={approveWalkIn.error.message} tone="error" /> : null}
      {checkIn.error ? <FormBanner message={checkIn.error.message} tone="error" /> : null}
      {resolveSos.error ? <FormBanner message={resolveSos.error.message} tone="error" /> : null}
      {verifyResident.error ? <FormBanner message={verifyResident.error.message} tone="error" /> : null}

      <AsyncBoundary
        loading={cards.loading}
        error={cards.error}
        empty={!cards.loading && cardItems.length === 0}
        emptyMessage="Nothing needs your attention right now."
        onRetry={cards.reload}
      >
        <View style={styles.list}>
          {cardItems.map((c) => (
            <View key={`${c.type}-${c.id}`} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={[styles.cardDot, { backgroundColor: cardTint(c.type) }]} />
                <View style={styles.flex}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{c.title}</Text>
                  <Text style={styles.cardSub} numberOfLines={1}>{c.subtitle}</Text>
                  {c.meta ? <Text style={styles.cardMeta} numberOfLines={1}>{c.meta}</Text> : null}
                </View>
                {c.amount != null ? <Text style={styles.cardAmount}>{c.amount.toFixed(2)}</Text> : null}
                {c.status ? <Badge label={c.status.replace('_', ' ')} tone="neutral" /> : null}
              </View>
              {renderActions(c)}
            </View>
          ))}
        </View>
      </AsyncBoundary>

      {payBill ? (
        <PaySheet
          resources={resources}
          card={payBill}
          onClose={() => setPayBill(null)}
          onDone={() => { setPayBill(null); reloadAll(); }}
        />
      ) : null}

      <BottomSheet
        visible={rejectCard !== null}
        title="Reject walk-in"
        onClose={() => setRejectCard(null)}
        footer={
          <AppButton title="Reject" loading={rejectWalkIn.running} onPress={submitReject} />
        }
      >
        <AppTextField label="Reason (optional)" value={reason} onChangeText={setReason} multiline />
      </BottomSheet>
    </FormScreen>
  );
}

function PaySheet({
  resources,
  card,
  onClose,
  onDone,
}: {
  resources: ResourceClients;
  card: MyTaskCard;
  onClose: () => void;
  onDone: () => void;
}) {
  const [method, setMethod] = useState('upi');
  const [reference, setReference] = useState('');

  const pay = useAsyncAction(() =>
    resources.maintenanceBills.submitPayment({
      maintenanceBillId: card.id,
      amount: card.amount ?? 0,
      method,
      reference: reference.trim() || undefined,
    }),
  );

  const submit = async () => {
    if (await pay.run()) onDone();
  };

  const methods = ['upi', 'cash', 'cheque', 'bank_transfer', 'online'];

  return (
    <BottomSheet
      visible
      title={`Pay ${(card.amount ?? 0).toFixed(2)}`}
      onClose={onClose}
      footer={<AppButton title="Submit for approval" loading={pay.running} onPress={submit} />}
    >
      {pay.error ? <FormBanner message={pay.error.message} tone="error" /> : null}
      <Text style={styles.payHint}>Your payment is sent to the admin for approval. The bill is marked paid once approved.</Text>
      <View style={styles.chipRow}>
        {methods.map((m) => (
          <Pressable key={m} onPress={() => setMethod(m)} style={[styles.chip, method === m ? styles.chipActive : null]}>
            <Text style={[styles.chipText, method === m ? styles.chipTextActive : null]}>{m.replace('_', ' ')}</Text>
          </Pressable>
        ))}
      </View>
      <AppTextField label="Reference (optional)" value={reference} onChangeText={setReference} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs, marginBottom: theme.spacing.sm },
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.color.accentSoft,
  },
  chipActive: { backgroundColor: theme.color.primary },
  chipText: { fontSize: theme.fontSize.label, color: theme.color.text },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  list: { gap: theme.spacing.sm },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  cardDot: { width: 10, height: 10, borderRadius: 5 },
  flex: { flex: 1 },
  cardTitle: { fontSize: theme.fontSize.body, fontWeight: '700', color: theme.color.text },
  cardSub: { fontSize: theme.fontSize.label, color: theme.color.mutedText },
  cardMeta: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
  cardAmount: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  actionRow: { flexDirection: 'row', gap: theme.spacing.sm },
  payHint: { fontSize: theme.fontSize.label, color: theme.color.mutedText, marginBottom: theme.spacing.sm },
});
