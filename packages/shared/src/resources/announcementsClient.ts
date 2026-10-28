import type { ApiClient } from '../api/client';
import type { PagedData } from '../models/envelope';
import type { ListQuery } from '../models/query';
import type { Announcement } from '../models/announcement';
import { buildQuery, listQueryParams } from './query';

/** Extra server-side filter for the announcement list. */
export interface AnnouncementListFilters {
  readonly category?: string;
  /** Only notices published on/after this ISO date-time (server-side `publishedAtUtc >=`). */
  readonly fromDate?: string;
  /** Admin management view: also return deactivated notices (residents see active-only). */
  readonly includeInactive?: boolean;
}

/** Publish a new announcement (admin). Category from the configurable `Announcement_Category` list. */
export interface CreateAnnouncementBody {
  readonly communityId: string;
  readonly title: string;
  readonly body: string;
  readonly category: string;
}

/** Edit an announcement (admin). Only send the fields that change. */
export interface UpdateAnnouncementBody {
  readonly title?: string;
  readonly body?: string;
  readonly category?: string;
}

/**
 * Typed client for the MVP notices-slice HTTP surface — the community notice board. Thin,
 * envelope-aware wrapper over {@link ApiClient}: screens call `announcements.list(...)` instead of
 * hand-rolling fetch + query strings (steering: reuse the shared client). The list is tenant-scoped
 * server-side by the EF global query filter, so a resident only ever sees their own community's
 * board without asking for a scope. Read-only in the MVP (no publish method). Mirrors
 * {@link HelpdeskClient}.
 */
export class AnnouncementsClient {
  constructor(private readonly api: ApiClient) {}

  list(
    query: ListQuery = {},
    filters: AnnouncementListFilters = {},
    options?: { signal?: AbortSignal },
  ): Promise<PagedData<Announcement>> {
    const qs = buildQuery({
      ...listQueryParams(query),
      category: filters.category,
      fromDate: filters.fromDate,
      ...(filters.includeInactive ? { includeInactive: true } : {}),
    });
    return this.api.get<PagedData<Announcement>>(`/api/v1/announcements${qs}`, options);
  }

  get(id: string, options?: { signal?: AbortSignal }): Promise<Announcement> {
    return this.api.get<Announcement>(`/api/v1/announcements/${id}`, options);
  }

  /** Publish a new announcement (admin). Requires Create on Announcement. */
  create(body: CreateAnnouncementBody): Promise<Announcement> {
    return this.api.post<Announcement>('/api/v1/announcements', { body });
  }

  /** Edit an announcement's title/body/category (admin). Requires Edit on Announcement. */
  update(id: string, body: UpdateAnnouncementBody): Promise<Announcement> {
    return this.api.put<Announcement>(`/api/v1/announcements/${id}`, { body });
  }

  /** Show the notice on the board again (admin). */
  activate(id: string): Promise<Announcement> {
    return this.api.post<Announcement>(`/api/v1/announcements/${id}/activate`, {});
  }

  /** Hide the notice from the board (admin), reversibly. */
  deactivate(id: string): Promise<Announcement> {
    return this.api.post<Announcement>(`/api/v1/announcements/${id}/deactivate`, {});
  }

  /** Soft-delete an announcement (admin). Requires Delete on Announcement. */
  delete(id: string): Promise<unknown> {
    return this.api.delete<unknown>(`/api/v1/announcements/${id}`);
  }
}
