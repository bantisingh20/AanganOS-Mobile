/**
 * Typed mirror of the backend response envelope (Req 9.1, 9.2, 10.1). Every API response is an
 * {@link ApiResult}: success carries `data`, failure carries `error`, and both always carry a
 * `correlationId`. These names/shapes match `CommunityOS.Contracts` exactly.
 */

/** Stable machine error codes — mirrors the backend `ErrorCodes.ToWire` set 1:1. */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'IDEMPOTENT_REPLAY'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'INTEGRATION_FAILURE'
  | 'INTERNAL_ERROR';

/** Per-field validation reason (camelCase field name, matching the request DTO). */
export interface FieldError {
  readonly field: string;
  readonly reason: string;
}

/** The `error` payload of a failed envelope. */
export interface ApiError {
  readonly code: ErrorCode;
  readonly message: string;
  /** Present only for VALIDATION_ERROR. */
  readonly fieldErrors?: FieldError[];
}

/** The full envelope. `data` is set on success, `error` on failure; `correlationId` always. */
export interface ApiResult<T> {
  readonly success: boolean;
  readonly data?: T | null;
  readonly error?: ApiError | null;
  readonly correlationId: string;
}

/**
 * A paginated list payload, matching the backend `PagedData<T>` 1:1: the page of `items` plus the
 * `page`/`pageSize` echoed back and the `totalCount` across all pages (Req 9.3). `page` is 1-based.
 */
export interface PagedData<T> {
  readonly items: T[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
}
