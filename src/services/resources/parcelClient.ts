import type { ApiClient } from '@/services/api/client';
import type { PagedData } from '@/types/envelope';
import type { ListQuery } from '@/types/query';
import type {
  Parcel,
  CustodyLocation,
  ParcelAuthorization,
  AuthorizeCollectorResult,
  ParcelHandover,
  CustodyTimelineEntry,
} from '@/types/parcel';
import { buildQuery, listQueryParams } from './query';
import { newIdempotencyKey } from './idempotency';

/** Extra server-side filters for the parcel list (Req 28.5). */
export interface ParcelListFilters {
  readonly status?: string;
  readonly category?: string;
  readonly condition?: string;
  readonly recipientUnitId?: string;
  readonly custodyLocationId?: string;
  readonly isPriority?: boolean;
}

/** Body to register a received parcel at the gate/reception (Req 28.1). */
export interface RegisterParcelBody {
  readonly recipientUnitId: string;
  readonly trackingNumber: string;
  readonly provider: string;
  readonly category: string;
  readonly condition: string;
  readonly receiver?: string;
  readonly receivedLocation?: string;
  readonly photoFileId?: string;
  readonly conditionEvidenceFileId?: string;
}

/** Body to change a parcel's status through the configurable state machine (Req 28.2, 28.3). */
export interface ChangeParcelStatusBody {
  readonly toStatus: string;
  readonly reason?: string;
}

/** Body to create a custody location (secure bin/shelf). Duplicate code → CONFLICT (Req 29.1). */
export interface CreateCustodyLocationBody {
  readonly communityId: string;
  readonly code: string;
}

/** Body for a resident to authorize a collector for their own unit's parcel (Req 30.1). */
export interface AuthorizeCollectorBody {
  readonly collectorName: string;
  readonly collectorRelationship?: string;
  /** Verification-method code; omit to use the configured community default (Req 30.2). */
  readonly verificationMethod?: string;
  /** Expected government/photo-ID reference, required for id/combination methods (Req 30.2). */
  readonly expectedIdReference?: string;
}

/** Body for a guard to perform a verified handover (Req 30.2–30.4). */
export interface PerformHandoverBody {
  readonly parcelAuthorizationId: string;
  readonly otp?: string;
  readonly qrToken?: string;
  readonly presentedIdReference?: string;
  readonly proofFileId?: string;
}

/** Body to record a parcel lost/damaged + create a linked incident (Req 31.3). */
export interface RecordLostDamagedBody {
  readonly circumstances: string;
  readonly evidenceFileId?: string;
  readonly category?: string;
  readonly severity?: string;
}

/** Body to record a parcel returned to the delivery provider (Req 31.4). */
export interface RecordReturnedBody {
  readonly reason?: string;
}

/**
 * Typed client for the Phase 4 Parcel_Service HTTP surface (Req 28.x, 29.x, 30.x, 31.x). Thin,
 * envelope-aware wrapper over {@link ApiClient} — screens call `parcels.registerParcel(...)` instead
 * of hand-rolling fetch + query strings (steering: reuse the shared client). Lists are tenant/self
 * scoped server-side by the EF global query filter, so a resident principal sees only their own
 * unit's parcels without the screen asking for a scope.
 *
 * <p><b>At-most-once handover (Req 30.5).</b> {@link performHandover} sends a stable
 * `Idempotency-Key` header so a retry carrying the same key does not perform a second handover and
 * replays the first result. The backend REQUIRES the header, so the key is always sent. Unlike the
 * offline-aware gate exit capture, the handover is connectivity-required — it is never buffered
 * offline; the screen keeps the same key across retries so a flaky connection can't double-hand-over
 * or lose the record.</p>
 */
export class ParcelClient {
  constructor(
    private readonly api: ApiClient,
    private readonly idempotencyKey: () => string = newIdempotencyKey,
  ) {}

  // --- Parcels (Req 28.x) --------------------------------------------------------------------

  /** Guard registers a received parcel for a recipient unit in their community (Req 28.1). */
  registerParcel(body: RegisterParcelBody, idempotencyKey?: string): Promise<Parcel> {
    return this.api.post<Parcel>('/api/v1/parcels', {
      body,
      idempotencyKey: idempotencyKey ?? this.idempotencyKey(),
    });
  }

