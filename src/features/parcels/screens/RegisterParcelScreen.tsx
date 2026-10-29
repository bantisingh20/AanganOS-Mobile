import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { FormSection } from '@/components/ui/FormSection';
import { AppTextField } from '@/components/ui/AppTextField';
import { AppButton } from '@/components/ui/AppButton';
import { FormBanner } from '@/components/ui/FormBanner';
import { Badge } from '@/components/ui/Badge';
import { PhotoPicker } from '@/components/ui/PhotoPicker';
import { MasterDataDropdown } from '@/components/ui/MasterDataDropdown';
import { useAsyncAction } from '@/hooks';
import { theme } from '@/theme';
import { ParcelMasterDataKeys } from '@/types/parcel';
import type { Unit } from '@/types/community';
import type { Parcel } from '@/types/parcel';
import type { ResourceClients } from '@/services/resources';
import { parcelStatusTone, humanizeCode } from '@/utils/status';
import { UnitDropdown } from '@/components/ui/UnitDropdown';

export interface RegisterParcelScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

/**
 * Guard parcel registration (Req 28.1, 28.4, 29.3) — redesigned to the shared card style. The guard
 * picks the recipient unit, enters tracking number + provider, and selects a configurable category
 * and recorded condition (from `Parcel_Category` / `Parcel_Condition` master-data — never hardcoded).
 * Optional receiver/location and optional parcel photo / condition-evidence photos round out the
 * record (Req 28.4). On success the parcel starts `received`, flagged priority when its category is a
 * configurable priority category (Req 29.3), shown on a success card. Reuses {@link UnitDropdown},
 * {@link MasterDataDropdown} and {@link PhotoPicker}.
 *
 * <p>Photos upload via {@link PhotoPicker} bound to the recipient unit's community (so they appear
 * once a unit is chosen) — replacing the old raw "file id" text fields.</p>
 */
