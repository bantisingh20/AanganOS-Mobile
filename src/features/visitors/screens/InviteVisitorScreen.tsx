import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FormScreen } from '@/components/ui/FormScreen';
import { FormSection } from '@/components/ui/FormSection';
import { AppTextField } from '@/components/ui/AppTextField';
import { AppButton } from '@/components/ui/AppButton';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { ListRow } from '@/components/ui/ListRow';
import { FormBanner } from '@/components/ui/FormBanner';
import { Select } from '@/components/ui/Select';
import { MasterDataDropdown } from '@/components/ui/MasterDataDropdown';
import { DateField } from '@/components/ui/DateField';
import { PhotoPicker } from '@/components/ui/PhotoPicker';
import { QrCode, shareQrImage } from '@/components/ui/QrCode';
import { useAsyncAction } from '@/hooks';
import { emitToast } from '@/utils/toastBus';
import { theme } from '@/theme';
import type { CreateVisitPassResult } from '@/types/gate';
import { GateMasterDataKeys } from '@/types/gate';
import type { ResourceClients } from '@/services/resources';
import { humanizeCode } from '@/utils/status';
import { useMyResident } from '@/features/profile/hooks/useMyResident';

export interface InviteVisitorScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

function dateFromToday(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function endOfDay(iso: string): string {
  const d = new Date(iso);
  d.setHours(23, 59, 59, 0);
  return d.toISOString();
}

function toCalendarDayUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0)).toISOString();
}

/** Raise a client-side validation toast (native-app style — no inline error UI). */
function warn(message: string): void {
  emitToast({ tone: 'error', title: 'Check the form', message });
}

/**
 * Resident pre-invite (Req 23.1). The resident creates a pre-approved visit pass for their own unit
 * and captures the visitor's details (name, phone, vehicle + type, photo, party size, whom-to-meet)
 * plus the visit date, the valid-until date and the number of entries. The server returns the QR
 * token + a one-time OTP shown ONCE. Fields are inline: a {@link Select} host-unit dropdown,
 * {@link DateField}s backed by the OS-native date picker, numeric inputs and an inline
 * {@link PhotoPicker} — no in-app modal/dialog form.
 */
