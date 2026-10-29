import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { FormSection } from '@/components/ui/FormSection';
import { AppTextField } from '@/components/ui/AppTextField';
import { AppButton } from '@/components/ui/AppButton';
import { EntityCard } from '@/components/ui/EntityCard';
import { FaceSelfieCapture } from '@/components/ui/FaceSelfieCapture';
import { MasterDataDropdown } from '@/components/ui/MasterDataDropdown';
import { useAsyncAction } from '@/hooks';
import { emitToast } from '@/utils/toastBus';
import { theme } from '@/theme';
import { QrCode, shareQrImage } from '@/components/ui/QrCode';
import { ListRow } from '@/components/ui/ListRow';
import { GateMasterDataKeys } from '@/types/gate';
import type { Unit } from '@/types/community';
import type { RegisterWalkInResult } from '@/types/gate';
import type { LocalFile } from '@/services/resources/fileClient';
import type { ResourceClients } from '@/services/resources';
import { gateStatusTone, humanizeCode } from '@/utils/status';
import { UnitDropdown } from '@/components/ui/UnitDropdown';

export interface WalkInCaptureScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

/** Raise a client-side validation toast (native-app style — no inline error UI). */
function warn(message: string): void {
  emitToast({ tone: 'error', title: 'Check the form', message });
}

/**
 * Guard walk-in capture (Req 24.1, 24.3, 24.5). The guard picks the host unit and captures the
 * visitor's details for the record — identity (name/phone/category), ID proof (type + number),
 * why they're here (purpose, whom to meet, expected duration) and vehicle — then registers the
 * walk-in. It starts PENDING and the host residents are notified to approve; entry stays withheld
 * until then (Req 24.5), which the success state makes explicit.
 *
 * All option lists (category, ID-proof type) are data-driven via {@link MasterDataDropdown}
 * (steering: no hardcoding). Validation surfaces as toasts, not inline banners.
 */
