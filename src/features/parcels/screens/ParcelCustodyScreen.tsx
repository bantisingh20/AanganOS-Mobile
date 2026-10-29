import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { AppTextField } from '@/components/ui/AppTextField';
import { AppButton } from '@/components/ui/AppButton';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { Badge } from '@/components/ui/Badge';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Pager } from '@/components/ui/Pager';
import { FormBanner } from '@/components/ui/FormBanner';
import { useAsync, useAsyncAction } from '@/hooks';
import { theme } from '@/theme';
import { DEFAULT_PAGE_SIZE } from '@/types/query';
import type { PagedData } from '@/types/envelope';
import type { Parcel } from '@/types/parcel';
import { ParcelStatus } from '@/types/parcel';
import type { ResourceClients } from '@/services/resources';
import { parcelStatusTone, humanizeCode } from '@/utils/status';

export interface ParcelCustodyScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

/**
 * Guard assign-custody (Req 29.1, 29.4) — redesigned to the shared card + bottom-sheet style. Parcels
 * waiting to be moved into custody (default `received`) render as **product-row cards**; tapping one
 * opens a **keyboard-aware bottom sheet** to enter the custody location. The screen creates the
 * custody location in the parcel's community (an existing code replays as a CONFLICT the backend
 * surfaces) and then assigns it — matching the backend's "create custody-location, then assign" shape.
 * Only one parcel may actively hold a given location: a racing duplicate is rejected as CONFLICT.
 *
 * <p>No custody-location LIST endpoint exists yet, so the guard types the location code (ponytail:
 * don't invent a client call the backend doesn't expose; a picker can replace the field later).</p>
 */
export function ParcelCustodyScreen({ resources, onBack }: ParcelCustodyScreenProps) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Parcel | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsync<PagedData<Parcel>>(
    (signal) =>
      resources.parcels.listParcels(
        { page, pageSize: DEFAULT_PAGE_SIZE, sort: '-receivedAtUtc' },
        { status: ParcelStatus.Received },
        { signal },
      ),
    [page],
  );

  const items = data?.items ?? [];
  const total = data?.totalCount ?? 0;

  return (
    <FormScreen
      title="Assign custody"
      subtitle={total ? `${total} awaiting custody` : 'Parcels received at the gate'}
      {...(onBack ? { onBack } : {})}
    >
      {notice ? <FormBanner message={notice} tone="success" /> : null}

      <AsyncBoundary
        loading={loading}
        error={error}
        empty={!loading && items.length === 0}
        emptyMessage="No parcels are waiting to be moved into custody."
        onRetry={reload}
      >
        <View style={styles.list}>
          {items.map((p) => (
            <Pressable
              key={p.id}
              style={styles.card}
              onPress={() => {
                setNotice(null);
                setSelected(p);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Assign custody for ${p.trackingNumber}`}
            >
              <View style={[styles.iconTile, { backgroundColor: '#8250df1f' }]}>
                <Ionicons name="cube" size={22} color="#8250df" />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={1}>{p.trackingNumber}</Text>
                <Text style={styles.cardSub} numberOfLines={1}>
                  {p.provider} · {humanizeCode(p.category)}{p.isPriority ? ' · Priority' : ''}
                </Text>
              </View>
              <View style={styles.cardRight}>
                <Badge label={humanizeCode(p.status)} tone={parcelStatusTone(p.status)} />
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

      <AssignCustodySheet
        parcel={selected}
        resources={resources}
        onClose={() => setSelected(null)}
        onAssigned={(msg) => {
          setSelected(null);
          setNotice(msg);
          setPage(1);
          reload();
        }}
      />
    </FormScreen>
  );
}

/** Keyboard-aware bottom sheet to enter a custody location code and move the parcel into custody. */
function AssignCustodySheet({
  parcel,
  resources,
  onClose,
  onAssigned,
}: {
  parcel: Parcel | null;
  resources: ResourceClients;
  onClose: () => void;
  onAssigned: (message: string) => void;
}) {
  const [locationCode, setLocationCode] = useState('');
  useEffect(() => { if (parcel) setLocationCode(''); }, [parcel]);

  const assign = useAsyncAction(async () => {
    if (!parcel || locationCode.trim().length === 0) throw new Error('Missing fields');
    const code = locationCode.trim();
    const location = await resources.parcels.createCustodyLocation({ communityId: parcel.communityId, code });
    await resources.parcels.assignCustodyLocation(parcel.id, location.id);
    onAssigned(`Moved ${parcel.trackingNumber} into custody at ${code}.`);
  });

  return (
    <BottomSheet
      visible={parcel !== null}
      title="Move into custody"
      onClose={onClose}
      footer={
        <AppButton
          title="Move into custody"
          loading={assign.running}
          disabled={locationCode.trim().length === 0}
          onPress={() => assign.run()}
          accessibilityHint="Hold this parcel in the entered custody location"
        />
      }
    >
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScroll}>
        {parcel ? (
          <View style={styles.summary}>
            <Text style={styles.summaryTitle} numberOfLines={1}>{parcel.trackingNumber}</Text>
            <Text style={styles.summarySub} numberOfLines={1}>
              {parcel.provider} · {humanizeCode(parcel.category)}{parcel.isPriority ? ' · Priority' : ''}
            </Text>
          </View>
        ) : null}
        <AppTextField
          label="Custody location code"
          required
          value={locationCode}
          onChangeText={setLocationCode}
          placeholder="e.g. SHELF-A3 or LOCKER-12"
          autoCapitalize="characters"
          returnKeyType="done"
          editable={!assign.running}
          onSubmitEditing={() => locationCode.trim() && assign.run()}
          {...(assign.error?.fieldErrors.code ? { error: assign.error.fieldErrors.code } : {})}
        />
        {assign.error && !assign.error.fieldErrors.code ? (
          <FormBanner message={assign.error.message} tone="error" />
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
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

  sheetScroll: { gap: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.sm },
  summary: {
    backgroundColor: theme.color.background,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: 2,
  },
  summaryTitle: { fontSize: theme.fontSize.body, fontWeight: '800', color: theme.color.text },
  summarySub: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
});
