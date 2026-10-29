/**
 * Shared list-query shape for the paginated/filter/sort/search list endpoints (Req 9.3). The
 * backend reads `search`, `sort`, `page`, `pageSize` plus a handful of per-resource filter query
 * params (e.g. `verificationStatus`, `unitStatus`, `communityType`). The resource clients translate
 * a {@link ListQuery} into that query string; screens never hand-build URLs.
 */
export interface ListQuery {
  /** Free-text search term (matched server-side across the resource's searchable fields). */
  readonly search?: string;
  /** Sort expression, e.g. `name` or `-createdAt` (leading `-` = descending), server-defined. */
  readonly sort?: string;
  /** 1-based page number. Defaults server-side when omitted. */
  readonly page?: number;
  /** Page size. Defaults/caps server-side when omitted. */
  readonly pageSize?: number;
}

/** Default page size the mobile lists request — small enough to render fast, large enough to be useful. */
export const DEFAULT_PAGE_SIZE = 20;
