import type { ApiClient } from '../api/client';
import type { PagedData } from '../models/envelope';
import type { ListQuery } from '../models/query';
import type {
  Resident,
  ResidentMe,
  EmergencyContact,
  HouseholdMember,
  ResidentHouseholdUnit,
  CommunicationPreference,
  CommunicationPreferenceUpdate,
} from '../models/resident';
import { buildQuery, listQueryParams } from './query';
import { newIdempotencyKey } from './idempotency';

/**
 * Editable resident contact details (Req 15.1). Mirrors the backend UpdateResidentBody: the
 * `update*` flags distinguish "set this (possibly null) value" from "leave unchanged", so a
 * resident can clear or change email/phone deliberately.
 */
export interface UpdateResidentBody {
  readonly name?: string;
  readonly residentType?: string;
  readonly email?: string | null;
  readonly updateEmail?: boolean;
  readonly phone?: string | null;
  readonly updatePhone?: boolean;
  /** Optional photo reference. Pair with `updatePhotoFileId` to apply (null clears it). */
  readonly photoFileId?: string | null;
  readonly updatePhotoFileId?: boolean;
}

/** Create a resident record (Req 15.1). Used to add a new household member (person) before associating them to a unit. */
export interface CreateResidentBody {
  readonly communityId: string;
  readonly name: string;
  readonly residentType: string;
  readonly email?: string;
  readonly phone?: string;
  /** Optional login account to link; omit for a member with no app login (managed by admin). */
  readonly userId?: string;
  /** Optional File_Service photo reference; omit when none captured. */
  readonly photoFileId?: string;
}

/** The signed-in resident's own KYC submission (draft/rejected → pending). All fields optional. */
export interface SubmitKycBody {
  readonly residentType?: string;
  readonly dateOfBirth?: string;
  readonly gender?: string;
  readonly moveInDate?: string;
  readonly govtIdType?: string;
  readonly selfieBase64?: string;
  readonly govtIdFrontBase64?: string;
  readonly govtIdBackBase64?: string;
}

/** Add a family/household member to a unit (Req 15.2). */
export interface AddHouseholdBody {
  readonly unitId: string;
  readonly relationship: string;
  readonly startDate?: string;
}

/** Create a login for a resident (Req 3.1). Password is plaintext over HTTPS; hashed server-side. */
export interface CreateResidentLoginBody {
  readonly identifier: string;
  readonly password: string;
  /** Optional role name; omit for the default "Resident" role. */
  readonly roleName?: string;
}

/** Result of creating a resident login — the new user id + identifier (never the password). */
export interface ResidentLoginResult {
  readonly userId: string;
  readonly identifier: string;
  readonly roleAssigned: string | null;
}

/** Add an emergency contact (Req 15.3). */
export interface AddEmergencyContactBody {
  readonly name: string;
  readonly phone: string;
  readonly relationship: string;
}

/**
 * Extra server-side filters for the resident list (Req 15.4), on top of the shared {@link ListQuery}.
 * The verification queue is just this list with `verificationStatus: 'pending'`.
 */
export interface ResidentListFilters {
  readonly verificationStatus?: string;
  readonly residentType?: string;
}

/**
 * Typed client for `/api/v1/residents` — the list (Req 15.4), the verification workflow
 * (verify/reject/resubmit, Req 17.x), emergency contacts (Req 15.3) and communication preferences
 * (Req 20.1, 20.2, 66.3). Thin, envelope-aware wrapper over {@link ApiClient}.
 *
 * <p>The signed-in person's own "who am I" (name + units) comes from {@link me} — a single
 * self-targeted call. Do NOT list residents and filter by userId client-side to find yourself.</p>
 *
 * <p>The write actions pass an `Idempotency-Key` so a retried approve/reject/resubmit replays the
 * original result instead of re-running the transition (the Task 12.3 approve-once workflow).</p>
 */
export class ResidentsClient {
  // NOTE: the field is named differently from the imported `newIdempotencyKey` factory on purpose —
  // a constructor param default referencing a same-named import binds to the (undefined) parameter,
  // not the import, leaving `this.newIdempotencyKey` undefined. Renaming avoids that shadowing bug.
  constructor(
    private readonly api: ApiClient,
    private readonly makeIdempotencyKey: () => string = newIdempotencyKey,
  ) {}

  list(
    query: ListQuery = {},
    filters: ResidentListFilters = {},
    options?: { signal?: AbortSignal },
  ): Promise<PagedData<Resident>> {
    const qs = buildQuery({
      ...listQueryParams(query),
      verificationStatus: filters.verificationStatus,
      residentType: filters.residentType,
    });
    return this.api.get<PagedData<Resident>>(`/api/v1/residents${qs}`, options);
  }

  get(id: string, options?: { signal?: AbortSignal }): Promise<Resident> {
    return this.api.get<Resident>(`/api/v1/residents/${id}`, options);
  }

