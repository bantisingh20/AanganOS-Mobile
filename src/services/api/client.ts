import type { AppConfig } from '@/constants';
import type { ApiResult, ErrorCode } from '@/types/envelope';
import type { SecureTokenStore } from '@/services/storage/tokenStore';
import { ApiRequestError } from './errors';

const CORRELATION_ID_HEADER = 'X-Correlation-Id';
const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/** HTTP methods the client supports. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  /** Parsed JSON body for write methods. */
  body?: unknown;
  /**
   * Idempotency key for an at-most-once write (payments/handover etc.). When set, sent as the
   * `Idempotency-Key` header so a retry replays the original result instead of re-executing.
   */
  idempotencyKey?: string;
  /** Caller-supplied correlation id; one is generated when omitted and always propagated. */
  correlationId?: string;
  /** Skip bearer injection (login/forgot/reset are pre-auth). Defaults to false. */
  anonymous?: boolean;
  /** Extra headers (never used for auth — the client owns Authorization). */
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * How the client re-authenticates on a 401. An app supplies a refresher that uses the persisted
 * session token to obtain a fresh access token; returning `null` means "cannot refresh → log out".
 */
export type TokenRefresher = (store: SecureTokenStore) => Promise<string | null>;

export interface ApiClientOptions {
  config: AppConfig;
  tokenStore: SecureTokenStore;
  /** Optional 401 recovery. Without it, a 401 clears the session and rethrows UNAUTHENTICATED. */
  refreshToken?: TokenRefresher;
  /** Injectable fetch for testability; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable correlation-id generator; defaults to a UUID-ish string. */
  generateCorrelationId?: () => string;
}

/**
 * Envelope-aware HTTP client (Req 9.1, 9.2, 10.1, 63.3). Every call:
 *  - prefixes {@link AppConfig.apiBaseUrl} (no hardcoded URL),
 *  - injects `Authorization: Bearer <accessToken>` from the token store (unless `anonymous`),
 *  - injects `Idempotency-Key` for idempotent writes,
 *  - sends and reads back `X-Correlation-Id`, propagating it onto any thrown error,
 *  - unwraps `{ success, data, error, correlationId }`: returns `data` on success, throws
 *    {@link ApiRequestError} (with `fieldErrors` mapped and the error `code` surfaced) otherwise,
 *  - on a 401, runs the single-flight refresh-or-logout flow once, then retries.
 *
 * Tokens are never logged.
 */
export class ApiClient {
  private readonly config: AppConfig;
  private readonly tokenStore: SecureTokenStore;
  private readonly refreshToken?: TokenRefresher;
  private readonly fetchImpl: typeof fetch;
  private readonly newCorrelationId: () => string;
  /** Single-flight refresh: concurrent 401s share one refresh attempt. */
  private inFlightRefresh: Promise<string | null> | null = null;

  constructor(options: ApiClientOptions) {
    this.config = options.config;
    this.tokenStore = options.tokenStore;
    this.refreshToken = options.refreshToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.newCorrelationId = options.generateCorrelationId ?? defaultCorrelationId;
  }

  get<T>(path: string, options?: Omit<RequestOptions, 'body'>): Promise<T> {
    return this.request<T>('GET', path, options);
  }

