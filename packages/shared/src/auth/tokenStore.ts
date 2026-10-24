import type { LoginResponse } from '../models/auth';

/**
 * Pluggable secure persistence for the long-lived session/refresh token. In the apps this is
 * backed by `expo-secure-store` (Keychain on iOS, Keystore on Android). Kept as an interface so
 * the shared package has no hard dependency on a specific storage module and stays testable.
 */
export interface SecureStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Adapt `expo-secure-store` to {@link SecureStorage}. Import lazily in the app:
 *   `import * as SecureStore from 'expo-secure-store';`
 *   `new SecureTokenStore(expoSecureStorage(SecureStore))`
 * Typed structurally so the shared package needn't depend on the module's types directly.
 */
export function expoSecureStorage(secureStore: {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}): SecureStorage {
  return {
    getItem: (k) => secureStore.getItemAsync(k),
    setItem: (k, v) => secureStore.setItemAsync(k, v),
    removeItem: (k) => secureStore.deleteItemAsync(k),
  };
}

const SESSION_TOKEN_KEY = 'communityos.sessionToken';
// Persisted session so a cold start / Metro reload keeps the user signed in (no refresh endpoint
// exists yet). The access token is already short-lived and server-verified on every call; keeping
// it in the OS secure store (Keychain/Keystore) is the standard "stay signed in" approach.
const ACCESS_TOKEN_KEY = 'communityos.accessToken';
const ACCESS_EXPIRES_KEY = 'communityos.accessExpiresAtUtc';
const ROLES_KEY = 'communityos.roles';
const DISPLAY_NAME_KEY = 'communityos.displayName';

/**
 * Decode a JWT's payload and return its `sub` claim (the user id), or null if the token isn't a
 * readable JWT or carries no `sub`. Pure base64url → JSON decode, no signature verification — the
 * server is the authority on validity; we only need the id the token already carries. Any malformed
 * input fails closed to null (never throws into the UI).
 */
function readJwtSubject(token: string): string | null {
  const claims = readJwtClaims(token);
  const sub = claims?.['sub'];
  return typeof sub === 'string' && sub.length > 0 ? sub : null;
}

