import type { ApiClient } from '@/services/api/client';
import type { PagedData } from '@/types/envelope';
import type { ListQuery } from '@/types/query';
import type { Community } from '@/types/community';
import { buildQuery, listQueryParams } from './query';

/** Extra server-side filters for the community list (Req 12.4), on top of the shared {@link ListQuery}. */
export interface CommunityListFilters {
  readonly communityType?: string;
  readonly organizationId?: string;
}

/** Body to create a community (society) under an organization (Req 12.1). */
export interface CreateCommunityBody {
  readonly organizationId: string;
  readonly name: string;
  /** Configurable community-type code (`Community_Type` list). */
  readonly communityType: string;
}

/** Body to edit a community's name and/or type (Req 12.2). Null fields are left unchanged. */
export interface UpdateCommunityBody {
  readonly name?: string;
  readonly communityType?: string;
}

/**
 * Typed client for `/api/v1/communities` (Req 12.1, 12.4). A thin, envelope-aware layer over
 * {@link ApiClient} so screens call `communities.list(...)` / `communities.get(id)` instead of
 * hand-rolling fetch + query strings per screen. The list is tenant-scoped server-side (a community
 * admin sees only their own community, a super-admin sees across).
 */
export class CommunitiesClient {
  constructor(private readonly api: ApiClient) {}

  list(
    query: ListQuery = {},
    filters: CommunityListFilters = {},
    options?: { signal?: AbortSignal },
  ): Promise<PagedData<Community>> {
    const qs = buildQuery({
      ...listQueryParams(query),
      communityType: filters.communityType,
      organizationId: filters.organizationId,
    });
    return this.api.get<PagedData<Community>>(`/api/v1/communities${qs}`, options);
  }

  get(id: string, options?: { signal?: AbortSignal }): Promise<Community> {
    return this.api.get<Community>(`/api/v1/communities/${id}`, options);
  }

  /** Create a community (society). Requires Create on Community (super-admin / org admin, Req 12.1). */
  create(body: CreateCommunityBody): Promise<Community> {
    return this.api.post<Community>('/api/v1/communities', { body });
  }

  /** Edit a community's name/type. Requires Edit on Community (Req 12.2). */
  update(id: string, body: UpdateCommunityBody): Promise<Community> {
    return this.api.put<Community>(`/api/v1/communities/${id}`, { body });
  }
}
