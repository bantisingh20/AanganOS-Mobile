import type { ApiClient } from '@/services/api/client';
import type { PagedData } from '@/types/envelope';
import type { ListQuery } from '@/types/query';
import type { WatchlistEntry, SosAlert } from '@/types/gate';
import { buildQuery, listQueryParams } from './query';
import { newIdempotencyKey } from './idempotency';

/** Extra server-side filters for the watchlist list (Req 26.3). */
export interface WatchlistListFilters {
  readonly status?: string;
  readonly subjectType?: string;
  readonly severity?: string;
}

/** Extra server-side filters for the SOS-alert list (Req 27.3). */
export interface SosListFilters {
  readonly status?: string;
}

/** Body to add a watchlist entry (Req 26.1). */
export interface AddWatchlistEntryBody {
  readonly communityId: string;
  readonly subjectType: string;
  readonly subjectIdentifier: string;
  readonly reason: string;
  readonly severity: string;
}

/** Body to raise an SOS alert (Req 27.3). */
export interface RaiseSosBody {
  readonly communityId: string;
  readonly raisedByUserId: string;
  readonly unitId?: string;
  readonly location?: string;
}

/**
 * Typed client for the Phase 3 gate security-operations HTTP surface — the watchlist (Req 26.1,
 * 26.3, 26.5) and SOS alerts (Req 27.3, 27.4) the Task 17.1 gate screens use. Thin, envelope-aware
 * wrapper over {@link ApiClient}; lists are tenant-scoped server-side. Guard shifts / incidents /
 * access-integration are additional endpoints on the same backend service but are outside the
 * Task 17.1 screen scope, so they are intentionally not surfaced here yet (ponytail: build what the
 * screens need, add the rest when a screen does).
 */
export class SecurityOpsClient {
  constructor(
    private readonly api: ApiClient,
    private readonly idempotencyKey: () => string = newIdempotencyKey,
  ) {}

  // --- Watchlist (Req 26.1, 26.3, 26.5) ------------------------------------------------------

  /** Add a watchlist entry for a community (Req 26.1). */
  addWatchlistEntry(body: AddWatchlistEntryBody): Promise<WatchlistEntry> {
    return this.api.post<WatchlistEntry>('/api/v1/watchlist', {
      body,
      idempotencyKey: this.idempotencyKey(),
    });
  }

  /** Clear an active watchlist entry (Req 26.5). */
  clearWatchlistEntry(id: string): Promise<WatchlistEntry> {
    return this.api.post<WatchlistEntry>(`/api/v1/watchlist/${id}/clear`, {
      idempotencyKey: this.idempotencyKey(),
    });
  }

  listWatchlist(
    query: ListQuery = {},
    filters: WatchlistListFilters = {},
    options?: { signal?: AbortSignal },
  ): Promise<PagedData<WatchlistEntry>> {
    const qs = buildQuery({
      ...listQueryParams(query),
      status: filters.status,
      subjectType: filters.subjectType,
      severity: filters.severity,
    });
    return this.api.get<PagedData<WatchlistEntry>>(`/api/v1/watchlist${qs}`, options);
  }

  // --- SOS (Req 27.3, 27.4) ------------------------------------------------------------------

  /** Raise an SOS alert; notifies the responder audience (Req 27.3). */
  raiseSos(body: RaiseSosBody): Promise<SosAlert> {
    return this.api.post<SosAlert>('/api/v1/sos-alerts', {
      body,
      idempotencyKey: this.idempotencyKey(),
    });
  }

  /** Acknowledge an active SOS alert (Req 27.4). */
  acknowledgeSos(id: string, userId: string): Promise<SosAlert> {
    return this.api.post<SosAlert>(`/api/v1/sos-alerts/${id}/acknowledge`, {
      body: { userId },
      idempotencyKey: this.idempotencyKey(),
    });
  }

  /** Resolve an SOS alert (Req 27.4). */
  resolveSos(id: string, userId: string): Promise<SosAlert> {
    return this.api.post<SosAlert>(`/api/v1/sos-alerts/${id}/resolve`, {
      body: { userId },
      idempotencyKey: this.idempotencyKey(),
    });
  }

  listSos(
    query: ListQuery = {},
    filters: SosListFilters = {},
    options?: { signal?: AbortSignal },
  ): Promise<PagedData<SosAlert>> {
    const qs = buildQuery({
      ...listQueryParams(query),
      status: filters.status,
    });
    return this.api.get<PagedData<SosAlert>>(`/api/v1/sos-alerts${qs}`, options);
  }
}
