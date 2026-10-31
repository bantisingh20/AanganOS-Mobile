/**
 * Resident module read models — mirror the backend `ResidentDto`, `EmergencyContactDto`,
 * `HouseholdMemberDto`, the asset DTOs (`VehicleDto`/`PetDto`) and the communication-preference DTO
 * 1:1 (Req 15.x, 17.x, 19.x, 20.x). Verification status is a configurable code; it is never set by
 * the client — the verify/reject/resubmit actions drive the transitions (Req 17.x).
 */

/** Well-known resident verification status codes (from the `Resident_Verification_Status` list). */
export const ResidentVerificationStatus = {
  Draft: 'draft',
  Pending: 'pending',
  Verified: 'verified',
  Rejected: 'rejected',
} as const;

export type ResidentVerificationStatusCode =
  (typeof ResidentVerificationStatus)[keyof typeof ResidentVerificationStatus];

/** Mirror of `ResidentDto` (Req 15.1). */
export interface Resident {
  readonly id: string;
  readonly communityId: string;
  readonly userId: string | null;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  /** Configurable resident-type code (`Resident_Type` list). */
  readonly residentType: string;
  /** Verification status code; `pending` on create (Req 15.1). */
  readonly verificationStatus: string;
  /** Reason recorded on rejection, else null (Req 17.3). */
  readonly rejectionReason: string | null;
  readonly isArchived: boolean;
  /** Optional File_Service reference to the resident's photo, else null. Never mandatory. */
  readonly photoFileId: string | null;
  readonly dateOfBirth: string | null;
  readonly gender: string | null;
  readonly moveInDate: string | null;
  readonly govtIdType: string | null;
  readonly govtIdFrontFileId: string | null;
  readonly govtIdBackFileId: string | null;
  readonly loginStatus: string | null;
}

/**
 * Mirror of `ResidentHouseholdUnitDto` — one of the signed-in resident's OWN active unit
 * memberships (the unit they belong to + their relationship). Returned by
 * `GET /residents/{id}/household`; used to resolve a resident's own unit(s) instead of listing the
 * whole community.
 */
export interface ResidentHouseholdUnit {
  readonly unitId: string;
  readonly unitNumber: string;
  readonly unitType: string;
  readonly unitStatus: string;
  readonly floor: string | null;
  readonly communityId: string;
  readonly relationship: string;
  readonly startDate: string;
}

/**
 * Mirror of `ResidentMeDto` — the SIGNED-IN principal's own resident row + their own active unit
 * memberships, from `GET /api/v1/residents/me`. `resident` is null when the principal has no linked
 * resident row (e.g. a platform superadmin), so callers fall back to the login identifier.
 */
export interface ResidentMe {
  readonly resident: Resident | null;
  readonly units: ResidentHouseholdUnit[];
}

/** Mirror of `EmergencyContactDto` (Req 15.3). */
export interface EmergencyContact {
  readonly id: string;
  readonly residentId: string;
  readonly name: string;
  readonly phone: string;
  readonly relationship: string;
}

/** Mirror of `HouseholdMemberDto` (Req 15.2). `endDate` null while the association is active. */
export interface HouseholdMember {
  readonly id: string;
  readonly communityId: string;
  readonly unitId: string;
  readonly residentId: string;
  readonly relationship: string;
  readonly startDate: string;
  readonly endDate: string | null;
}

/** Mirror of `VehicleDto` (Req 19.1, 19.2). */
export interface Vehicle {
  readonly id: string;
  readonly communityId: string;
  readonly unitId: string;
  readonly registrationNumber: string;
  /** Configurable vehicle-type code (`Vehicle_Type` list). */
  readonly vehicleType: string;
}

/** Mirror of `PetDto` (Req 19.3). */
export interface Pet {
  readonly id: string;
  readonly communityId: string;
  readonly unitId: string;
  /** Configurable pet-type code (`Pet_Type` list). */
  readonly petType: string;
  readonly name: string | null;
}

/** Mirror of `CommunicationPreferenceDto` (Req 20.1). */
export interface CommunicationPreference {
  /** Notification-category code (from the `Notification_Category` list). */
  readonly category: string;
  readonly optedIn: boolean;
}

/** One per-category opt-in change in a `PUT .../communication-preferences` body (Req 20.2). */
export interface CommunicationPreferenceUpdate {
  readonly category: string;
  readonly optedIn: boolean;
}