  /**
   * The SIGNED-IN person's own resident row + their own unit memberships (Resident.UserId == token
   * user). One self-targeted call for "who am I" — the header name and the self-service unit pickers.
   * `resident` is null when the principal has no linked resident row (e.g. superadmin). Never
   * lists-and-filters residents to find yourself.
   */
  me(options?: { signal?: AbortSignal }): Promise<ResidentMe> {
    return this.api.get<ResidentMe>('/api/v1/residents/me', options);
  }

  /** The signed-in resident submits their own KYC (selfie + ID + details); draft/rejected → pending. */
  submitKyc(body: SubmitKycBody): Promise<Resident> {
    return this.api.post<Resident>('/api/v1/residents/me/submit-kyc', {
      body,
      idempotencyKey: this.makeIdempotencyKey(),
    });
  }

  /** Create a resident record (Req 15.1) — e.g. a new household/family member person. */
  create(body: CreateResidentBody): Promise<Resident> {
    return this.api.post<Resident>('/api/v1/residents', {
      body,
      idempotencyKey: this.makeIdempotencyKey(),
    });
  }

  /** Soft-delete a resident record (Req 15.5). Retained + retrievable with includeArchived. */
  delete(id: string): Promise<unknown> {
    return this.api.delete<unknown>(`/api/v1/residents/${id}`);
  }

  /**
   * Create a login (User) for a resident and link it (Req 3.1). The password is sent over HTTPS and
   * hashed server-side; a role (default "Resident") is assigned scoped to the resident's community.
   * Returns the new user id + identifier. Resident already has a login / duplicate identifier → conflict.
   */
  createLogin(id: string, body: CreateResidentLoginBody): Promise<ResidentLoginResult> {
    return this.api.post<ResidentLoginResult>(`/api/v1/residents/${id}/login`, {
      body,
      idempotencyKey: this.makeIdempotencyKey(),
    });
  }

  /**
   * Update the resident's own editable contact details (Req 15.1). Only the fields the caller wants
   * to change are sent; `updateEmail`/`updatePhone` flags tell the server to apply a (possibly null)
   * value vs leave it unchanged (matching the backend's UpdateResidentBody contract).
   */
  update(id: string, body: UpdateResidentBody): Promise<Resident> {
    return this.api.put<Resident>(`/api/v1/residents/${id}`, { body });
  }

  /** Add a family/household member association to a unit (Req 15.2). */
  addHousehold(id: string, body: AddHouseholdBody): Promise<HouseholdMember> {
    return this.api.post<HouseholdMember>(`/api/v1/residents/${id}/household`, {
      body,
      idempotencyKey: this.makeIdempotencyKey(),
    });
  }

  /** Add an emergency contact for the resident (Req 15.3). */
  addEmergencyContact(id: string, body: AddEmergencyContactBody): Promise<EmergencyContact> {
    return this.api.post<EmergencyContact>(`/api/v1/residents/${id}/emergency-contacts`, {
      body,
      idempotencyKey: this.makeIdempotencyKey(),
    });
  }

  /** Approve a pending resident → verified (Req 17.2). */
  approve(id: string): Promise<Resident> {
    return this.api.post<Resident>(`/api/v1/residents/${id}/verify`, {
      idempotencyKey: this.makeIdempotencyKey(),
    });
  }

  /** Reject a pending resident with a required reason (Req 17.3). */
  reject(id: string, reason: string): Promise<Resident> {
    return this.api.post<Resident>(`/api/v1/residents/${id}/reject`, {
      body: { reason },
      idempotencyKey: this.makeIdempotencyKey(),
    });
  }

  /** Resubmit a rejected resident → pending (Req 17.1). */
  resubmit(id: string): Promise<Resident> {
    return this.api.post<Resident>(`/api/v1/residents/${id}/resubmit`, {
      idempotencyKey: this.makeIdempotencyKey(),
    });
  }

  /** The resident's OWN active unit memberships (+ unit details) — their real units, not the community (Req 15.2). */
  listHousehold(id: string, options?: { signal?: AbortSignal }): Promise<ResidentHouseholdUnit[]> {
    return this.api.get<ResidentHouseholdUnit[]>(`/api/v1/residents/${id}/household`, options);
  }

  /** A resident's emergency contacts (Req 15.3). */
  listEmergencyContacts(id: string, options?: { signal?: AbortSignal }): Promise<EmergencyContact[]> {
    return this.api.get<EmergencyContact[]>(`/api/v1/residents/${id}/emergency-contacts`, options);
  }

  /** A resident's per-category communication preferences (Req 20.1). Self-scoped for a resident. */
  getCommunicationPreferences(
    id: string,
    options?: { signal?: AbortSignal },
  ): Promise<CommunicationPreference[]> {
    return this.api.get<CommunicationPreference[]>(
      `/api/v1/residents/${id}/communication-preferences`,
      options,
    );
  }

  /** Save per-category opt-in changes; returns the full resolved preference set (Req 20.2). */
  setCommunicationPreferences(
    id: string,
    preferences: readonly CommunicationPreferenceUpdate[],
  ): Promise<CommunicationPreference[]> {
    return this.api.put<CommunicationPreference[]>(
      `/api/v1/residents/${id}/communication-preferences`,
      { body: { preferences } },
    );
  }
}

