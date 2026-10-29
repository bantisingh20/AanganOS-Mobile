import React, { useState } from 'react';
import { Share } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { AppTextField } from '@/components/ui/AppTextField';
import { AppButton } from '@/components/ui/AppButton';
import { ListRow } from '@/components/ui/ListRow';
import { FormBanner } from '@/components/ui/FormBanner';
import { LinkButton } from '@/components/ui/LinkButton';
import { MasterDataDropdown } from '@/components/ui/MasterDataDropdown';
import { useAsyncAction } from '@/hooks';
import { ParcelMasterDataKeys, ParcelVerificationMethod } from '@/types/parcel';
import type { AuthorizeCollectorResult, Parcel } from '@/types/parcel';
import type { ResourceClients } from '@/services/resources';
import { humanizeCode } from '@/utils/status';

export interface AuthorizeCollectorScreenProps {
  resources: ResourceClients;
  parcel: Parcel;
  onBack?: () => void;
}

/**
 * Resident authorize-a-collector (Req 30.1, 30.2). The resident names who may collect a parcel
 * addressed to their own unit and picks a configurable verification method (from the
 * `Parcel_Verification_Method` master-data list — never a hardcoded list). An `id`/`combination`
 * method also captures the expected government/photo-ID reference the guard will check. On create
 * the server returns a one-time OTP + an opaque QR token, shown ONCE so the resident can share them
 * with the collector via the OS share sheet (RN's built-in {@link Share} — no extra dependency,
 * mirroring the visit-pass invite flow). The secrets are never returned again, which the result
 * state makes explicit.
 */
export function AuthorizeCollectorScreen({ resources, parcel, onBack }: AuthorizeCollectorScreenProps) {
  const [collectorName, setCollectorName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [method, setMethod] = useState<string | null>(null);
  const [idReference, setIdReference] = useState('');
  const [created, setCreated] = useState<AuthorizeCollectorResult | null>(null);

  // id/combination methods require an expected ID reference the handover verifies against (Req 30.2).
  const needsIdReference =
    method === ParcelVerificationMethod.Id || method === ParcelVerificationMethod.Combination;

  const authorize = useAsyncAction(() =>
    resources.parcels
      .authorizeCollector(parcel.id, {
        collectorName: collectorName.trim(),
        ...(relationship.trim() ? { collectorRelationship: relationship.trim() } : {}),
        ...(method ? { verificationMethod: method } : {}),
        ...(needsIdReference && idReference.trim() ? { expectedIdReference: idReference.trim() } : {}),
      })
      .then((r) => {
        setCreated(r);
        return r;
      }),
  );

  const canSubmit =
    collectorName.trim().length > 0 && (!needsIdReference || idReference.trim().length > 0);

  if (created) {
    return (
      <Screen accessibilityLabel="Collector authorized">
        {onBack ? <LinkButton title="‹ Back" onPress={onBack} accessibilityHint="Return to the parcel list" /> : null}
        <SectionHeading title="Collector authorized" level={1} />
        <FormBanner
          message="Share the code and QR token with your collector now — they are shown only once."
          tone="success"
        />
        <ListRow title="Parcel" subtitle={parcel.trackingNumber} />
        <ListRow title="Collector" subtitle={created.authorization.collectorName} />
        <ListRow title="Verification" subtitle={humanizeCode(created.authorization.verificationMethod)} />
        <ListRow title="One-time code (OTP)" subtitle={created.otp} />
        <ListRow title="QR token" subtitle={created.qrToken} />
        <ListRow title="Valid until" subtitle={formatDateTime(created.authorization.expiresAtUtc)} />
        <AppButton
          title="Share with collector"
          onPress={() => shareAuthorization(created, parcel)}
          accessibilityHint="Open the share sheet to send the collection details"
        />
        <AppButton
          title="Done"
          variant="secondary"
          onPress={onBack ?? (() => undefined)}
          accessibilityHint="Return to the parcel list"
        />
      </Screen>
    );
  }

  return (
    <Screen accessibilityLabel="Authorize a collector">
      {onBack ? <LinkButton title="‹ Back" onPress={onBack} accessibilityHint="Return to the parcel list" /> : null}
      <SectionHeading title="Authorize a collector" level={1} />

      <ListRow title="Parcel" subtitle={`${parcel.trackingNumber} · ${parcel.provider}`} />

      <AppTextField
        label="Collector name"
        value={collectorName}
        onChangeText={setCollectorName}
        placeholder="Who is allowed to collect it?"
        autoCapitalize="words"
        {...(authorize.error?.fieldErrors.collectorName ? { error: authorize.error.fieldErrors.collectorName } : {})}
      />
      <AppTextField
        label="Relationship (optional)"
        value={relationship}
        onChangeText={setRelationship}
        placeholder="e.g. spouse, helper, neighbour"
        autoCapitalize="words"
      />
      <MasterDataDropdown
        label="Verification method"
        listKey={ParcelMasterDataKeys.ParcelVerificationMethod}
        masterData={resources.masterData}
        value={method}
        onChange={setMethod}
        placeholder="Use the community default"
        allowClear
        clearLabel="Community default"
      />
      {needsIdReference ? (
        <AppTextField
          label="Expected ID reference"
          value={idReference}
          onChangeText={setIdReference}
          placeholder="Government / photo-ID the guard will check"
          autoCapitalize="characters"
          {...(authorize.error?.fieldErrors.expectedIdReference
            ? { error: authorize.error.fieldErrors.expectedIdReference }
            : {})}
        />
      ) : null}

      {authorize.error && !authorize.error.fieldErrors.collectorName && !authorize.error.fieldErrors.expectedIdReference ? (
        <FormBanner message={authorize.error.message} tone="error" />
      ) : null}

      <AppButton
        title="Authorize collector"
        loading={authorize.running}
        disabled={!canSubmit}
        onPress={() => authorize.run()}
        accessibilityHint="Authorize this collector and get a one-time code and QR to share"
      />
    </Screen>
  );
}

/** Open the OS share sheet with the collection details so the resident can send them to the collector. */
async function shareAuthorization(result: AuthorizeCollectorResult, parcel: Parcel): Promise<void> {
  try {
    await Share.share({
      message:
        `Parcel collection for ${result.authorization.collectorName}\n` +
        `Parcel: ${parcel.trackingNumber} (${parcel.provider})\n` +
        `Verification: ${humanizeCode(result.authorization.verificationMethod)}\n` +
        `One-time code: ${result.otp}\n` +
        `QR token: ${result.qrToken}\n` +
        `Valid until: ${formatDateTime(result.authorization.expiresAtUtc)}`,
    });
  } catch {
    // Share cancelled/unavailable — nothing to do; the details stay on screen.
  }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
