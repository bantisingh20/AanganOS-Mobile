import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { FormScreen } from '../../ui/FormScreen';
import { FormSection } from '../../ui/FormSection';
import { FormBanner } from '../../ui/FormBanner';
import { ListRow } from '../../ui/ListRow';
import { AsyncBoundary } from '../../ui/AsyncBoundary';
import { Badge } from '../../ui/Badge';
import { useAsync } from '../../ui/hooks';
import { theme } from '../../ui/theme';
import type { ResidentMe } from '../../models/resident';
import { ResidentVerificationStatus } from '../../models/resident';
import type { ResourceClients } from '../../resources';
import { verificationTone, humanizeCode } from '../shared/status';
import { RegisterScreen } from './RegisterScreen';

export interface MyKycProfileScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

/**
 * Self profile / KYC detail view (resident + guard). Branches on the signed-in person's own
 * verification status: a draft/rejected account launches the editable KYC form (submit shown); a
 * pending or verified account shows their submitted details read-only (no submit), with a status
 * banner. Self-scoped via GET /residents/me.
 */
export function MyKycProfileScreen({ resources, onBack }: MyKycProfileScreenProps) {
  const me = useAsync<ResidentMe>((signal) => resources.residents.me({ signal }), [resources]);
  const resident = me.data?.resident ?? null;
  const status = resident?.verificationStatus;

  if (status === ResidentVerificationStatus.Draft || status === ResidentVerificationStatus.Rejected) {
    return (
      <RegisterScreen
        resources={resources}
        mode="kyc"
        {...(onBack ? { onBack } : {})}
        onKycDone={() => { me.reload(); onBack?.(); }}
      />
    );
  }

  const pending = status === ResidentVerificationStatus.Pending;

  return (
    <FormScreen title="My profile" subtitle="Your KYC details" {...(onBack ? { onBack } : {})}>
      <AsyncBoundary
        loading={me.loading}
        error={me.error}
        empty={!me.loading && !resident}
        emptyMessage="No profile is linked to your account."
        onRetry={me.reload}
      >
        {resident ? (
          <>
            {pending ? (
              <FormBanner message="Your details are under review. You can view them here; they can't be edited while pending." tone="success" />
            ) : null}

            <View style={styles.photoWrap}>
              <PhotoCircle resources={resources} fileId={resident.photoFileId} name={resident.name} />
              <Text style={styles.name}>{resident.name}</Text>
              <Badge label={humanizeCode(resident.verificationStatus)} tone={verificationTone(resident.verificationStatus)} />
            </View>

            {resident.rejectionReason ? (
              <FormBanner message={`Rejected: ${resident.rejectionReason}`} tone="error" />
            ) : null}

            <FormSection title="Basic details" icon="person" tint={theme.color.primary}>
              <ListRow title="Name" subtitle={resident.name} />
              {resident.phone ? <ListRow title="Phone" subtitle={resident.phone} /> : null}
              {resident.email ? <ListRow title="Email" subtitle={resident.email} /> : null}
              <ListRow title="Type" subtitle={humanizeCode(resident.residentType)} />
              {resident.dateOfBirth ? <ListRow title="Date of birth" subtitle={formatDate(resident.dateOfBirth)} /> : null}
              {resident.gender ? <ListRow title="Gender" subtitle={humanizeCode(resident.gender)} /> : null}
              {resident.moveInDate ? <ListRow title="Move-in date" subtitle={formatDate(resident.moveInDate)} /> : null}
            </FormSection>

            <FormSection title="Identity" icon="card" tint={theme.color.info}>
              {resident.govtIdType ? <ListRow title="ID type" subtitle={humanizeCode(resident.govtIdType)} /> : null}
              <View style={styles.idRow}>
                <IdImage resources={resources} fileId={resident.govtIdFrontFileId} label="ID front" />
                <IdImage resources={resources} fileId={resident.govtIdBackFileId} label="ID back" />
              </View>
            </FormSection>
          </>
        ) : null}
      </AsyncBoundary>
    </FormScreen>
  );
}

function PhotoCircle({ resources, fileId, name }: { resources: ResourceClients; fileId: string | null; name: string }) {
  const source = resources.files.downloadSource(fileId);
  const [failed, setFailed] = useState(false);
  if (!source || failed) {
    return (
      <View style={[styles.photo, styles.photoEmpty]}>
        <Text style={styles.photoInitials}>{initials(name)}</Text>
      </View>
    );
  }
  return <Image source={source} style={styles.photo} accessibilityLabel={`${name} photo`} onError={() => setFailed(true)} />;
}

function IdImage({ resources, fileId, label }: { resources: ResourceClients; fileId: string | null; label: string }) {
  const source = resources.files.downloadSource(fileId);
  const [failed, setFailed] = useState(false);
  return (
    <View style={styles.idCell}>
      <Text style={styles.idLabel}>{label}</Text>
      {source && !failed ? (
        <Image source={source} style={styles.idImage} accessibilityLabel={label} onError={() => setFailed(true)} resizeMode="cover" />
      ) : (
        <View style={[styles.idImage, styles.idImageEmpty]}>
          <Text style={styles.idEmptyText}>Not provided</Text>
        </View>
      )}
    </View>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const styles = StyleSheet.create({
  photoWrap: { alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.md },
  photo: { width: 96, height: 96, borderRadius: 48, overflow: 'hidden' },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: `${theme.color.primary}1f` },
  photoInitials: { fontSize: theme.fontSize.heading, fontWeight: '800', color: theme.color.primary },
  name: { fontSize: theme.fontSize.title, fontWeight: '800', color: theme.color.text },
  idRow: { flexDirection: 'row', gap: theme.spacing.md },
  idCell: { flex: 1, gap: theme.spacing.xs },
  idLabel: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, fontWeight: '700' },
  idImage: { width: '100%', height: 110, borderRadius: theme.radius.md, backgroundColor: theme.color.background },
  idImageEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.color.border },
  idEmptyText: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
});
