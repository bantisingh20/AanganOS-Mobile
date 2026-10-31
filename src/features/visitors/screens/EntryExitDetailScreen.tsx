import React, { useState } from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { parseUtc } from '@/utils/datetime';
import { AppButton } from '@/components/ui/AppButton';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { Badge } from '@/components/ui/Badge';
import { FormBanner } from '@/components/ui/FormBanner';
import { useAsync, useAsyncAction } from '@/hooks';
import { theme } from '@/theme';
import type { EntryExitEvent, Visitor, VisitPass } from '@/types/gate';
import type { ResourceClients, RecordExitBody } from '@/services/resources';
import { humanizeCode } from '@/utils/status';

export interface EntryExitDetailScreenProps {
  resources: ResourceClients;
  event: EntryExitEvent;
  onBack?: () => void;
  onExited?: () => void;
}

interface Detail {
  phone: string | null;
  email: string | null;
  photoFileId: string | null;
  category: string;
  vehicleNumber: string | null;
  hostUnitNumber: string | null;
  whomToMeet: string | null;
  purpose: string | null;
  idProofType: string | null;
  idProofNumber: string | null;
  authType: string;
  validFromUtc: string | null;
  validUntilUtc: string | null;
}

export function EntryExitDetailScreen({ resources, event, onBack, onExited }: EntryExitDetailScreenProps) {
  const onSite = event.exitTsUtc === null;

  const { data, loading, error, reload } = useAsync<Detail>(
    async (signal) => {
      if (event.visitorId) {
        const v: Visitor = await resources.gate.getVisitor(event.visitorId, { signal });
        return fromVisitor(v);
      }
      if (event.visitPassId) {
        const p: VisitPass = await resources.gate.getVisitPass(event.visitPassId, { signal });
        return fromVisitPass(p);
      }
      return fromEvent(event);
    },
    [event.id],
  );

  const exit = useAsyncAction(async () => {
    await resources.gate.recordExit(exitBodyFor(event));
    onExited?.();
  });

  const detail = data ?? fromEvent(event);
  const photoSource = resources.files.downloadSource(detail.photoFileId ?? event.photoFileId);

  return (
    <FormScreen title="Visitor details" subtitle={humanizeCode(detail.authType)} {...(onBack ? { onBack } : {})}>
      <AsyncBoundary loading={loading && !data} error={error} onRetry={reload}>
        <View style={styles.hero}>
          {photoSource ? (
            <Image source={photoSource} style={styles.heroPhoto} accessibilityLabel={`${event.visitorName} photo`} />
          ) : (
            <View style={[styles.heroPhoto, styles.heroPhotoEmpty]}>
              <Ionicons name="person" size={40} color={theme.color.primary} />
            </View>
          )}
          <Text style={styles.heroName}>{event.visitorName}</Text>
          <Text style={styles.heroCategory}>{humanizeCode(detail.category)}</Text>
          <Badge label={onSite ? 'On-site' : 'Left'} tone={onSite ? 'warning' : 'neutral'} />
        </View>

        {exit.error ? <FormBanner message={exit.error.message} tone="error" /> : null}

        <View style={styles.card}>
          <Row icon="call-outline" label="Phone" value={detail.phone} onPress={detail.phone ? () => Linking.openURL(`tel:${detail.phone}`) : undefined} />
          {detail.email ? <Row icon="mail-outline" label="Email" value={detail.email} /> : null}
          <Row icon="home-outline" label="Host unit" value={detail.hostUnitNumber ? `Unit ${detail.hostUnitNumber}` : null} />
          {detail.whomToMeet ? <Row icon="person-circle-outline" label="Whom to meet" value={detail.whomToMeet} /> : null}
          {detail.purpose ? <Row icon="document-text-outline" label="Purpose" value={detail.purpose} /> : null}
          <Row icon="car-outline" label="Vehicle" value={detail.vehicleNumber ?? event.vehicleNumber} />
          {detail.idProofType ? <Row icon="card-outline" label="ID proof" value={`${humanizeCode(detail.idProofType)}${detail.idProofNumber ? ` · ${detail.idProofNumber}` : ''}`} /> : null}
        </View>

        <View style={styles.card}>
          <Row icon="enter-outline" label="Entry time" value={formatDateTime(event.entryTsUtc)} />
          <Row icon="exit-outline" label="Exit time" value={event.exitTsUtc ? formatDateTime(event.exitTsUtc) : null} />
          <Row icon="hourglass-outline" label="Duration" value={durationLabel(event.entryTsUtc, event.exitTsUtc)} />
          <Row icon="location-outline" label="Gate" value={event.gateLabel} />
          {detail.validFromUtc && detail.validUntilUtc ? (
            <Row icon="time-outline" label="Pass valid" value={`${formatDateTime(detail.validFromUtc)} → ${formatDateTime(detail.validUntilUtc)}`} />
          ) : null}
        </View>

        {onSite ? (
          <AppButton
            title="Record exit"
            loading={exit.running}
            onPress={() => exit.run()}
            accessibilityHint={`Record ${event.visitorName}'s exit`}
          />
        ) : null}
      </AsyncBoundary>
    </FormScreen>
  );
}

