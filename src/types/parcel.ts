/**
 * Phase 4 Parcel_Service read models — mirror the backend `CommunityOS.Application.Parcel` DTOs 1:1
 * (Req 28.x, 29.x, 30.x, 31.x). Read-only shapes the mobile parcel screens list/view; the write
 * actions live on the {@link ParcelClient}. Every status/category/condition/verification-method is a
 * configurable code resolved from master-data (steering: no hardcoding) — the constants here are
 * only the stable list KEYS and the well-known status codes the UI branches on, never a closed set.
 *
 * <p>Secrets are never on a read shape: the one-time OTP + QR token are returned exactly once on
 * {@link AuthorizeCollectorResult} at authorize time, mirroring the visit-pass OTP contract.</p>
 */

/** Mirror of `ParcelDto` (Req 28.1). */
export interface Parcel {
  readonly id: string;
  readonly communityId: string;
  readonly recipientUnitId: string;
  readonly trackingNumber: string;
  readonly provider: string;
  /** Configurable parcel-category code (`Parcel_Category` list). */
  readonly category: string;
  /** Configurable parcel-status code (`Parcel_Status` list). */
  readonly status: string;
  /** Configurable recorded package-condition code (`Parcel_Condition` list). */
  readonly condition: string;
  readonly receiver: string | null;
  readonly receivedLocation: string | null;
  readonly receivedAtUtc: string;
  readonly photoFileId: string | null;
  readonly conditionEvidenceFileId: string | null;
  /** Whether the parcel is flagged priority (medicine/perishable/urgent, Req 29.3). */
  readonly isPriority: boolean;
  /** The custody location the parcel is currently held in while in custody, or null (Req 29.1). */
  readonly custodyLocationId: string | null;
}

/** Mirror of `CustodyLocationDto` — a secure bin/shelf parcels are held in (Req 29.1). */
export interface CustodyLocation {
  readonly id: string;
  readonly communityId: string;
  readonly code: string;
}

/**
 * Mirror of `ParcelAuthorizationDto` (Req 30.1). The OTP/QR secrets are NEVER on this shape — only
 * {@link AuthorizeCollectorResult} carries the one-time plaintext OTP + QR token at create.
 */
export interface ParcelAuthorization {
  readonly id: string;
  readonly communityId: string;
  readonly parcelId: string;
  readonly recipientUnitId: string;
  readonly collectorName: string;
  readonly collectorRelationship: string | null;
  /** Configurable verification-method code the handover enforces (`Parcel_Verification_Method`, Req 30.2). */
  readonly verificationMethod: string;
  readonly expiresAtUtc: string;
  readonly isUsed: boolean;
}

/**
 * Mirror of `AuthorizeCollectorResult` (Req 30.1): the created authorization + the one-time OTP and
 * QR token, returned exactly once so the resident can share them with the collector. Only the salted
 * hash of the OTP is persisted server-side; the plaintext is never returned again.
 */
export interface AuthorizeCollectorResult {
  readonly authorization: ParcelAuthorization;
  /** Plaintext OTP, returned ONCE so the resident can share it; never persisted or returned again. */
  readonly otp: string;
  /** Opaque QR token to share with the collector, returned ONCE. */
  readonly qrToken: string;
}

/** Mirror of `ParcelHandoverDto` — a completed verified handover (Req 30.4). */
export interface ParcelHandover {
  readonly id: string;
  readonly communityId: string;
  readonly parcelId: string;
  readonly parcelAuthorizationId: string | null;
  readonly collectorName: string;
  readonly collectorRelationship: string | null;
  readonly verificationMethod: string;
  readonly proofFileId: string | null;
  readonly guardUserId: string | null;
  readonly handedOverAtUtc: string;
}

/** Mirror of `CustodyTimelineEntryDto` — one append-only custody event (Req 31.1, 31.5). */
export interface CustodyTimelineEntry {
  readonly id: string;
  readonly communityId: string;
  readonly parcelId: string;
  /** The custody event type code (registered / status_changed / custody_assigned / handed_over / lost_damaged / returned / sla_escalated). */
  readonly eventType: string;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly actingUserId: string | null;
  readonly detail: string | null;
  readonly occurredAtUtc: string;
}

/** Well-known parcel-status codes (mirror of `ParcelStatuses`). Branch hints only; the list is editable. */
export const ParcelStatus = {
  Expected: 'expected',
  Received: 'received',
  OwnerNotAvailable: 'owner_not_available',
  InCustody: 'in_custody',
  ReadyForPickup: 'ready_for_pickup',
  HandedOver: 'handed_over',
  Returned: 'returned',
  LostDamaged: 'lost_damaged',
} as const;

/** Well-known parcel-category codes (mirror of `ParcelCategories`). */
export const ParcelCategory = {
  Standard: 'standard',
  Medicine: 'medicine',
  Perishable: 'perishable',
  Urgent: 'urgent',
  Document: 'document',
} as const;

/** Well-known parcel-verification-method codes (mirror of `ParcelVerificationMethods`, Req 30.2). */
export const ParcelVerificationMethod = {
  Otp: 'otp',
  Qr: 'qr',
  Id: 'id',
  Combination: 'combination',
} as const;

/** Well-known custody-timeline event-type codes (branch hints only). */
export const CustodyTimelineEventType = {
  Registered: 'registered',
  StatusChanged: 'status_changed',
  CustodyAssigned: 'custody_assigned',
  HandedOver: 'handed_over',
  LostDamaged: 'lost_damaged',
  Returned: 'returned',
  SlaEscalated: 'sla_escalated',
} as const;

/**
 * Parcel master-data list keys the backend seeds (mirror of the Parcel `MasterDataKeys`). Dropdowns
 * resolve their options from `GET /api/v1/master-data/{listKey}` — never a hardcoded option array
 * (steering: no hardcoding; Req 8.4, 28.1, 28.2, 30.2).
 */
export const ParcelMasterDataKeys = {
  ParcelStatus: 'Parcel_Status',
  ParcelCategory: 'Parcel_Category',
  ParcelCondition: 'Parcel_Condition',
  ParcelVerificationMethod: 'Parcel_Verification_Method',
} as const;
