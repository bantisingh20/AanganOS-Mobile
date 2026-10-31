import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { parseUtc } from '@/utils/datetime';
import { FormSection } from '@/components/ui/FormSection';
import { AppTextField } from '@/components/ui/AppTextField';
import { AppButton } from '@/components/ui/AppButton';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { Badge } from '@/components/ui/Badge';
import { Pager } from '@/components/ui/Pager';
import { FormBanner } from '@/components/ui/FormBanner';
import { PhotoPicker } from '@/components/ui/PhotoPicker';
import { useAsync, useAsyncAction } from '@/hooks';
import { theme } from '@/theme';
import { DEFAULT_PAGE_SIZE } from '@/types/query';
import type { PagedData } from '@/types/envelope';
import type { Parcel, ParcelHandover } from '@/types/parcel';
import { ParcelStatus } from '@/types/parcel';
import type { ResourceClients, PerformHandoverBody } from '@/services/resources';
import { newIdempotencyKey } from '@/services/resources';
import { ApiRequestError } from '@/services/api/errors';
import { parcelStatusTone, humanizeCode } from '@/utils/status';

export interface ParcelHandoverScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

/** Which action the selected parcel is in. */
type DetailMode = 'handover' | 'lostDamaged' | 'returned';

/**
 * Guard verified handover + custody outcomes (Req 30.2–30.5, 31.3, 31.4) — redesigned to the shared
 * card style. Parcels ready to hand over (in custody / ready for pickup) list as **product-row
 * cards**; tapping one opens a detail with a parcel summary card and a pill segmented control for the
 * three actions: a verified handover (authorization id + whatever the collector presents — OTP, QR
 * token and/or ID reference), record lost/damaged (raises a linked incident, Req 31.3), or returned
 * to the provider (Req 31.4). The backend verifies the collector against the authorization's method;
 * a failed verification leaves the parcel unchanged (Req 30.3).
 *
 * <p><b>Connectivity-REQUIRED (Req 30.5).</b> A handover is NEVER queued offline. On a transport
 * failure the screen says "reconnect and retry". It carries a STABLE `Idempotency-Key` per attempt
 * (generated once when the parcel is selected, held in a ref), so a retry hands the parcel over at
 * most once and replays the first result.</p>
 */
