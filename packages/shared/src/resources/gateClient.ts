import type { ApiClient } from '../api/client';
import type { PagedData } from '../models/envelope';
import type { ListQuery } from '../models/query';
import type {
  VisitPass,
  CreateVisitPassResult,
  Visitor,
  VerifyVisitPassResult,
  RecurringVisitor,
  EntryExitEvent,
} from '../models/gate';
import { buildQuery, listQueryParams } from './query';
import { newIdempotencyKey } from './idempotency';

/** Extra server-side filters for the visit-pass list (Req 23.5). */
export interface VisitPassListFilters {
  readonly status?: string;
  readonly hostUnitId?: string;
}

/** Extra server-side filters for the walk-in visitor list / approval queue (Req 24.2). */
export interface VisitorListFilters {
  readonly status?: string;
  readonly category?: string;
  readonly hostUnitId?: string;
  /** Registered-date window (ISO). Scopes the walk-in list to a day/range (createdAtUtc >= / <=). */
  readonly fromDate?: string;
  readonly toDate?: string;
}

/** Extra server-side filters for the recurring-visitor list (Req 25.2). */
export interface RecurringVisitorListFilters {
  readonly status?: string;
  readonly category?: string;
  readonly hostUnitId?: string;
}

/** Extra server-side filters for the entry/exit log (Req 25.4, 25.5). */
export interface EntryExitListFilters {
  readonly category?: string;
  /** true = still on-site (no exit yet). */
  readonly open?: boolean;
  readonly destinationUnitId?: string;
  readonly visitorId?: string;
}

/** Body to create a pre-approved visit pass for the resident's own unit (Req 23.1). */
export interface CreateVisitPassBody {
  readonly hostUnitId: string;
  readonly hostResidentId?: string;
  readonly visitorName: string;
  readonly validFromUtc?: string;
  readonly validUntilUtc?: string;
  readonly maxUses?: number;
  readonly phone?: string;
  readonly vehicleNumber?: string;
  readonly vehicleType?: string;
  readonly numberOfPersons?: number;
  readonly whomToMeet?: string;
  readonly visitDateUtc?: string;
  readonly photoFileId?: string;
}

/** Body to register a walk-in visitor at the gate (Req 24.1). */
export interface RegisterWalkInBody {
  readonly hostUnitId: string;
  readonly name: string;
  readonly phone?: string;
  readonly category: string;
  readonly photoFileId?: string;
  readonly vehicleNumber?: string;
  readonly gateLocation?: string;
  readonly idProofType?: string;
  readonly idProofNumber?: string;
  readonly purpose?: string;
  readonly whomToMeet?: string;
  readonly expectedDurationMinutes?: number;
}

/** Body to define a recurring visitor for the resident's own unit (Req 25.2). */
export interface CreateRecurringVisitorBody {
  readonly hostUnitId: string;
  readonly hostResidentId: string;
  readonly name: string;
  readonly phone?: string;
  readonly category: string;
  /** 7-bit day mask (Sun=1 … Sat=64), 1–127. */
  readonly daysOfWeek: number;
  readonly startDate: string;
  readonly endDate: string;
  readonly dailyStartMinutes?: number;
  readonly dailyEndMinutes?: number;
}

/** Identifies WHICH authorization admitted an entry/exit — exactly one id is set (Req 25.3). */
export interface EntryExitAuthorization {
  readonly visitorId?: string;
  readonly visitPassId?: string;
  readonly recurringVisitorId?: string;
}

/** Body to record a visitor ENTRY at a gate (Req 25.3). */
export interface RecordEntryBody extends EntryExitAuthorization {
  readonly gateId?: string;
  readonly gateLabel?: string;
  readonly vehicleNumber?: string;
}

/** Body to record a visitor EXIT at a gate (Req 25.3). */
export interface RecordExitBody extends EntryExitAuthorization {
  readonly gateId?: string;
  readonly gateLabel?: string;
}

/**
 * Typed client for the Phase 3 Gate_Service HTTP surface (Req 23.x, 24.x, 25.x). Thin,
 * envelope-aware wrapper over {@link ApiClient} — screens call `gate.verifyVisitPass(...)` instead
 * of hand-rolling fetch + query strings (steering: reuse the shared client). Lists are tenant/self
 * scoped server-side by the EF global query filter, so a resident principal sees only their own
 * unit's passes/visitors/recurring without the screen asking for a scope.
 *
 * <p>Write actions pass an `Idempotency-Key` so a retried create/verify/entry/exit replays the
 * original result instead of re-executing — the key to the offline-aware gate flows: a queued entry
 * capture carries a stable key, so re-sending after reconnect records the entry at most once.</p>
 */
export class GateClient {
  constructor(
    private readonly api: ApiClient,
    private readonly idempotencyKey: () => string = newIdempotencyKey,
  ) {}

  // --- Visit passes (Req 23.x) ---------------------------------------------------------------

  /** Create a pre-approved pass for the resident's own unit; returns the pass + one-time OTP (Req 23.1). */
  createVisitPass(body: CreateVisitPassBody): Promise<CreateVisitPassResult> {
    return this.api.post<CreateVisitPassResult>('/api/v1/visit-passes', {
      body,
      idempotencyKey: this.idempotencyKey(),
    });
  }

  /** Guard verifies a pass by QR token or OTP (Req 23.3, 23.4). Exactly one identifier is used. */
  verifyVisitPass(input: { qrToken?: string; otp?: string }, idempotencyKey?: string): Promise<VerifyVisitPassResult> {
    return this.api.post<VerifyVisitPassResult>('/api/v1/visit-passes/verify', {
      body: { qrToken: input.qrToken, otp: input.otp },
      idempotencyKey: idempotencyKey ?? this.idempotencyKey(),
    });
  }

