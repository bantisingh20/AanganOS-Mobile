
/** Mirror of `VisitPassDto` (Req 23.1). The OTP is NEVER on this shape — only {@link CreateVisitPassResult} carries the one-time plaintext. */
export interface VisitPass {
  readonly id: string;
  readonly communityId: string;
  readonly hostUnitId: string;
  readonly hostResidentId: string | null;
  readonly visitorName: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly vehicleNumber: string | null;
  readonly vehicleType: string | null;
  readonly numberOfPersons: number | null;
  readonly whomToMeet: string | null;
  readonly visitDateUtc: string | null;
  readonly photoFileId: string | null;
  /** Opaque QR token the gate scans (shareable with the visitor). */
  readonly qrToken: string;
  readonly validFromUtc: string;
  readonly validUntilUtc: string;
  readonly maxUses: number;
  readonly useCount: number;
  /** Configurable status code (active/used/expired/revoked). */
  readonly status: string;
}

/** Mirror of `CreateVisitPassResult` (Req 23.1): the created pass + the one-time plaintext OTP, returned exactly once. */
export interface CreateVisitPassResult {
  readonly pass: VisitPass;
  /** Plaintext OTP, returned ONCE so the resident can share it; never persisted or returned again. */
  readonly otp: string;
}

/** Mirror of `VisitorDto` (walk-in, Req 24.1). */
export interface Visitor {
  readonly id: string;
  readonly communityId: string;
  readonly hostUnitId: string;
  /** The host unit's number (resolved server-side), or null if unavailable. */
  readonly hostUnitNumber: string | null;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly qrToken: string | null;
  /** Configurable visitor-category code (`Visitor_Category` list). */
  readonly category: string;
  readonly photoFileId: string | null;
  readonly vehicleNumber: string | null;
  readonly gateLocation: string | null;
  /** Configurable ID-proof type code (`ID_Proof_Type` list), captured for reference. */
  readonly idProofType: string | null;
  readonly idProofNumber: string | null;
  readonly purpose: string | null;
  readonly whomToMeet: string | null;
  readonly expectedDurationMinutes: number | null;
  /** Configurable status code (pending/approved/rejected/...). */
  readonly status: string;
  readonly approvedByResidentId: string | null;
  readonly approvalDecisionAtUtc: string | null;
  /** Whether the walk-in may be admitted (only when approved, Req 24.4, 24.5). */
  readonly isAdmittable: boolean;
}

export interface RegisterWalkInResult {
  readonly visitor: Visitor;
  readonly autoApproved: boolean;
  readonly otp: string | null;
}

export interface VehicleLookupHostResident {
  readonly name: string;
  readonly phone: string | null;
  readonly residentType: string;
}

export interface VehicleLookupMatch {
  readonly matchType: 'resident' | 'visit_pass' | 'walk_in';
  readonly vehicleType: string | null;
  readonly personName: string;
  readonly personPhone: string | null;
  readonly personEmail: string | null;
  readonly unitId: string | null;
  readonly unitNumber: string | null;
  readonly status: string | null;
  readonly hostResidents: VehicleLookupHostResident[];
}

export interface VehicleLookupResult {
  readonly plate: string;
  readonly matches: VehicleLookupMatch[];
}

export type ScanAction = 'checked_in' | 'checked_out' | 'closed' | 'rejected';

export interface ScanAccessResult {
  readonly action: ScanAction;
  readonly authorizationType: string;
  readonly name: string;
  readonly reason: string | null;
}

/** Mirror of `VerifyVisitPassResult` — outcome of a gate verification by QR/OTP (Req 23.3, 23.4). */
export interface VerifyVisitPassResult {
  readonly accepted: boolean;
  /** Why rejected (expired/used/revoked/invalid), or null when accepted. */
  readonly rejectionReason: string | null;
  /** The verified pass (with incremented use count) when accepted; null when rejected. */
  readonly pass: VisitPass | null;
}

