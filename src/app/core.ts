import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { OneSignal } from 'react-native-onesignal';
import {
  ApiClient,
  AuthService,
  SecureTokenStore,
  createResourceClients,
  expoSecureStorage,
  isRefreshTokenDead,
  registerDevice,
  resolveConfigFromEnv,
  type AppConfig,
  type LoginResponse,
  type ResourceClients,
} from '@';

/**
 * Resident/Owner app composition root: resolve config from env, build the secure token store on
 * top of expo-secure-store (Keychain/Keystore), and wire the envelope-aware API client + auth
 * service + the Phase 2 resource clients. This is the single place the app assembles the shared
 * core; screens consume `core`.
 *
 * Push-notification device registration (OneSignal) runs post-login via `onAuthenticated`, mirroring
 * the guard app: it inits OneSignal with EXPO_PUBLIC_ONESIGNAL_APP_ID and posts the device's
 * subscription id to the backend so notifications can target this user. Failure-tolerant.
 */
export interface AppCore {
  readonly config: AppConfig;
  readonly tokenStore: SecureTokenStore;
  readonly api: ApiClient;
  readonly auth: AuthService;
  readonly resources: ResourceClients;
  readonly onAuthenticated: (login: LoginResponse) => Promise<void>;
}

export function createAppCore(): AppCore {
  const config = resolveConfigFromEnv();
  const tokenStore = new SecureTokenStore(expoSecureStorage(SecureStore));
  // Build the auth service first so the API client's 401 recovery can call it to silently refresh.
  // `auth` is assigned just below; the refresher reads it lazily (by the time a 401 fires, it's set).
  let auth: AuthService;
  const api = new ApiClient({
    config,
    tokenStore,
    // On a 401 the client calls this once (single-flight): swap the refresh token for a fresh access
    // token. Returning the new token → the original request is retried transparently (no re-login).
    // Returning null → the client just rethrows the 401 (it does NOT clear on its own now).
    //
    // Session-end policy lives here, where we can see WHY the refresh failed: only when the refresh
    // token is genuinely dead (server rejected it) do we clear the store — that fires onCleared and
    // routes to login. A transient failure (offline / timeout / 5xx) keeps the session so the user
    // is never bounced to login over a network blip (Instagram/WhatsApp behaviour).
    refreshToken: async () => {
      try {
        return await auth.refresh();
      } catch (err) {
        if (isRefreshTokenDead(err)) {
          await tokenStore.clear();
        }
        return null;
      }
    },
  });
  auth = new AuthService(api, tokenStore);
  const resources = createResourceClients(api);

  const onAuthenticated = async (): Promise<void> => {
    // Associate this device with the signed-in user so the backend can target push. Errors are
    // swallowed by the caller (AuthProvider) so a push failure never blocks entry.
    await registerDevice({
      oneSignal: OneSignal,
      config,
      api,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      appKind: 'resident',
    });
  };

  return { config, tokenStore, api, auth, resources, onAuthenticated };
}
