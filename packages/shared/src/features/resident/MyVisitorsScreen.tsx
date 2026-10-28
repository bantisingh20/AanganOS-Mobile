import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FormScreen } from '../../ui/FormScreen';
import { FormSection } from '../../ui/FormSection';
import { AppButton } from '../../ui/AppButton';
import { AsyncBoundary } from '../../ui/AsyncBoundary';
import { EntityCard, type MetaChip } from '../../ui/EntityCard';
import { ListRow } from '../../ui/ListRow';
import { QrCode, shareQrImage } from '../../ui/QrCode';
import { Pager } from '../../ui/Pager';
import { useAsync } from '../../ui/hooks';
import { theme } from '../../ui/theme';
import { DEFAULT_PAGE_SIZE } from '../../models/query';
import type { PagedData } from '../../models/envelope';
import type { VisitPass } from '../../models/gate';
import type { ResourceClients } from '../../resources';
import { gateStatusTone, humanizeCode, effectiveVisitPassStatus, isVisitPassExpired } from '../shared/status';

export interface MyVisitorsScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

type View_ = { name: 'list' } | { name: 'detail'; pass: VisitPass };

/**
 * Resident "My visitors" list (Req 23.5). Shows the visit passes the resident has created for their
 * own unit(s), paginated and newest-first (self-scoped server-side). Each pass is an
 * {@link EntityCard} with the visitor name, a status badge and meta chips (visit date, entries used,
 * valid-until). Tapping a pass opens its detail — the scannable {@link QrCode} plus the token/OTP —
 * so the resident can re-show or re-share it. A single-route screen with an internal view switch.
 */
export function MyVisitorsScreen({ resources, onBack }: MyVisitorsScreenProps) {
  const [view, setView] = useState<View_>({ name: 'list' });
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useAsync<PagedData<VisitPass>>(
    (signal) => resources.gate.listVisitPasses({ page, pageSize: DEFAULT_PAGE_SIZE, sort: 'validFromUtc:desc' }, {}, { signal }),
    [page],
  );

  if (view.name === 'detail') {
    const p = view.pass;
    const expired = isVisitPassExpired(p.status, p.validUntilUtc);
    const effStatus = effectiveVisitPassStatus(p.status, p.validUntilUtc);
    return (
      <FormScreen title={p.visitorName} subtitle="Visit pass" onBack={() => setView({ name: 'list' })}>
        {expired ? null : (
          <FormSection title="Scan at the gate" subtitle="The guard scans this QR to verify the pass" icon="qr-code" tint={theme.color.success}>
            <View style={styles.qrWrap}>
              <QrCode value={p.qrToken} size={220} />
            </View>
          </FormSection>
        )}
        <FormSection title="Pass details" icon="document-text" tint={theme.color.info}>
          <ListRow title="Visitor" subtitle={p.visitorName} />
          {p.whomToMeet ? <ListRow title="To meet" subtitle={p.whomToMeet} /> : null}
          {p.phone ? <ListRow title="Phone" subtitle={p.phone} /> : null}
          {p.vehicleType ? <ListRow title="Vehicle" subtitle={`${humanizeCode(p.vehicleType)}${p.vehicleNumber ? ` · ${p.vehicleNumber}` : ''}`} /> : null}
          <ListRow title="Persons" subtitle={`${p.numberOfPersons ?? 1}`} />
          {expired ? null : <ListRow title="QR token" subtitle={p.qrToken} />}
          <ListRow title="Entries used" subtitle={`${p.useCount} of ${p.maxUses}`} />
          {p.visitDateUtc ? <ListRow title="Visit date" subtitle={formatDate(p.visitDateUtc)} /> : null}
          <ListRow title="Valid until" subtitle={formatDateTime(p.validUntilUtc)} />
          <ListRow title="Status" subtitle={humanizeCode(effStatus)} />
        </FormSection>
        {expired ? null : (
          <AppButton
            title="Share with visitor"
            onPress={() => void sharePass(p)}
            accessibilityHint="Open the share sheet to send the pass details"
          />
        )}
      </FormScreen>
    );
  }

  const items = data?.items ?? [];

  return (
    <FormScreen
      title="My visitors"
      subtitle={data ? `${data.totalCount} ${data.totalCount === 1 ? 'pass' : 'passes'}` : 'Visit passes you created'}
      {...(onBack ? { onBack } : {})}
    >
      <AsyncBoundary
        loading={loading}
        error={error}
        empty={!loading && items.length === 0}
        emptyMessage="You haven't created any visit passes yet. Use 'Invite Visitor' to create one."
        onRetry={reload}
      >
        <View style={styles.list}>
          {items.map((p) => {
            const effStatus = effectiveVisitPassStatus(p.status, p.validUntilUtc);
            const expired = effStatus === 'expired';
            const meta: MetaChip[] = [];
            if (p.visitDateUtc) meta.push({ icon: 'calendar-outline', label: formatDate(p.visitDateUtc) });
            meta.push({ icon: 'ticket-outline', label: `${p.useCount}/${p.maxUses} used` });
            meta.push({ icon: 'time-outline', label: `Until ${formatDate(p.validUntilUtc)}` });
            return (
              <EntityCard
                key={p.id}
                title={p.visitorName}
                icon="person"
                tint={theme.color.primary}
                badge={{ label: humanizeCode(effStatus), tone: gateStatusTone(effStatus) }}
                meta={meta}
              >
                {expired ? null : (
                  <View style={styles.actions}>
                    <View style={styles.flex}>
                      <AppButton
                        title="Show QR"
                        variant="secondary"
                        onPress={() => setView({ name: 'detail', pass: p })}
                        accessibilityHint={`Show the QR pass for ${p.visitorName}`}
                      />
                    </View>
                  </View>
                )}
              </EntityCard>
            );
          })}
        </View>
        {data ? (
          <Pager page={data.page} pageSize={data.pageSize} totalCount={data.totalCount} onPageChange={setPage} disabled={loading} />
        ) : null}
      </AsyncBoundary>
    </FormScreen>
  );
}

async function sharePass(p: VisitPass): Promise<void> {
  const caption =
    `Visit pass for ${p.visitorName}\n` +
    `Valid until: ${formatDateTime(p.validUntilUtc)}\n` +
    `(Scan the attached QR at the gate.)`;
  await shareQrImage(p.qrToken, caption);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing.md, marginBottom: theme.spacing.md },
  actions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  flex: { flex: 1 },
  qrWrap: { alignItems: 'center', paddingVertical: 8 },
});