function Row({ icon, label, value, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string | null | undefined; onPress?: () => void }) {
  const display = value && value.trim() ? value : '—';
  const Container: React.ComponentType<{ children: React.ReactNode }> = onPress && value
    ? ({ children }) => <Text onPress={onPress} style={styles.rowPressable}>{children}</Text>
    : ({ children }) => <>{children}</>;
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={theme.color.mutedText} style={styles.rowIcon} />
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Container>
          <Text style={[styles.rowValue, onPress && value ? styles.rowValueLink : null]}>{display}</Text>
        </Container>
      </View>
    </View>
  );
}

function fromVisitor(v: Visitor): Detail {
  return {
    phone: v.phone,
    email: v.email,
    photoFileId: v.photoFileId,
    category: v.category,
    vehicleNumber: v.vehicleNumber,
    hostUnitNumber: v.hostUnitNumber,
    whomToMeet: v.whomToMeet,
    purpose: v.purpose,
    idProofType: v.idProofType,
    idProofNumber: v.idProofNumber,
    authType: 'walk_in',
    validFromUtc: null,
    validUntilUtc: null,
  };
}

function fromVisitPass(p: VisitPass): Detail {
  return {
    phone: p.phone,
    email: p.email,
    photoFileId: p.photoFileId,
    category: 'guest',
    vehicleNumber: p.vehicleNumber,
    hostUnitNumber: null,
    whomToMeet: p.whomToMeet,
    purpose: null,
    idProofType: null,
    idProofNumber: null,
    authType: 'visit_pass',
    validFromUtc: p.validFromUtc,
    validUntilUtc: p.validUntilUtc,
  };
}

function fromEvent(e: EntryExitEvent): Detail {
  return {
    phone: e.visitorPhone,
    email: null,
    photoFileId: e.photoFileId,
    category: e.category,
    vehicleNumber: e.vehicleNumber,
    hostUnitNumber: e.hostUnitNumber,
    whomToMeet: e.whomToMeet,
    purpose: null,
    idProofType: null,
    idProofNumber: null,
    authType: e.recurringVisitorId ? 'recurring' : e.visitPassId ? 'visit_pass' : 'walk_in',
    validFromUtc: null,
    validUntilUtc: null,
  };
}

function exitBodyFor(e: EntryExitEvent): RecordExitBody {
  return {
    ...(e.visitorId ? { visitorId: e.visitorId } : {}),
    ...(e.visitPassId ? { visitPassId: e.visitPassId } : {}),
    ...(e.recurringVisitorId ? { recurringVisitorId: e.recurringVisitorId } : {}),
    ...(e.gateId ? { gateId: e.gateId } : {}),
    ...(e.gateLabel ? { gateLabel: e.gateLabel } : {}),
  };
}

function formatDateTime(iso: string): string {
  const d = parseUtc(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function durationLabel(entryIso: string, exitIso: string | null): string {
  const start = new Date(entryIso).getTime();
  if (Number.isNaN(start)) return '—';
  const end = exitIso ? new Date(exitIso).getTime() : Date.now();
  const mins = Math.max(0, Math.floor((end - start) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const base = h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  return exitIso ? base : `${base} (on-site)`;
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: theme.spacing.xs, marginBottom: theme.spacing.md },
  heroPhoto: { width: 96, height: 96, borderRadius: theme.radius.lg, overflow: 'hidden', marginBottom: theme.spacing.xs },
  heroPhotoEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: `${theme.color.primary}1f` },
  heroName: { fontSize: theme.fontSize.title, fontWeight: '800', color: theme.color.text },
  heroCategory: { fontSize: theme.fontSize.label, color: theme.color.mutedText, fontWeight: '600', marginBottom: 4 },

  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadow.soft,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm },
  rowIcon: { marginTop: 2 },
  rowBody: { flex: 1, gap: 2 },
  rowLabel: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  rowValue: { fontSize: theme.fontSize.body, color: theme.color.text, fontWeight: '700' },
  rowValueLink: { color: theme.color.primary },
  rowPressable: {},
});
