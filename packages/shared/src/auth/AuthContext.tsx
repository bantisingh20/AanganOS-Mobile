import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { AuthService } from './authService';
import { isPlatformSuperAdminToken, type SecureTokenStore } from './tokenStore';
import { PermissionAction, hasPermissionIn } from './permissions';
import type { LoginRequest, LoginResponse } from '../models/auth';
import { isRefreshTokenDead } from './refreshFailure';
import { ApiRequestError } from '../api/errors';

/**
 * Session lifecycle for the app shell (Req 1.1, 1.3). `restoring` is the launch state while we
 * decide whether a persisted session can be re-established; after that the app is either
 * `authenticated` (show the app) or `unauthenticated` (show the auth flow).
 */
export type AuthStatus = 'restoring' | 'authenticated' | 'unauthenticated';

/** What `useAuth()` exposes to screens. */
export interface AuthContextValue {
  status: AuthStatus;
  /** Roles from the active session (empty when unauthenticated). */
  roles: readonly string[];
  /** Granted permissions ("ResourceType:actionInt") from the active session. */
  permissions: readonly string[];
  /** True when the signed-in user holds a given (action, resource) grant. */
  hasPermission(action: PermissionAction, resource: string): boolean;
  /** The signed-in user's id (access-token `sub`), or null when unauthenticated. */
  userId: string | null;
  /** The signed-in identifier (email/phone) for display, or null when unauthenticated. */
  displayName: string | null;
  /** Log in, persist the session, run the post-login side effect (e.g. device registration). */
  login(request: LoginRequest): Promise<LoginResponse>;
  /** Adopt a session returned by another flow (e.g. self-register) without a password round-trip. */
  adoptSession(result: LoginResponse, displayName?: string): Promise<void>;
  /** Log out: revoke server-side (best effort), clear local tokens, return to the auth flow. */
  logout(): Promise<void>;
}

/**
 * Side effect to run once right after a successful login — used by each app to register the device
 * with OneSignal (Req 11.1). Kept optional and failure-tolerant so a push-registration hiccup can
 * never block the user from entering the app.
 */
export type OnAuthenticated = (login: LoginResponse) => void | Promise<void>;

