import type { ApiClient } from '@/services/api/client';
import type { PagedData } from '@/types/envelope';
import type { MasterDataEntry, MasterDataKey } from '@/types/masterData';
import { buildQuery } from './query';

/**
 * Typed client for `GET /api/v1/master-data/{listKey}` (Req 8.4). Dropdowns resolve their options
 * from here — the configurable, per-community reference lists — instead of hardcoding option arrays
 * in the app (steering: no hardcoding). Returns active entries by default (the choices offered for a
 * new selection); pass `includeInactive` to also surface retired codes already stored on a record.
 *
 * <p>The backend pages this small in-memory list; we request a generous page so a dropdown gets the
 * whole list in one call (these reference lists are intentionally bounded).</p>
 */
export class MasterDataClient {
  constructor(private readonly api: ApiClient) {}

  async list(
    listKey: MasterDataKey | string,
    options: {
      communityId?: string;
      includeInactive?: boolean;
      pageSize?: number;
      signal?: AbortSignal;
    } = {},
  ): Promise<MasterDataEntry[]> {
    const qs = buildQuery({
      communityId: options.communityId,
      includeInactive: options.includeInactive,
      page: 1,
      pageSize: options.pageSize ?? 200,
    });
    const data = await this.api.get<PagedData<MasterDataEntry>>(
      `/api/v1/master-data/${encodeURIComponent(listKey)}${qs}`,
      { signal: options.signal },
    );
    return [...data.items].sort((a, b) => a.sortOrder - b.sortOrder);
  }
}