export function InviteVisitorScreen({ resources, onBack }: InviteVisitorScreenProps) {
  const me = useMyResident(resources);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [visitorName, setVisitorName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [vehicleType, setVehicleType] = useState<string | null>(null);
  const [persons, setPersons] = useState('1');
  const [whomToMeet, setWhomToMeet] = useState('');
  const [photoFileId, setPhotoFileId] = useState<string | null>(null);
  const [visitDate, setVisitDate] = useState<string | null>(dateFromToday(0));
  const [validUntil, setValidUntil] = useState<string | null>(dateFromToday(1));
  const [created, setCreated] = useState<CreateVisitPassResult | null>(null);
  const [validityText, setValidityText] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    resources.onboarding
      .getConfig()
      .then((cfg) => {
        if (active) setValidityText(cfg.visitPassValidityText);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [resources.onboarding]);

  const units = me.data?.units ?? [];
  const resident = me.data?.resident ?? null;
  // Use the resident's unit only when there's exactly one; never guess "the first of many".
  const soleUnitId = units.length === 1 ? (units[0]?.unitId ?? null) : null;
  const effectiveUnitId = unitId ?? soleUnitId;
  const selectedUnit = useMemo(() => units.find((u) => u.unitId === effectiveUnitId) ?? null, [units, effectiveUnitId]);
  const communityId = selectedUnit?.communityId ?? resident?.communityId ?? '';

  const create = useAsyncAction(() => {
    const personsNum = Number(persons.trim() || '1');
    return resources.gate
      .createVisitPass({
        hostUnitId: selectedUnit!.unitId,
        visitorName: visitorName.trim(),
        validUntilUtc: endOfDay(validUntil!),
        numberOfPersons: personsNum,
        ...(visitDate ? { visitDateUtc: toCalendarDayUtc(visitDate) } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(vehicle.trim() ? { vehicleNumber: vehicle.trim() } : {}),
        ...(vehicleType ? { vehicleType } : {}),
        ...(whomToMeet.trim() ? { whomToMeet: whomToMeet.trim() } : {}),
        ...(photoFileId ? { photoFileId } : {}),
        ...(resident ? { hostResidentId: resident.id } : {}),
      })
      .then((r) => {
        setCreated(r);
        return r;
      });
  });

  const unitOptions = units.map((u) => ({ value: u.unitId, label: `Unit ${u.unitNumber} · ${humanizeCode(u.unitType)}` }));

  const onSubmit = () => {
    if (!selectedUnit) { warn('Select the unit the visitor is coming to.'); return; }
    if (!visitorName.trim()) { warn('Enter the visitor\u2019s name.'); return; }
    if (!validUntil) { warn('Choose the date the pass is valid until.'); return; }
    if (visitDate && new Date(endOfDay(validUntil)) < new Date(visitDate)) {
      warn('The valid-until date must be on or after the visit date.');
      return;
    }
    const p = Number(persons.trim() || '1');
    if (!Number.isInteger(p) || p < 1) { warn('Number of persons must be a whole number of at least 1.'); return; }
    void create.run();
  };

  if (created) {
    return (
      <FormScreen title="Visit pass ready" subtitle="Share with your visitor" {...(onBack ? { onBack } : {})}>
        <FormBanner message="Show this QR at the gate, or share the token and code with your visitor — the code is shown only once." tone="success" />
        <FormSection title="Scan at the gate" subtitle="The guard scans this QR to verify the pass" icon="qr-code" tint={theme.color.success}>
          <View style={styles.qrWrap}>
            <QrCode value={created.pass.qrToken} size={220} />
          </View>
        </FormSection>
        <FormSection title="Pass details" icon="document-text" tint={theme.color.info}>
          <ListRow title="Visitor" subtitle={created.pass.visitorName} />
          {created.pass.whomToMeet ? <ListRow title="To meet" subtitle={created.pass.whomToMeet} /> : null}
          {created.pass.vehicleType ? <ListRow title="Vehicle" subtitle={`${humanizeCode(created.pass.vehicleType)}${created.pass.vehicleNumber ? ` · ${created.pass.vehicleNumber}` : ''}`} /> : null}
          <ListRow title="Persons" subtitle={`${created.pass.numberOfPersons ?? 1}`} />
          <ListRow title="QR token" subtitle={created.pass.qrToken} />
          <ListRow title="One-time code (OTP)" subtitle={created.otp} />
          <ListRow title="Entries allowed" subtitle={`${created.pass.maxUses}`} />
          {created.pass.visitDateUtc ? <ListRow title="Visit date" subtitle={formatDate(created.pass.visitDateUtc)} /> : null}
          <ListRow title="Valid until" subtitle={formatDateTime(created.pass.validUntilUtc)} />
        </FormSection>
        <AppButton title="Share with visitor" onPress={() => sharePass(created)} accessibilityHint="Open the share sheet to send the pass details" />
        <AppButton
          title="Create another"
          variant="secondary"
          onPress={() => {
            setCreated(null);
            setVisitorName('');
            setPhone('');
            setEmail('');
            setVehicle('');
            setVehicleType(null);
            setPersons('1');
            setWhomToMeet('');
            setPhotoFileId(null);
            setVisitDate(dateFromToday(0));
            setValidUntil(dateFromToday(1));
            create.reset();
          }}
          accessibilityHint="Create another visit pass"
        />
      </FormScreen>
    );
  }

  return (
    <FormScreen title="Invite a visitor" subtitle="Create a pre-approved pass" {...(onBack ? { onBack } : {})}>
      <AsyncBoundary
        loading={me.loading}
        error={me.error}
        empty={!me.loading && units.length === 0}
        emptyMessage="No unit is linked to your account yet, so a pass can't be created."
        onRetry={me.reload}
      >
        <FormSection title="Visit pass details" subtitle="Fill everything in one place" icon="person" tint={theme.color.primary}>
          <PhotoPicker
            label="Visitor photo"
            hideLabel
            layout="vertical"
            files={resources.files}
            upload={{ owningResourceType: 'VisitPass', communityId }}
            value={photoFileId}
            onChange={setPhotoFileId}
            disabled={create.running}
          />

          {units.length > 1 ? (
            <Select label="Host unit" required value={effectiveUnitId} options={unitOptions} onChange={setUnitId} placeholder="Select your unit" />
          ) : null}
          <AppTextField label="Visitor name" required value={visitorName} onChangeText={setVisitorName} placeholder="Who are you inviting?" autoCapitalize="words" editable={!create.running} />
          <AppTextField label="Contact number" value={phone} onChangeText={setPhone} placeholder="Visitor's phone" keyboardType="phone-pad" editable={!create.running} />
          <AppTextField label="Email" value={email} onChangeText={setEmail} placeholder="Visitor's email (for the pass)" keyboardType="email-address" autoCapitalize="none" editable={!create.running} />
          <AppTextField label="Whom to meet / flat" value={whomToMeet} onChangeText={setWhomToMeet} placeholder="Person or flat they're visiting" autoCapitalize="words" editable={!create.running} />
          <AppTextField label="Number of persons" value={persons} onChangeText={setPersons} placeholder="1" keyboardType="number-pad" editable={!create.running} />

          <View style={styles.divider} />

          <MasterDataDropdown
            label="Vehicle type (optional)"
            listKey={GateMasterDataKeys.VehicleType}
            masterData={resources.masterData}
            {...(communityId ? { communityId } : {})}
            value={vehicleType}
            onChange={setVehicleType}
            placeholder="Select a vehicle type"
            allowClear
          />
          <AppTextField label="Vehicle number" value={vehicle} onChangeText={setVehicle} placeholder="e.g. MH12AB1234" autoCapitalize="characters" editable={!create.running} />

          <View style={styles.divider} />

          <DateField label="Date of visit" value={visitDate} onChange={(d) => setVisitDate(d ? d.toISOString() : null)} minimumDate={dateFromToday(0)} disabled={create.running} />
          <DateField label="Valid until" required value={validUntil} onChange={(d) => setValidUntil(d ? d.toISOString() : null)} minimumDate={dateFromToday(0)} disabled={create.running} />
        </FormSection>

        {validityText ? (
          <Text style={styles.validityNote}>This pass will be valid for {validityText} after it is created.</Text>
        ) : null}

        <AppButton title="Create pass" loading={create.running} onPress={onSubmit} accessibilityHint="Create a visit pass and get a shareable QR and code" />
      </AsyncBoundary>
    </FormScreen>
  );
}

/** Share the scannable QR image (with the pass details as the caption) via the OS share sheet. */
async function sharePass(result: CreateVisitPassResult): Promise<void> {
  const caption =
    `Your visit pass for ${result.pass.visitorName}\n` +
    `One-time code: ${result.otp}\n` +
    `Valid until: ${formatDateTime(result.pass.validUntilUtc)}\n` +
    `(Scan the attached QR at the gate.)`;
  await shareQrImage(result.pass.qrToken, caption);
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

const styles = StyleSheet.create({
  qrWrap: { alignItems: 'center', paddingVertical: 8 },
  divider: { height: 1, backgroundColor: theme.color.border, marginVertical: 12 },
  validityNote: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, textAlign: 'center', paddingHorizontal: 12 },
});