  post<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, options);
  }

  put<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, options);
  }

  patch<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, options);
  }

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, options);
  }

  /**
   * Core request. Returns the unwrapped `data`. Throws {@link ApiRequestError} on any failure
   * envelope or transport/parse error. Retries once after a successful token refresh on 401.
   */
  async request<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
    const correlationId = options.correlationId ?? this.newCorrelationId();
    try {
      return await this.send<T>(method, path, options, correlationId);
    } catch (err) {
      if (err instanceof ApiRequestError && err.isUnauthenticated && !options.anonymous) {
        const refreshed = await this.tryRefresh();
        if (refreshed) {
          // Retry once with the new access token.
          return await this.send<T>(method, path, options, correlationId);
        }
        // Refresh didn't produce a token. When a refresher is configured it OWNS the session-end
        // decision (it clears only on a genuinely dead token, never on a transient failure), so we
        // do nothing here and just rethrow — a network blip must not bounce the user to login. Only
        // when NO refresher exists do we fall back to clearing an expired token so the app can route
        // to login once.
        if (!this.refreshToken && this.tokenStore.isAccessTokenExpired()) {
          await this.tokenStore.clear();
        }
      }
      throw err;
    }
  }

  private async send<T>(
    method: HttpMethod,
    path: string,
    options: RequestOptions,
    correlationId: string,
  ): Promise<T> {
    const url = this.buildUrl(path);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      [CORRELATION_ID_HEADER]: correlationId,
      ...options.headers,
    };

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (options.idempotencyKey) {
      headers[IDEMPOTENCY_KEY_HEADER] = options.idempotencyKey;
    }
    if (!options.anonymous) {
      const token = this.tokenStore.getAccessToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    // Fail fast when the server is unreachable/slow so the UI never hangs on a black/stuck screen.
    // We combine the caller's signal (if any) with an internal timeout via AbortController.
    const timeoutMs = 15000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const onCallerAbort = () => controller.abort();
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener('abort', onCallerAbort, { once: true });
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (cause) {
      // Network/transport failure or timeout — surface as an integration failure (server
      // unreachable), keep the correlation id. If the CALLER aborted (e.g. screen unmounted), rethrow
      // the abort so it isn't shown as an error. The underlying cause is logged for logcat diagnosis;
      // the user sees the friendly "can't reach server" message.
      if (options.signal?.aborted) {
        throw cause;
      }
      const timedOut = controller.signal.aborted;
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn(
          `[API-NET] ${method} ${url} ${timedOut ? 'timed out' : 'failed'} corr=${correlationId}: ${String((cause as Error)?.message ?? cause)}`,
        );
      }
      throw new ApiRequestError({
        code: 'INTEGRATION_FAILURE',
        message: timedOut ? 'The server took too long to respond.' : 'Network request failed.',
        correlationId,
        httpStatus: 0,
      });
    } finally {
      clearTimeout(timeout);
      if (options.signal) options.signal.removeEventListener('abort', onCallerAbort);
    }

    return this.parseEnvelope<T>(response, correlationId);
  }

  private async parseEnvelope<T>(response: Response, fallbackCorrelationId: string): Promise<T> {
    const headerCorrelationId = response.headers.get(CORRELATION_ID_HEADER) ?? undefined;

    let envelope: ApiResult<T> | null = null;
    try {
      envelope = (await response.json()) as ApiResult<T>;
    } catch {
      envelope = null;
    }

    const correlationId = envelope?.correlationId || headerCorrelationId || fallbackCorrelationId;

    if (!envelope) {
      if (response.ok) {
        return null as T;
      }
      throw new ApiRequestError({
        code: httpStatusToCode(response.status),
        message: `Unexpected non-JSON response (HTTP ${response.status}).`,
        correlationId,
        httpStatus: response.status,
      });
    }

    if (envelope.success && response.ok) {
      // `data` is nullable in the envelope; callers of void endpoints type T as the response shape.
      return envelope.data as T;
    }

    if (envelope.error) {
      throw ApiRequestError.fromApiError(envelope.error, correlationId, response.status);
    }

    throw new ApiRequestError({
      code: httpStatusToCode(response.status),
      message: `Request failed (HTTP ${response.status}).`,
      correlationId,
      httpStatus: response.status,
    });
  }

  /** Single-flight token refresh so N concurrent 401s cause exactly one refresh attempt. */
  private tryRefresh(): Promise<string | null> {
    if (!this.refreshToken) {
      return Promise.resolve(null);
    }
    if (!this.inFlightRefresh) {
      this.inFlightRefresh = this.refreshToken(this.tokenStore).finally(() => {
        this.inFlightRefresh = null;
      });
    }
    return this.inFlightRefresh;
  }

  private buildUrl(path: string): string {
    const base = this.config.apiBaseUrl.replace(/\/+$/, '');
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return `${base}${suffix}`;
  }

  /**
   * Absolute URL for a path — exposed so the multipart {@link FileClient} (which must build its own
   * `FormData` request, not a JSON body this client always stringifies) can reuse the single base-url
   * source instead of hardcoding it.
   */
  resolveUrl(path: string): string {
    return this.buildUrl(path);
  }

  /** The current bearer access token (or null) — for the multipart {@link FileClient} to authorize. */
  currentAccessToken(): string | null {
    return this.tokenStore.getAccessToken();
  }
}

function httpStatusToCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 415:
      return 'UNSUPPORTED_MEDIA_TYPE';
    case 429:
      return 'RATE_LIMITED';
    case 502:
      return 'INTEGRATION_FAILURE';
    default:
      return 'INTERNAL_ERROR';
  }
}

/**
 * Correlation id generator. Uses `crypto.randomUUID` when available (RN/Hermes expose it via the
 * runtime polyfill), falling back to a timestamp+random string. ponytail: non-cryptographic
 * fallback id — fine for request tracing, not for anything security-bearing.
 */
function defaultCorrelationId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) {
    return c.randomUUID();
  }
  return `cid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
