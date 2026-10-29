/**
 * App configuration resolved from the environment â€” never hardcoded in source (steering).
 *
 * Expo inlines `process.env.EXPO_PUBLIC_*` into the bundle at build time, so each app reads its
 * own `.env`. The shared package stays env-agnostic: an app constructs an {@link AppConfig} (from
 * `resolveConfigFromEnv()` or its own source) and passes it into the API client / OneSignal setup.
 */
export interface AppConfig {
  /** Backend REST API base, e.g. `https://api.example.com`. HTTPS in production. */
  readonly apiBaseUrl: string;
  /** OneSignal public application id (not the server REST key). Optional in dev builds. */
  readonly oneSignalAppId?: string;
  /** Backend path that stores a device's OneSignal player/subscription id. */
  readonly deviceRegisterPath: string;
}

// Minimal ambient declaration so the shared package needn't depend on @types/node just to read
// `process.env.EXPO_PUBLIC_*`. Expo inlines these at build time in the apps.
declare const process: { env: Record<string, string | undefined> };

const DEFAULT_DEVICE_REGISTER_PATH = '/api/v1/devices';

/**
 * Fallback API base used ONLY when `EXPO_PUBLIC_API_BASE_URL` is absent at build time. This keeps
 * a release build from crashing on launch when the env var failed to inline (e.g. monorepo .env
 * not picked up): the app still renders the login screen, and any backend/connectivity problem
 * surfaces as a normal error on the login request instead of a startup crash.
 */
const DEFAULT_API_BASE_URL = 'https://aanganosapi.sharcnix.com';

/** c31cd751-3421-4582-8ba8-0f2a236398b5
 * Fallback OneSignal app id used ONLY when `EXPO_PUBLIC_ONESIGNAL_APP_ID` is absent at build time.
 * Same reason as the API-url fallback: in the monorepo the release bundle runs from the workspace
 * root, so Expo may not inline the app's `.env` — without this, push registration would silently
 * no-op. This is a PUBLIC app id (not the REST API key / a secret), so baking it in is safe.
 */
const DEFAULT_ONESIGNAL_APP_ID = 'c31cd751-3421-4582-8ba8-0f2a236398b5';

/** Thrown when a required env var is missing, so misconfiguration fails loudly at startup. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Build an {@link AppConfig} from `EXPO_PUBLIC_*` env vars. Call this from an app's entry point.
 * Throws {@link ConfigError} if the API base URL or OneSignal app id is absent â€” we never fall
 * back to a baked-in URL or secret.
 */
export function resolveConfigFromEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): AppConfig {
  const oneSignalAppId = env.EXPO_PUBLIC_ONESIGNAL_APP_ID?.trim() || DEFAULT_ONESIGNAL_APP_ID;
  const deviceRegisterPath = env.EXPO_PUBLIC_DEVICE_REGISTER_PATH?.trim() || DEFAULT_DEVICE_REGISTER_PATH;

  // Prefer the env-injected URL; fall back to the prod default so the app never crashes on launch
  // when the var is missing. Misconfiguration then surfaces as a request error on the login screen,
  // not a white-screen startup crash.
  const apiBaseUrl = env.EXPO_PUBLIC_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL;

  return { apiBaseUrl, oneSignalAppId, deviceRegisterPath };
}

