import type { ListQuery } from '@/types/query';

/**
 * Build a URL query string from a flat record, skipping null/undefined/empty values and encoding
 * each key+value. Returns `''` when nothing to append, or `?a=1&b=2` otherwise — so a caller can do
 * `` `/api/v1/units${buildQuery({ ... })}` ``. Keeps every resource client from hand-rolling (and
 * mis-encoding) its own query assembly.
 */
export function buildQuery(
  params: Readonly<Record<string, string | number | boolean | null | undefined>>,
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      continue;
    }
    const str = String(value);
    if (str.length === 0) {
      continue;
    }
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(str)}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * The shared list params ({@link ListQuery}) folded into the query record every list endpoint reads.
 * The sort value is normalized to the backend's `field:desc` / `field:asc` convention so callers can
 * use the common `-field` (descending) / `field` (ascending) idiom. The backend's `EndpointSort`
 * parser splits on `:` and only understands `desc`, so a raw `-field` would be rejected as "not
 * sortable" — this translation keeps every list screen working with one rule, not per call site.
 */
export function listQueryParams(query: ListQuery = {}): Record<string, string | number | undefined> {
  return {
    search: query.search,
    sort: normalizeSort(query.sort),
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** Translate `-field` → `field:desc` and bare `field` → `field:asc`; pass through an explicit `field:dir`. */
function normalizeSort(sort: string | undefined): string | undefined {
  if (!sort) {
    return undefined;
  }
  const trimmed = sort.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.includes(':')) {
    return trimmed; // already in `field:dir` form
  }
  if (trimmed.startsWith('-')) {
    return `${trimmed.slice(1)}:desc`;
  }
  return `${trimmed}:asc`;
}