export function ParcelHandoverScreen({ resources, onBack }: ParcelHandoverScreenProps) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Parcel | null>(null);
  const [mode, setMode] = useState<DetailMode>('handover');
  const [authorizationId, setAuthorizationId] = useState('');
  const [otp, setOtp] = useState('');
  const [qrToken, setQrToken] = useState('');
  const [idReference, setIdReference] = useState('');
  const [proofFileId, setProofFileId] = useState<string | null>(null);
  const [circumstances, setCircumstances] = useState('');
  const [evidenceFileId, setEvidenceFileId] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [done, setDone] = useState<ParcelHandover | null>(null);
  const [outcomeNotice, setOutcomeNotice] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  // Stable at-most-once key for the CURRENT handover attempt; reused across retries (Req 30.5).
  const keyRef = useRef<string>(newIdempotencyKey());

  const { data, loading, error, reload } = useAsync<PagedData<Parcel>>(
    (signal) =>
      resources.parcels.listParcels({ page, pageSize: DEFAULT_PAGE_SIZE, sort: '-receivedAtUtc' }, {}, { signal }),
    [page],
  );

  const handover = useAsyncAction(async () => {
    if (!selected || authorizationId.trim().length === 0) {
      throw new Error('Missing fields');
    }
    const body: PerformHandoverBody = {
      parcelAuthorizationId: authorizationId.trim(),
      ...(otp.trim() ? { otp: otp.trim() } : {}),
      ...(qrToken.trim() ? { qrToken: qrToken.trim() } : {}),
      ...(idReference.trim() ? { presentedIdReference: idReference.trim() } : {}),
      ...(proofFileId ? { proofFileId } : {}),
    };
    setOffline(false);
    try {
      const result = await resources.parcels.performHandover(selected.id, body, keyRef.current);
      setDone(result);
      reload();
      return result;
    } catch (err) {
      // Connectivity-required: flag a transport failure so the UI says "reconnect and retry". The
      // SAME stable key is kept, so the retry performs the handover at most once (Req 30.5).
      if (isTransport(err)) {
        setOffline(true);
      }
      throw err;
    }
  });

  const lostDamaged = useAsyncAction(async () => {
    if (!selected || circumstances.trim().length === 0) {
      throw new Error('Missing fields');
    }
    await resources.parcels.recordLostDamaged(selected.id, {
      circumstances: circumstances.trim(),
      ...(evidenceFileId ? { evidenceFileId } : {}),
    });
    setOutcomeNotice(`Recorded ${selected.trackingNumber} as lost / damaged and raised a linked incident.`);
    reload();
  });

  const returned = useAsyncAction(async () => {
    if (!selected) {
      throw new Error('No parcel');
    }
    await resources.parcels.recordReturned(selected.id, {
      ...(returnReason.trim() ? { reason: returnReason.trim() } : {}),
    });
    setOutcomeNotice(`Recorded ${selected.trackingNumber} as returned to the provider.`);
    reload();
  });

  const items = (data?.items ?? []).filter(canHandOver);

  const openParcel = (p: Parcel) => {
    setSelected(p);
    setMode('handover');
    setAuthorizationId('');
    setOtp('');
    setQrToken('');
    setIdReference('');
    setProofFileId(null);
    setCircumstances('');
    setEvidenceFileId(null);
    setReturnReason('');
    setDone(null);
    setOutcomeNotice(null);
    setOffline(false);
    keyRef.current = newIdempotencyKey(); // fresh stable key per new handover intent
    handover.reset();
    lostDamaged.reset();
    returned.reset();
  };

  const closeParcel = () => {
    setSelected(null);
    handover.reset();
    lostDamaged.reset();
    returned.reset();
  };

  const switchMode = (m: DetailMode) => {
    setMode(m);
    setOutcomeNotice(null);
    handover.reset();
    lostDamaged.reset();
    returned.reset();
  };

  if (selected) {
    const finished = done || outcomeNotice;
    const photoUpload = { owningResourceType: 'Parcel', communityId: selected.communityId, owningResourceId: selected.id };
    return (
      <FormScreen title="Verified handover" subtitle="Release a parcel to a resident" onBack={closeParcel}>
        <View style={styles.summaryCard}>
          <View style={[styles.iconTile, { backgroundColor: '#1f6feb1f' }]}>
            <Ionicons name="cube" size={22} color="#1f6feb" />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={1}>{selected.trackingNumber}</Text>
            <Text style={styles.cardSub} numberOfLines={1}>{selected.provider} · {humanizeCode(selected.category)}</Text>
          </View>
          <Badge label={humanizeCode(selected.status)} tone={parcelStatusTone(selected.status)} />
        </View>

        {finished ? (
          <>
            <FormBanner
              message={
                done
                  ? `Handed over to ${done.collectorName} at ${formatDateTime(done.handedOverAtUtc)} (verified by ${humanizeCode(done.verificationMethod)}).`
                  : outcomeNotice ?? ''
              }
              tone="success"
            />
            <AppButton title="Back to list" onPress={closeParcel} accessibilityHint="Return to the handover list" />
          </>
        ) : (
          <>
            <View style={styles.segment} accessibilityRole="tablist">
              <SegTab label="Hand over" active={mode === 'handover'} onPress={() => switchMode('handover')} />
              <SegTab label="Lost / damaged" active={mode === 'lostDamaged'} onPress={() => switchMode('lostDamaged')} />
              <SegTab label="Returned" active={mode === 'returned'} onPress={() => switchMode('returned')} />
            </View>

            {mode === 'handover' ? (
              <FormSection title="Verified handover" subtitle="Must be done online — never saved offline" icon="hand-left" tint="#1f6feb">
                <AppTextField
                  label="Authorization id"
                  required
                  value={authorizationId}
                  onChangeText={setAuthorizationId}
                  placeholder="The resident's authorization id"
                  autoCapitalize="none"
                  {...(handover.error?.fieldErrors.parcelAuthorizationId
                    ? { error: handover.error.fieldErrors.parcelAuthorizationId }
                    : {})}
                />
                <AppTextField
                  label="OTP"
                  value={otp}
                  onChangeText={setOtp}
                  placeholder="One-time code the collector presents"
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  {...(handover.error?.fieldErrors.otp ? { error: handover.error.fieldErrors.otp } : {})}
                />
                <AppTextField
                  label="QR token"
                  value={qrToken}
                  onChangeText={setQrToken}
                  placeholder="Scan or paste the collector's QR token"
                  autoCapitalize="none"
                  {...(handover.error?.fieldErrors.qrToken ? { error: handover.error.fieldErrors.qrToken } : {})}
                />
                <AppTextField
                  label="ID reference"
                  value={idReference}
                  onChangeText={setIdReference}
                  placeholder="Government / photo-ID reference"
                  autoCapitalize="characters"
                  {...(handover.error?.fieldErrors.presentedIdReference
                    ? { error: handover.error.fieldErrors.presentedIdReference }
                    : {})}
                />
                <PhotoPicker
                  label="Handover proof (optional)"
                  files={resources.files}
                  upload={photoUpload}
                  value={proofFileId}
                  onChange={setProofFileId}
                  disabled={handover.running}
                />
                {handover.error ? (
                  <FormBanner
                    message={
                      offline
                        ? 'Can\u2019t reach the server. A handover must be online — reconnect and try again (this won\u2019t hand the parcel over twice).'
                        : handover.error.message || 'Verification failed. The parcel was not handed over.'
                    }
                    tone="error"
                  />
                ) : null}
                <AppButton
                  title="Confirm handover"
                  loading={handover.running}
                  disabled={authorizationId.trim().length === 0}
                  onPress={() => handover.run()}
                  accessibilityHint="Verify the collector and hand over the parcel"
                />
              </FormSection>
            ) : mode === 'lostDamaged' ? (
              <FormSection title="Lost / damaged" subtitle="Raises a linked incident" icon="warning" tint={theme.color.danger}>
                <AppTextField
                  label="Circumstances"
                  required
                  value={circumstances}
                  onChangeText={setCircumstances}
                  placeholder="What happened to the parcel?"
                  multiline
                  {...(lostDamaged.error?.fieldErrors.circumstances
                    ? { error: lostDamaged.error.fieldErrors.circumstances }
                    : {})}
                />
                <PhotoPicker
                  label="Evidence (optional)"
                  files={resources.files}
                  upload={photoUpload}
                  value={evidenceFileId}
                  onChange={setEvidenceFileId}
                  disabled={lostDamaged.running}
                />
                {lostDamaged.error && !lostDamaged.error.fieldErrors.circumstances ? (
                  <FormBanner message={lostDamaged.error.message} tone="error" />
                ) : null}
                <AppButton
                  title="Record lost / damaged"
                  variant="danger"
                  loading={lostDamaged.running}
                  disabled={circumstances.trim().length === 0}
                  onPress={() => lostDamaged.run()}
                  accessibilityHint="Record this parcel as lost or damaged and raise a linked incident"
                />
              </FormSection>
            ) : (
              <FormSection title="Returned to provider" icon="arrow-undo" tint={theme.color.warning}>
                <AppTextField
                  label="Reason (optional)"
                  value={returnReason}
                  onChangeText={setReturnReason}
                  placeholder="Why is the parcel being returned?"
                  multiline
                />
                {returned.error ? <FormBanner message={returned.error.message} tone="error" /> : null}
                <AppButton
                  title="Record returned"
                  loading={returned.running}
                  onPress={() => returned.run()}
                  accessibilityHint="Record this parcel as returned to the delivery provider"
                />
              </FormSection>
            )}
          </>
        )}
      </FormScreen>
    );
  }

  const total = items.length;

  return (
    <FormScreen
      title="Verified handover"
      subtitle={total ? `${total} ready to hand over` : 'Release parcels to residents'}
      {...(onBack ? { onBack } : {})}
    >
      <AsyncBoundary
        loading={loading}
        error={error}
        empty={!loading && items.length === 0}
        emptyMessage="No parcels are ready to hand over."
        onRetry={reload}
      >
        <View style={styles.list}>
          {items.map((p) => (
            <Pressable
              key={p.id}
              style={styles.card}
              onPress={() => openParcel(p)}
              accessibilityRole="button"
              accessibilityLabel={`Hand over ${p.trackingNumber}`}
            >
              <View style={[styles.iconTile, { backgroundColor: '#1f6feb1f' }]}>
                <Ionicons name="hand-left" size={22} color="#1f6feb" />
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
    </FormScreen>
  );
}

/** A pill tab in the segmented control. */
function SegTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.segTab, active ? styles.segTabActive : null]}
    >
      <Text style={[styles.segText, active ? styles.segTextActive : null]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/** A parcel can be handed over once it is held in custody or marked ready for pickup (Req 30.2). */
function canHandOver(p: Parcel): boolean {
  return p.status === ParcelStatus.InCustody || p.status === ParcelStatus.ReadyForPickup;
}

/** True when the failure is a transport/connectivity error (so the UI can say "reconnect and retry"). */
function isTransport(err: unknown): boolean {
  return err instanceof ApiRequestError && (err.httpStatus === 0 || err.code === 'INTEGRATION_FAILURE');
}

function formatDateTime(iso: string): string {
  const d = parseUtc(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
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
  summaryCard: {
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
  segment: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.pill,
    padding: 4,
    ...theme.shadow.soft,
  },
  segTab: { flex: 1, alignItems: 'center', paddingVertical: theme.spacing.sm, paddingHorizontal: 4, borderRadius: theme.radius.pill },
  segTabActive: { backgroundColor: theme.color.primary },
  segText: { fontSize: theme.fontSize.caption, fontWeight: '700', color: theme.color.mutedText },
  segTextActive: { color: theme.color.primaryText },
});
