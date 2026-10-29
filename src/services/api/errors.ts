import type { ApiError, ErrorCode, FieldError } from '@/types/envelope';

/**
 * Thrown by {@link ApiClient} for any non-success envelope (or a transport/parse failure). Carries
 * the stable {@link ErrorCode}, the safe message, a `{field: reason}` map built from the envelope's
 * `fieldErrors`, and the `correlationId` so a caller can show it / log it for support.
 */
export class ApiRequestError extends Error {
  readonly code: ErrorCode;
  readonly correlationId: string;
  readonly httpStatus: number;
  readonly fieldErrors: FieldError[];
  /** `fieldErrors` folded into a lookup for form binding: `{ identifier: 'is required' }`. */
  readonly fieldErrorMap: Readonly<Record<string, string>>;

  constructor(args: {
    code: ErrorCode;
    message: string;
    correlationId: string;
    httpStatus: number;
    fieldErrors?: FieldError[];
  }) {
    super(args.message);
    this.name = 'ApiRequestError';
    this.code = args.code;
    this.correlationId = args.correlationId;
    this.httpStatus = args.httpStatus;
    this.fieldErrors = args.fieldErrors ?? [];
    this.fieldErrorMap = Object.freeze(
      this.fieldErrors.reduce<Record<string, string>>((acc, fe) => {
        acc[fe.field] = fe.reason;
        return acc;
      }, {}),
    );
  }

  /** Build from a parsed {@link ApiError}. */
  static fromApiError(error: ApiError, correlationId: string, httpStatus: number): ApiRequestError {
    return new ApiRequestError({
      code: error.code,
      message: error.message,
      correlationId,
      httpStatus,
      fieldErrors: error.fieldErrors,
    });
  }

  /** True when the server rejected authentication (drives the refresh-or-logout flow). */
  get isUnauthenticated(): boolean {
    return this.code === 'UNAUTHENTICATED';
  }
}