export function RegisterParcelScreen({ resources, onBack }: RegisterParcelScreenProps) {
  const [unit, setUnit] = useState<Unit | null>(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [provider, setProvider] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [condition, setCondition] = useState<string | null>(null);
  const [receiver, setReceiver] = useState('');
  const [receivedLocation, setReceivedLocation] = useState('');
  const [photoFileId, setPhotoFileId] = useState<string | null>(null);
  const [conditionEvidenceFileId, setConditionEvidenceFileId] = useState<string | null>(null);
  const [registered, setRegistered] = useState<Parcel | null>(null);

  const register = useAsyncAction(() => {
    if (!unit || !category || !condition) {
      return Promise.reject(new Error('Missing fields'));
    }
    return resources.parcels
      .registerParcel({
        recipientUnitId: unit.id,
        trackingNumber: trackingNumber.trim(),
        provider: provider.trim(),
        category,
        condition,
        ...(receiver.trim() ? { receiver: receiver.trim() } : {}),
        ...(receivedLocation.trim() ? { receivedLocation: receivedLocation.trim() } : {}),
        ...(photoFileId ? { photoFileId } : {}),
        ...(conditionEvidenceFileId ? { conditionEvidenceFileId } : {}),
      })
      .then((p) => {
        setRegistered(p);
        return p;
      });
  });

  const canSubmit =
    Boolean(unit) &&
    trackingNumber.trim().length > 0 &&
    provider.trim().length > 0 &&
    Boolean(category) &&
    Boolean(condition);

  const reset = () => {
    setRegistered(null);
    setUnit(null);
    setTrackingNumber('');
    setProvider('');
    setCategory(null);
    setCondition(null);
    setReceiver('');
    setReceivedLocation('');
    setPhotoFileId(null);
    setConditionEvidenceFileId(null);
    register.reset();
  };

  if (registered) {
    return (
      <FormScreen title="Parcel registered" subtitle="Logged at the gate" {...(onBack ? { onBack } : {})}>
        <View style={styles.successCard}>
          <View style={[styles.iconTile, { backgroundColor: `${theme.color.success}1f` }]}>
            <Ionicons name="checkmark-circle" size={26} color={theme.color.success} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={1}>{registered.trackingNumber}</Text>
            <Text style={styles.cardSub} numberOfLines={1}>
              {registered.provider} · {humanizeCode(registered.category)} · {humanizeCode(registered.condition)}
            </Text>
          </View>
          <View style={styles.cardRight}>
            <Badge label={humanizeCode(registered.status)} tone={parcelStatusTone(registered.status)} />
            {registered.isPriority ? <Badge label="Priority" tone="danger" /> : null}
          </View>
        </View>
        <FormBanner
          message={
            registered.isPriority
              ? 'Flagged priority — the recipient has been notified. Move it into custody next.'
              : 'The recipient has been notified. Move it into custody next.'
          }
          tone="success"
        />
        <AppButton title="Register another" onPress={reset} accessibilityHint="Register another parcel" />
      </FormScreen>
    );
  }

  const photoUpload = unit ? { owningResourceType: 'Parcel', communityId: unit.communityId } : null;

  return (
    <FormScreen title="Register a parcel" subtitle="Log a delivery received at the gate" {...(onBack ? { onBack } : {})}>
      <FormSection title="Recipient unit" icon="home" tint={theme.color.info}>
        <UnitDropdown resources={resources} label="Recipient unit" value={unit} onSelect={setUnit} required />
      </FormSection>

      <FormSection title="Parcel" subtitle="Tracking, provider & condition" icon="cube" tint="#cf5500">
        <AppTextField
          label="Tracking number"
          required
          value={trackingNumber}
          onChangeText={setTrackingNumber}
          placeholder="Courier tracking / reference"
          autoCapitalize="characters"
          {...(register.error?.fieldErrors.trackingNumber ? { error: register.error.fieldErrors.trackingNumber } : {})}
        />
        <AppTextField
          label="Provider"
          required
          value={provider}
          onChangeText={setProvider}
          placeholder="Courier / delivery provider"
          autoCapitalize="words"
          {...(register.error?.fieldErrors.provider ? { error: register.error.fieldErrors.provider } : {})}
        />
        <MasterDataDropdown
          label="Category"
          listKey={ParcelMasterDataKeys.ParcelCategory}
          masterData={resources.masterData}
          value={category}
          onChange={setCategory}
          placeholder="Select a parcel category"
          {...(unit ? { communityId: unit.communityId } : {})}
        />
        <MasterDataDropdown
          label="Condition"
          listKey={ParcelMasterDataKeys.ParcelCondition}
          masterData={resources.masterData}
          value={condition}
          onChange={setCondition}
          placeholder="Select the recorded condition"
          {...(unit ? { communityId: unit.communityId } : {})}
        />
      </FormSection>

      <FormSection title="Receipt (optional)" icon="receipt-outline" tint={theme.color.mutedText}>
        <AppTextField
          label="Received by (optional)"
          value={receiver}
          onChangeText={setReceiver}
          placeholder="Who received it at the gate"
          autoCapitalize="words"
        />
        <AppTextField
          label="Received location (optional)"
          value={receivedLocation}
          onChangeText={setReceivedLocation}
          placeholder="Gate / reception location"
          autoCapitalize="words"
        />
        {photoUpload ? (
          <>
            <PhotoPicker
              label="Parcel photo (optional)"
              files={resources.files}
              upload={photoUpload}
              value={photoFileId}
              onChange={setPhotoFileId}
              disabled={register.running}
            />
            <PhotoPicker
              label="Condition evidence (optional)"
              files={resources.files}
              upload={photoUpload}
              value={conditionEvidenceFileId}
              onChange={setConditionEvidenceFileId}
              disabled={register.running}
            />
          </>
        ) : (
          <Text style={styles.note}>Pick a recipient unit above to attach parcel photos.</Text>
        )}
      </FormSection>

      {register.error && !hasFieldError(register.error.fieldErrors) ? (
        <FormBanner message={register.error.message} tone="error" />
      ) : null}

      <AppButton
        title="Register parcel"
        loading={register.running}
        disabled={!canSubmit}
        onPress={() => register.run()}
        accessibilityHint="Register this parcel and notify the recipient"
      />
    </FormScreen>
  );
}

/** Whether any field-level error is present (so the generic banner isn't shown on top of them). */
function hasFieldError(fieldErrors: Readonly<Record<string, string>>): boolean {
  return Object.keys(fieldErrors).length > 0;
}

const styles = StyleSheet.create({
  successCard: {
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
  note: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, lineHeight: 18 },
});