  listParcels(
    query: ListQuery = {},
    filters: ParcelListFilters = {},
    options?: { signal?: AbortSignal },
  ): Promise<PagedData<Parcel>> {
    const qs = buildQuery({
      ...listQueryParams(query),
      status: filters.status,
      category: filters.category,
      condition: filters.condition,
      recipientUnitId: filters.recipientUnitId,
      custodyLocationId: filters.custodyLocationId,
      isPriority: filters.isPriority,
    });
    return this.api.get<PagedData<Parcel>>(`/api/v1/parcels${qs}`, options);
  }

  getParcel(id: string, options?: { signal?: AbortSignal }): Promise<Parcel> {
    return this.api.get<Parcel>(`/api/v1/parcels/${id}`, options);
  }

  /** Change a parcel's status through the configurable state machine (Req 28.2, 28.3). */
  changeStatus(id: string, body: ChangeParcelStatusBody): Promise<Parcel> {
    return this.api.post<Parcel>(`/api/v1/parcels/${id}/status`, {
      body,
      idempotencyKey: this.idempotencyKey(),
    });
  }

  // --- Custody (Req 29.x) --------------------------------------------------------------------

  /** Create a custody location (secure bin/shelf). Duplicate code → CONFLICT (Req 29.1). */
  createCustodyLocation(body: CreateCustodyLocationBody): Promise<CustodyLocation> {
    return this.api.post<CustodyLocation>('/api/v1/custody-locations', {
      body,
      idempotencyKey: this.idempotencyKey(),
    });
  }

  /** Move a parcel into custody and assign it a custody location (Req 29.1, 29.4). */
  assignCustodyLocation(id: string, custodyLocationId: string): Promise<Parcel> {
    return this.api.post<Parcel>(`/api/v1/parcels/${id}/custody-location`, {
      body: { custodyLocationId },
      idempotencyKey: this.idempotencyKey(),
    });
  }

  // --- Authorizations + handover (Req 30.x) --------------------------------------------------

  /** Resident authorizes a collector for their own unit's parcel; returns one-time OTP + QR (Req 30.1). */
  authorizeCollector(parcelId: string, body: AuthorizeCollectorBody): Promise<AuthorizeCollectorResult> {
    return this.api.post<AuthorizeCollectorResult>(`/api/v1/parcels/${parcelId}/authorizations`, {
      body,
      idempotencyKey: this.idempotencyKey(),
    });
  }

  /**
   * Guard performs a verified, at-most-once handover (Req 30.2–30.5). Connectivity-REQUIRED: the key
   * is sent as the `Idempotency-Key` header the backend mandates. Pass a STABLE `idempotencyKey`
   * across retries of the SAME intended handover so a transient failure replays rather than
   * re-executes; a fresh key is generated only when the caller does not supply one.
   */
  performHandover(parcelId: string, body: PerformHandoverBody, idempotencyKey: string): Promise<ParcelHandover> {
    return this.api.post<ParcelHandover>(`/api/v1/parcels/${parcelId}/handover`, {
      body,
      idempotencyKey,
    });
  }

  // --- Timeline + lost/damaged/returned (Req 31.x) -------------------------------------------

  /** The chronological append-only custody timeline for a parcel (Req 31.5). */
  getCustodyTimeline(parcelId: string, options?: { signal?: AbortSignal }): Promise<CustodyTimelineEntry[]> {
    return this.api.get<CustodyTimelineEntry[]>(`/api/v1/parcels/${parcelId}/custody-timeline`, options);
  }

  /** Record a parcel lost/damaged + create a linked incident (Req 31.3). */
  recordLostDamaged(id: string, body: RecordLostDamagedBody): Promise<Parcel> {
    return this.api.post<Parcel>(`/api/v1/parcels/${id}/lost-damaged`, {
      body,
      idempotencyKey: this.idempotencyKey(),
    });
  }

  /** Record a parcel returned to the delivery provider (Req 31.4). */
  recordReturned(id: string, body: RecordReturnedBody): Promise<Parcel> {
    return this.api.post<Parcel>(`/api/v1/parcels/${id}/returned`, {
      body,
      idempotencyKey: this.idempotencyKey(),
    });
  }
}