export interface AuthProviderProps {
  auth: AuthService;
  tokenStore: SecureTokenStore;
  /** Runs after a successful login (device registration etc.). Errors are swallowed + ignored. */
  onAuthenticated?: OnAuthenticated;
  children: React.ReactNode;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Holds the single source of truth for "am I signed in?" and drives the authenticated vs
 * unauthenticated switch. On mount it checks the secure store for a session token: with no token
 * (or no way to re-establish a session yet) it routes to login. The in-memory access token does
 * not survive a cold start, so today a cold launch always lands on login unless a session token
 * exists — which is the safe default (security first).
 */
export function AuthProvider({
  auth,
  tokenStore,
  onAuthenticated,
  children,
}: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [roles, setRoles] = useState<readonly string[]>(tokenStore.getRoles());
  const [permissions, setPermissions] = useState<readonly string[]>(tokenStore.getPermissions());
  const [userId, setUserId] = useState<string | null>(tokenStore.getUserId());
  const [displayName, setDisplayName] = useState<string | null>(tokenStore.getDisplayName());
  // Keep the latest side effect without making it a dependency of the restore effect.
  const onAuthenticatedRef = useRef<OnAuthenticated | undefined>(onAuthenticated);
  onAuthenticatedRef.current = onAuthenticated;

  useEffect(() => {
    let active = true;
    (async () => {
      // If the access token is already in memory (hot reload / fast refresh), stay signed in.
      if (tokenStore.isAuthenticated()) {
        if (active) {
          setRoles(tokenStore.getRoles());
          setPermissions(tokenStore.getPermissions());
          setUserId(tokenStore.getUserId());
          setDisplayName(tokenStore.getDisplayName());
          setStatus('authenticated');
        }
        return;
      }
      // Otherwise try to restore a persisted session from secure storage (survives a cold start or
      // a Metro reload). restore() loads a non-expired access token + roles + display name into
      // memory; an expired/absent one returns false.
      const restored = await tokenStore.restore();
      if (!active) {
        return;
      }
      if (restored) {
        // A persisted platform-admin session must not sign into the mobile app — wipe it + login.
        const tok = tokenStore.getAccessToken();
        if (tok && isPlatformSuperAdminToken(tok)) {
          await tokenStore.clear();
          if (!active) return;
          setStatus('unauthenticated');
          return;
        }
        setRoles(tokenStore.getRoles());
        setPermissions(tokenStore.getPermissions());
        setUserId(tokenStore.getUserId());
        setDisplayName(tokenStore.getDisplayName());
        setStatus('authenticated');
        return;
      }
      // No usable access token, but if a refresh token is persisted, silently re-auth (mobile: don't
      // prompt login until the refresh token itself is gone/expired or the user logs out).
      const refreshToken = await tokenStore.getRefreshToken();
      if (refreshToken) {
        // Retry a few times with backoff: a cold start right after the device wakes often races the
        // network coming up. We only give up (show login) when the token is genuinely rejected, or
        // after the retries are exhausted — and even then we KEEP the refresh token so the very next
        // launch (once online) silently signs back in. This is the Instagram/WhatsApp behaviour.
        const delaysMs = [0, 600, 1500];
        for (let attempt = 0; attempt < delaysMs.length; attempt++) {
          if (!active) return;
          if (delaysMs[attempt]! > 0) {
            await new Promise((r) => setTimeout(r, delaysMs[attempt]!));
            if (!active) return;
          }
          try {
            await auth.refresh();
            if (!active) return;
            // Reject a refreshed platform-admin session on the mobile app (wipe + login).
            const tok = tokenStore.getAccessToken();
            if (tok && isPlatformSuperAdminToken(tok)) {
              await tokenStore.clear();
              if (!active) return;
              break;
            }
            setRoles(tokenStore.getRoles());
            setUserId(tokenStore.getUserId());
            setDisplayName(tokenStore.getDisplayName());
            setStatus('authenticated');
            return;
          } catch (err) {
            if (isRefreshTokenDead(err)) {
              // The server actively rejected the token (invalid/expired/revoked). Only now do we
              // wipe it and send the user to login — a real re-auth is genuinely required.
              await tokenStore.clear();
              if (!active) return;
              break;
            }
            // Transient (offline / timeout / 5xx): keep the refresh token and retry. If this was the
            // last attempt we fall through to the login screen for now, but the token stays stored so
            // the next online launch restores silently — the user is NOT permanently logged out.
          }
        }
      }
      if (!active) return;
      setStatus('unauthenticated');
    })();
    return () => {
      active = false;
    };
  }, [tokenStore, auth]);

  // When the session is cleared mid-use (token expired, or the server revoked it — e.g. signed in
  // on another device), the API client wipes the token store. Subscribe so the shell flips to the
  // auth flow (login screen) instead of leaving the current screen showing a stale 401 toast.
  useEffect(() => {
    const unsubscribe = tokenStore.onCleared(() => {
      setRoles([]);
      setPermissions([]);
      setUserId(null);
      setDisplayName(null);
      setStatus('unauthenticated');
    });
    return unsubscribe;
  }, [tokenStore]);

  const applySession = useCallback(
    async (result: LoginResponse, displayNameToStore?: string): Promise<void> => {
      if (isPlatformSuperAdminToken(result.accessToken)) {
        await auth.logout().catch(() => undefined);
        throw new ApiRequestError({
          code: 'FORBIDDEN',
          message:
            'This account is a platform administrator. Please use the web admin portal to sign in.',
          correlationId: '',
          httpStatus: 403,
        });
      }
      if (displayNameToStore) {
        tokenStore.setDisplayName(displayNameToStore);
      }
      setRoles(tokenStore.getRoles());
      setPermissions(tokenStore.getPermissions());
      setUserId(tokenStore.getUserId());
      setDisplayName(tokenStore.getDisplayName());
      setStatus('authenticated');
      void Promise.resolve()
        .then(() => onAuthenticatedRef.current?.(result))
        .catch(() => undefined);
    },
    [auth, tokenStore],
  );

  const login = useCallback(
    async (request: LoginRequest): Promise<LoginResponse> => {
      const result = await auth.login(request);
      await applySession(result, result.user?.name ?? request.identifier);
      return result;
    },
    [auth, applySession],
  );

  const adoptSession = useCallback(
    async (result: LoginResponse, name?: string): Promise<void> => {
      await tokenStore.setFromLogin(result);
      await applySession(result, name);
    },
    [tokenStore, applySession],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await auth.logout();
    } finally {
      // AuthService.logout already clears the store even if the network call fails.
      setRoles([]);
      setPermissions([]);
      setUserId(null);
      setDisplayName(null);
      setStatus('unauthenticated');
    }
  }, [auth]);

  const hasPermission = useCallback(
    (action: PermissionAction, resource: string) => hasPermissionIn(permissions, action, resource),
    [permissions],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ status, roles, permissions, hasPermission, userId, displayName, login, adoptSession, logout }),
    [status, roles, permissions, hasPermission, userId, displayName, login, adoptSession, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access the auth context. Throws if used outside an {@link AuthProvider}. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>.');
  }
  return ctx;
}