/** Mirror of `RecurringVisitorDto` (Req 25.2). */
export interface RecurringVisitor {
  readonly id: string;
  readonly communityId: string;
  readonly hostUnitId: string;
  readonly hostResidentId: string;
  readonly name: string;
  readonly phone: string | null;
  readonly category: string;
  /** 7-bit mask of authorized days (Sun=1 … Sat=64). */
  readonly daysOfWeek: number;
  readonly startDate: string;
  readonly endDate: string;
  readonly dailyStartMinutes: number | null;
  readonly dailyEndMinutes: number | null;
  /** Configurable status code (active/revoked). */
  readonly status: string;
  readonly photoFileId: string | null;
}

/** Mirror of `EntryExitEventDto` (Req 25.3). `exitTsUtc` null while the visitor is still on-site (the open event). */
export interface EntryExitEvent {
  readonly id: string;
  readonly communityId: string;
  readonly gateId: string | null;
  readonly gateLabel: string | null;
  readonly destinationUnitId: string | null;
  readonly visitorId: string | null;
  readonly visitPassId: string | null;
  readonly recurringVisitorId: string | null;
  readonly visitorName: string;
  readonly category: string;
  readonly vehicleNumber: string | null;
  readonly entryTsUtc: string;
  readonly exitTsUtc: string | null;
  readonly hostUnitNumber: string | null;
  readonly visitorPhone: string | null;
  readonly photoFileId: string | null;
  readonly whomToMeet: string | null;
}

/** Mirror of `WatchlistEntryDto` (Req 26.1). */
export interface WatchlistEntry {
  readonly id: string;
  readonly communityId: string;
  /** Configurable subject-type code (person/vehicle). */
  readonly subjectType: string;
  readonly subjectIdentifier: string;
  readonly reason: string;
  /** Configurable severity code. */
  readonly severity: string;
  /** Configurable status code (active/cleared). */
  readonly status: string;
}

/** Mirror of `SosAlertDto` (Req 27.3). */
export interface SosAlert {
  readonly id: string;
  readonly communityId: string;
  readonly raisedByUserId: string;
  readonly unitId: string | null;
  readonly location: string | null;
  /** Configurable status code (active/acknowledged/resolved). */
  readonly status: string;
  readonly raisedAtUtc: string;
}

/** Well-known visit-pass status codes (mirror of `VisitPassStatuses`). Branch hints only; the list is editable. */
export const VisitPassStatus = {
  Active: 'active',
  Used: 'used',
  Expired: 'expired',
  Revoked: 'revoked',
} as const;

/** Well-known walk-in visitor status codes (mirror of `VisitorStatuses`). */
export const VisitorStatus = {
  Pending: 'pending',
  Approved: 'approved',
  Rejected: 'rejected',
  Expired: 'expired',
} as const;

/** Well-known recurring-visitor status codes (mirror of `RecurringVisitorStatuses`). */
export const RecurringVisitorStatus = {
  Active: 'active',
  Revoked: 'revoked',
} as const;

/** Well-known watchlist status codes (mirror of `WatchlistStatuses`). */
export const WatchlistStatus = {
  Active: 'active',
  Cleared: 'cleared',
} as const;

/** Well-known SOS status codes (mirror of `SosAlertStatuses`). */
export const SosAlertStatus = {
  Active: 'active',
  Acknowledged: 'acknowledged',
  Resolved: 'resolved',
} as const;

/**
 * Gate master-data list keys the backend seeds (mirror of the Gate `MasterDataKeys`). Dropdowns
 * resolve their options from `GET /api/v1/master-data/{listKey}` — never a hardcoded option array
 * (steering: no hardcoding; Req 8.4, 24.1, 25.1, 26.1).
 */
export const GateMasterDataKeys = {
  VisitorCategory: 'Visitor_Category',
  IdProofType: 'ID_Proof_Type',
  VehicleType: 'Vehicle_Type',
  WatchlistSubjectType: 'Watchlist_Subject_Type',
  WatchlistSeverity: 'Watchlist_Severity',
  IncidentCategory: 'Incident_Category',
  IncidentSeverity: 'Incident_Severity',
} as const;