export function WalkInCaptureScreen({ resources, onBack }: WalkInCaptureScreenProps) {
  const [unit, setUnit] = useState<Unit | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [idProofType, setIdProofType] = useState<string | null>(null);
  const [idProofNumber, setIdProofNumber] = useState('');
  const [purpose, setPurpose] = useState('');
  const [whomToMeet, setWhomToMeet] = useState('');
  const [autoWhom, setAutoWhom] = useState('');
  const [duration, setDuration] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [photoFileId, setPhotoFileId] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [registered, setRegistered] = useState<RegisterWalkInResult | null>(null);

  const onPhotoCaptured = async (file: LocalFile) => {
    setCameraOpen(false);
    if (!unit) return;
    setPhotoUri(file.uri);
    setUploadingPhoto(true);
    try {
      const ref = await resources.files.upload(file, { owningResourceType: 'Visitor', communityId: unit.communityId });
      setPhotoFileId(ref.reference);
    } catch {
      setPhotoUri(null);
      emitToast({ tone: 'error', title: 'Upload failed', message: 'Could not upload the photo. Try again.' });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const onSelectUnit = async (u: Unit | null) => {
    setUnit(u);
    if (!u) return;
    try {
      const members = await resources.units.listHousehold(u.id);
      const owner = members.find((m) => m.residentType?.toLowerCase() === 'owner') ?? members[0];
      if (owner) {
        setWhomToMeet((prev) => (!prev.trim() || prev === autoWhom ? owner.name : prev));
        setAutoWhom(owner.name);
      }
    } catch {
      // No-op: leave the field for manual entry if the household can't be read.
    }
  };

  const register = useAsyncAction(() => {
    const durationMinutes = duration.trim() ? Number(duration.trim()) : undefined;
    return resources.gate
      .registerWalkIn({
        hostUnitId: unit!.id,
        name: name.trim(),
        category: category!,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(idProofType ? { idProofType } : {}),
        ...(idProofNumber.trim() ? { idProofNumber: idProofNumber.trim() } : {}),
        ...(purpose.trim() ? { purpose: purpose.trim() } : {}),
        ...(whomToMeet.trim() ? { whomToMeet: whomToMeet.trim() } : {}),
        ...(durationMinutes !== undefined ? { expectedDurationMinutes: durationMinutes } : {}),
        ...(vehicle.trim() ? { vehicleNumber: vehicle.trim() } : {}),
        ...(photoFileId ? { photoFileId } : {}),
      })
      .then((v) => {
        setRegistered(v);
        return v;
      });
  });

  const reset = () => {
    setRegistered(null);
    setName('');
    setPhone('');
    setCategory(null);
    setIdProofType(null);
    setIdProofNumber('');
    setPurpose('');
    setWhomToMeet('');
    setAutoWhom('');
    setDuration('');
    setVehicle('');
    setPhotoFileId(null);
    setPhotoUri(null);
    register.reset();
  };

  const onSubmit = () => {
    if (!unit) { warn('Pick the host unit the visitor is here for.'); return; }
    if (!name.trim()) { warn('Enter the visitor\u2019s name.'); return; }
    if (!category) { warn('Select a visitor category.'); return; }
    const trimmed = duration.trim();
    if (trimmed) {
      const minutes = Number(trimmed);
      if (!Number.isInteger(minutes) || minutes <= 0) {
        warn('Expected duration must be a whole number of minutes greater than zero.');
        return;
      }
    }
    void register.run();
  };

  if (registered) {
    const v = registered.visitor;
    const autoApproved = registered.autoApproved;
    const shareWalkIn = async () => {
      if (!v.qrToken) return;
      const caption =
        `Visit pass for ${v.name}\n` +
        (registered.otp ? `One-time code: ${registered.otp}\n` : '') +
        `(Show the attached QR at the gate.)`;
      await shareQrImage(v.qrToken, caption);
    };
    return (
      <FormScreen
        title={autoApproved ? 'Visitor checked in' : 'Walk-in registered'}
        subtitle={autoApproved ? 'Approved automatically' : 'Sent to the resident for approval'}
        {...(onBack ? { onBack } : {})}
      >
        <FormSection title="Status" icon="checkmark-circle" tint={theme.color.success}>
          <Text style={styles.note}>
            {autoApproved
              ? 'Approved and checked in. Share the QR and code with the visitor; scan it again at the gate to check them out.'
              : 'Registered and sent to the resident for approval. Hold the visitor at the gate until it\u2019s approved.'}
          </Text>
          <EntityCard
            icon="person"
            title={v.name}
            meta={[
              { icon: 'pricetag', label: humanizeCode(v.category) },
              ...(v.whomToMeet ? [{ icon: 'people' as const, label: `To meet: ${v.whomToMeet}` }] : []),
              ...(v.vehicleNumber ? [{ icon: 'car' as const, label: v.vehicleNumber }] : []),
            ]}
            badge={{ label: humanizeCode(v.status), tone: gateStatusTone(v.status) }}
          />
        </FormSection>

        {autoApproved && v.qrToken ? (
          <FormSection title="Visitor pass" subtitle="Share with the visitor" icon="qr-code" tint={theme.color.success}>
            <View style={styles.qrWrap}>
              <QrCode value={v.qrToken} size={200} />
            </View>
            {registered.otp ? <ListRow title="One-time code (OTP)" subtitle={registered.otp} /> : null}
            <ListRow title="QR token" subtitle={v.qrToken} />
            <AppButton title="Share with visitor" variant="secondary" onPress={shareWalkIn} accessibilityHint="Open the share sheet to send the pass" />
          </FormSection>
        ) : null}

        <View style={styles.actions}>
          <AppButton title="Register another" onPress={reset} accessibilityHint="Capture another walk-in" />
        </View>
      </FormScreen>
    );
  }

  const busy = register.running;

  if (cameraOpen) {
    return (
      <FormScreen title="Capture visitor photo" subtitle="Align the face in the frame" onBack={() => setCameraOpen(false)}>
        <FaceSelfieCapture initialFacing="back" onCapture={(f) => void onPhotoCaptured(f)} onCancel={() => setCameraOpen(false)} />
      </FormScreen>
    );
  }

  return (
    <FormScreen title="Register walk-in" subtitle="Capture the visitor's details" {...(onBack ? { onBack } : {})}>
      <FormSection title="Visitor details" subtitle="Capture everything in one place" icon="person" tint={theme.color.primary}>
        {unit ? (
          <View style={styles.photoCol}>
            <Pressable
              onPress={() => setCameraOpen(true)}
              disabled={busy || uploadingPhoto}
              accessibilityRole="button"
              accessibilityLabel={photoUri ? 'Retake photo' : 'Capture photo'}
              style={styles.photoThumb}
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.photoImg} />
              ) : (
                <>
                  <Ionicons name="camera" size={44} color={theme.color.primary} />
                  <Text style={styles.photoHint}>Tap to capture</Text>
                </>
              )}
              {uploadingPhoto ? <View style={styles.photoOverlay}><Ionicons name="cloud-upload" size={26} color="#fff" /></View> : null}
            </Pressable>
            {photoUri ? (
              <Pressable
                onPress={() => setCameraOpen(true)}
                disabled={busy || uploadingPhoto}
                accessibilityRole="button"
                accessibilityLabel="Retake photo"
                style={({ pressed }) => [styles.photoBtn, pressed ? styles.photoBtnPressed : null]}
              >
                <Ionicons name="camera" size={18} color={theme.color.primary} />
                <Text style={styles.photoBtnText}>Retake</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <UnitDropdown resources={resources} value={unit} onSelect={(u) => void onSelectUnit(u)} required disabled={busy} />
        {!unit ? <Text style={styles.note}>Pick the host unit first to capture the visitor&apos;s photo.</Text> : null}

        <AppTextField label="Name" required value={name} onChangeText={setName} placeholder="Visitor's name" autoCapitalize="words" editable={!busy} />
        <AppTextField label="Phone" value={phone} onChangeText={setPhone} placeholder="Contact number" keyboardType="phone-pad" editable={!busy} />
        <MasterDataDropdown
          label="Category"
          required
          listKey={GateMasterDataKeys.VisitorCategory}
          masterData={resources.masterData}
          {...(unit ? { communityId: unit.communityId } : {})}
          value={category}
          onChange={setCategory}
          placeholder="Select a visitor category"
        />

        <View style={styles.divider} />

        <MasterDataDropdown
          label="ID type"
          listKey={GateMasterDataKeys.IdProofType}
          masterData={resources.masterData}
          {...(unit ? { communityId: unit.communityId } : {})}
          value={idProofType}
          onChange={setIdProofType}
          placeholder="Select an ID type"
          allowClear
        />
        <AppTextField label="ID number" value={idProofNumber} onChangeText={setIdProofNumber} placeholder="e.g. last 4 digits" autoCapitalize="characters" editable={!busy} />

        <View style={styles.divider} />

        <AppTextField label="Purpose" value={purpose} onChangeText={setPurpose} placeholder="e.g. parcel delivery, AC repair" editable={!busy} />
        <AppTextField label="Whom to meet" value={whomToMeet} onChangeText={setWhomToMeet} placeholder="Person they're here to meet" autoCapitalize="words" editable={!busy} />
        <AppTextField label="Expected duration (minutes)" value={duration} onChangeText={setDuration} placeholder="e.g. 30" keyboardType="number-pad" editable={!busy} />
        <AppTextField label="Vehicle number" value={vehicle} onChangeText={setVehicle} placeholder="e.g. MH12AB1234" autoCapitalize="characters" editable={!busy} />
      </FormSection>

      <View style={styles.actions}>
        <AppButton
          title="Register walk-in"
          loading={busy}
          onPress={onSubmit}
          accessibilityHint="Register this walk-in and request resident approval"
        />
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, lineHeight: 18 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.color.border, marginVertical: theme.spacing.xs },
  qrWrap: { alignItems: 'center', paddingVertical: 8 },
  actions: { marginTop: theme.spacing.sm },
  photoCol: { alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  photoThumb: { width: 180, height: 180, borderRadius: 90, backgroundColor: theme.color.accentSoft, borderWidth: 2, borderColor: theme.color.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', gap: 6 },
  photoImg: { width: '100%', height: '100%' },
  photoHint: { fontSize: theme.fontSize.caption, color: theme.color.primary, fontWeight: '700' },
  photoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.md, borderWidth: 1.5, borderColor: theme.color.primary },
  photoBtnPressed: { opacity: 0.7 },
  photoBtnText: { color: theme.color.primary, fontSize: theme.fontSize.label, fontWeight: '800' },
});