  listVisitPasses(
    query: ListQuery = {},
    filters: VisitPassListFilters = {},
    options?: { signal?: AbortSignal },
  ): Promise<PagedData<VisitPass>> {
    const qs = buildQuery({
      ...listQueryParams(query),
      status: filters.status,
      hostUnitId: filters.hostUnitId,
    });
    return this.api.get<PagedData<VisitPass>>(`/api/v1/visit-passes${qs}`, options);
  }

  getVisitPass(id: string, options?: { signal?: AbortSignal }): Promise<VisitPass> {
    return this.api.get<VisitPass>(`/api/v1/visit-passes/${id}`, options);
  }

  // --- Walk-ins / visitors (Req 24.x) --------------------------------------------------------

  /** Guard registers a walk-in; starts pending, host residents notified (Req 24.1). */
  registerWalkIn(body: RegisterWalkInBody, idempotencyKey?: string): Promise<Visitor> {
    return this.api.post<Visitor>('/api/v1/visitors', {
      body,
      idempotencyKey: idempotencyKey ?? this.idempotencyKey(),
    });
  }

  /** Resident approves a pending walk-in for their own unit (Req 24.3). */
  approveWalkIn(id: string, approvingResidentId: string): Promise<Visitor> {
    return this.api.post<Visitor>(`/api/v1/visitors/${id}/approve`, {
      body: { approvingResidentId },
      idempotencyKey: this.idempotencyKey(),
    });
  }

  /** Resident rejects a pending walk-in with an optional reason (Req 24.4). */
  rejectWalkIn(id: string, rejectingResidentId: string, reason?: string): Promise<Visitor> {
    return this.api.post<Visitor>(`/api/v1/visitors/${id}/reject`, {
      body: { rejectingResidentId, reason },
      idempotencyKey: this.idempotencyKey(),
    });
  }

  listVisitors(
    query: ListQuery = {},
    filters: VisitorListFilters = {},
    options?: { signal?: AbortSignal },
  ): Promise<PagedData<Visitor>> {
    const qs = buildQuery({
      ...listQueryParams(query),
      status: filters.status,
      category: filters.category,
      hostUnitId: filters.hostUnitId,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
    });
    return this.api.get<PagedData<Visitor>>(`/api/v1/visitors${qs}`, options);
  }

  getVisitor(id: string, options?: { signal?: AbortSignal }): Promise<Visitor> {
    return this.api.get<Visitor>(`/api/v1/visitors/${id}`, options);
  }

  // --- Entry / exit (Req 25.3–25.5) ----------------------------------------------------------

  /** Record an entry against exactly one admitting authorization (Req 25.3). Pass a stable key for offline re-sync. */
  recordEntry(body: RecordEntryBody, idempotencyKey?: string): Promise<EntryExitEvent> {
    return this.api.post<EntryExitEvent>('/api/v1/entry-events/entry', {
      body,
      idempotencyKey: idempotencyKey ?? this.idempotencyKey(),
    });
  }

  /** Close the open entry for the same authorization (Req 25.3). */
  recordExit(body: RecordExitBody, idempotencyKey?: string): Promise<EntryExitEvent> {
    return this.api.post<EntryExitEvent>('/api/v1/entry-events/exit', {
      body,
      idempotencyKey: idempotencyKey ?? this.idempotencyKey(),
    });
  }

  listEntryExitEvents(
    query: ListQuery = {},
    filters: EntryExitListFilters = {},
    options?: { signal?: AbortSignal },
  ): Promise<PagedData<EntryExitEvent>> {
    const qs = buildQuery({
      ...listQueryParams(query),
      category: filters.category,
      open: filters.open,
      destinationUnitId: filters.destinationUnitId,
      visitorId: filters.visitorId,
    });
    return this.api.get<PagedData<EntryExitEvent>>(`/api/v1/entry-events${qs}`, options);
  }

  // --- Recurring visitors (Req 25.2) ---------------------------------------------------------

  /** Resident defines a recurring visitor for their own unit (Req 25.2). */
  createRecurringVisitor(body: CreateRecurringVisitorBody): Promise<RecurringVisitor> {
    return this.api.post<RecurringVisitor>('/api/v1/recurring-visitors', {
      body,
      idempotencyKey: this.idempotencyKey(),
    });
  }

  /** Resident revokes their recurring visitor (Req 25.2). */
  revokeRecurringVisitor(id: string): Promise<RecurringVisitor> {
    return this.api.post<RecurringVisitor>(`/api/v1/recurring-visitors/${id}/revoke`, {
      idempotencyKey: this.idempotencyKey(),
    });
  }

  listRecurringVisitors(
    query: ListQuery = {},
    filters: RecurringVisitorListFilters = {},
    options?: { signal?: AbortSignal },
  ): Promise<PagedData<RecurringVisitor>> {
    const qs = buildQuery({
      ...listQueryParams(query),
      status: filters.status,
      category: filters.category,
      hostUnitId: filters.hostUnitId,
    });
    return this.api.get<PagedData<RecurringVisitor>>(`/api/v1/recurring-visitors${qs}`, options);
  }

  getRecurringVisitor(id: string, options?: { signal?: AbortSignal }): Promise<RecurringVisitor> {
    return this.api.get<RecurringVisitor>(`/api/v1/recurring-visitors/${id}`, options);
  }
}