/** Decode a JWT payload to a claims object (no signature verification). Null on malformed input. */
function readJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  const payloadPart = parts[1];
  if (parts.length !== 3 || !payloadPart) {
    return null;
  }
  try {
    const payload = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=');
    const json = decodeBase64(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * True when the token belongs to a platform power user / super-admin (claim
 * `communityos:is_platform_super_admin === "true"`). These accounts manage the system via the web
 * admin portal, NOT the resident/guard mobile app, so the app rejects such a login.
 */
export function isPlatformSuperAdminToken(token: string): boolean {
  const claims = readJwtClaims(token);
  return claims?.['communityos:is_platform_super_admin'] === 'true';
}

/** Decode a standard base64 string to a UTF-8 string across RN/Hermes (atob) and Node (Buffer). */
function decodeBase64(b64: string): string {
  const g = globalThis as { atob?: (s: string) => string; Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } };
  if (typeof g.atob === 'function') {
    return g.atob(b64);
  }
  if (g.Buffer) {
    return g.Buffer.from(b64, 'base64').toString('utf-8');
  }
  throw new Error('No base64 decoder available.');
}

/**
 * Holds the short-lived access token in memory and the long-lived session token in secure
 * storage. Tokens are NEVER logged and never written anywhere but secure storage (security
 * first). The access token lives only in RAM so it is gone when the process dies.
 */
export class SecureTokenStore {
  private accessToken: string | null = null;
  private accessTokenExpiresAtUtc: string | null = null;
  private roles: string[] = [];
  /** The identifier (email/phone) the user signed in with — for display in the UI only. */
  private displayName: string | null = null;
  /** Listeners notified when the session is cleared (expiry/revocation/logout) so the app shell can route to login. */
  private readonly clearedListeners = new Set<() => void>();

  constructor(private readonly storage: SecureStorage) {}

  /**
   * Subscribe to "session cleared" — fired by {@link clear} when the token store is wiped (expired
   * token, server revocation, or logout). The app shell ({@link AuthProvider}) uses this to flip to
   * the unauthenticated state so a mid-session expiry routes to login instead of leaving a screen
   * showing a stale error. Returns an unsubscribe function.
   */
  onCleared(listener: () => void): () => void {
    this.clearedListeners.add(listener);
    return () => this.clearedListeners.delete(listener);
  }

  /** Remember the identifier the user signed in with (display only; never a secret). */
  setDisplayName(identifier: string | null): void {
    this.displayName = identifier && identifier.trim().length > 0 ? identifier.trim() : null;
    // Persist for restore on reload; fire-and-forget (display only, non-critical).
    if (this.displayName) {
      void this.storage.setItem(DISPLAY_NAME_KEY, this.displayName);
    } else {
      void this.storage.removeItem(DISPLAY_NAME_KEY);
    }
  }

  /** The signed-in identifier for display (email/phone), or null when logged out. */
  getDisplayName(): string | null {
    return this.displayName;
  }

  /** The current in-memory access token, or null if logged out. */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /** Roles from the last login (in memory only). */
  getRoles(): readonly string[] {
    return this.roles;
  }

  /**
   * The authenticated user's id — the access token's `sub` claim (Req 1.1). The id is already in the
   * token we hold, so we read it rather than calling a `/me` endpoint that doesn't exist. Returns
   * null when logged out or the token has no readable `sub`. The token is NOT verified here (the
   * server verifies on every call); this only decodes the public payload to read the id. The token
   * itself is never logged. ponytail: no signature check — client-side we only need the id, trust is
   * established server-side.
   */
  getUserId(): string | null {
    return this.accessToken ? readJwtSubject(this.accessToken) : null;
  }

  /** True once a login has populated the access token. */
  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  /**
   * True when the held access token's expiry is in the past (with a small skew). Used to decide
   * whether a 401 means "session truly ended" (clear + re-login) vs a transient server/network blip
   * (keep the session so the user isn't bounced to login repeatedly). Unknown expiry → not expired.
   */
  isAccessTokenExpired(skewMs = 5000): boolean {
    if (!this.accessTokenExpiresAtUtc) {
      return false;
    }
    const exp = new Date(this.accessTokenExpiresAtUtc).getTime();
    return !Number.isNaN(exp) && exp - skewMs <= Date.now();
  }

  /** The persisted session token, used to re-auth after the access token expires (401). */
  getSessionToken(): Promise<string | null> {
    return this.storage.getItem(SESSION_TOKEN_KEY);
  }

  /**
   * Persist a successful login: access token + roles in memory, session token in secure storage.
   * `sessionToken` is optional — the current backend returns a single access token; when a
   * refresh/session token is issued it is stored here for the refresh-or-logout flow.
   */
  /** The persisted refresh token (opaque, for silent re-auth), or null when none. */
  getRefreshToken(): Promise<string | null> {
    return this.storage.getItem(SESSION_TOKEN_KEY);
  }

  /** Persist a rotated refresh token (after a successful /auth/refresh). */
  async setRefreshToken(refreshToken: string): Promise<void> {
    await this.storage.setItem(SESSION_TOKEN_KEY, refreshToken);
  }

  async setFromLogin(login: LoginResponse, sessionToken?: string): Promise<void> {
    this.accessToken = login.accessToken;
    this.accessTokenExpiresAtUtc = login.expiresAtUtc;
    this.roles = [...login.roles];
    // Persist the refresh token (preferred) or an explicit session token for silent re-auth.
    const refresh = login.refreshToken ?? sessionToken;
    if (refresh) {
      await this.storage.setItem(SESSION_TOKEN_KEY, refresh);
    }
    // Persist the session so a reload/cold start restores it (see restore()).
    await this.storage.setItem(ACCESS_TOKEN_KEY, login.accessToken);
    await this.storage.setItem(ACCESS_EXPIRES_KEY, login.expiresAtUtc);
    await this.storage.setItem(ROLES_KEY, JSON.stringify(login.roles));
  }

  /**
   * Restore a persisted session into memory on app start / reload. Returns true when a non-expired
   * access token was restored (caller can go straight to the authenticated app), false otherwise.
   * A persisted-but-expired token is cleared. The token is never logged.
   */
  async restore(): Promise<boolean> {
    const token = await this.storage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      return false;
    }
    const expiresAt = await this.storage.getItem(ACCESS_EXPIRES_KEY);
    if (expiresAt) {
      const exp = new Date(expiresAt).getTime();
      if (!Number.isNaN(exp) && exp <= Date.now()) {
        // The access token expired, but the REFRESH token is still valid — drop only the stale
        // access token so a silent /auth/refresh can mint a new one (stay-logged-in). Wiping the
        // refresh token here was the bug that forced a fresh login after the access token aged out.
        await this.clearAccessTokenOnly();
        return false;
      }
    }
    this.accessToken = token;
    this.accessTokenExpiresAtUtc = expiresAt;
    const rolesJson = await this.storage.getItem(ROLES_KEY);
    this.roles = parseRoles(rolesJson);
    this.displayName = await this.storage.getItem(DISPLAY_NAME_KEY);
    return true;
  }

  /** Replace just the access token (e.g. after a refresh). */
  setAccessToken(accessToken: string, expiresAtUtc?: string): void {
    this.accessToken = accessToken;
    this.accessTokenExpiresAtUtc = expiresAtUtc ?? this.accessTokenExpiresAtUtc;
  }

  /**
   * Drop only the (stale) access token + its persisted copy, KEEPING the refresh token and
   * display name. Used when the access token has expired but the session is still re-establishable
   * via /auth/refresh — the stay-signed-in path. Does NOT notify {@link onCleared} (the session is
   * not ending, only the short-lived access token).
   */
  async clearAccessTokenOnly(): Promise<void> {
    this.accessToken = null;
    this.accessTokenExpiresAtUtc = null;
    this.roles = [];
    await this.storage.removeItem(ACCESS_TOKEN_KEY);
    await this.storage.removeItem(ACCESS_EXPIRES_KEY);
    await this.storage.removeItem(ROLES_KEY);
  }

  /** Wipe everything — in-memory access token/roles and the persisted session token. */
  async clear(): Promise<void> {
    const wasAuthenticated = this.accessToken !== null;
    this.accessToken = null;
    this.accessTokenExpiresAtUtc = null;
    this.roles = [];
    this.displayName = null;
    await this.storage.removeItem(SESSION_TOKEN_KEY);
    await this.storage.removeItem(ACCESS_TOKEN_KEY);
    await this.storage.removeItem(ACCESS_EXPIRES_KEY);
    await this.storage.removeItem(ROLES_KEY);
    await this.storage.removeItem(DISPLAY_NAME_KEY);
    // Notify the shell only when we actually transitioned from signed-in → signed-out, so it can
    // route to login (fail-safe: a listener error must not break the clear).
    if (wasAuthenticated) {
      for (const listener of this.clearedListeners) {
        try { listener(); } catch { /* ignore listener errors */ }
      }
    }
  }
}

/** Parse the persisted roles JSON into a string[]; any malformed value → empty (fail safe). */
function parseRoles(json: string | null): string[] {
  if (!json) {
    return [];
  }
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === 'string') : [];
  } catch {
    return [];
  }
}
