/**
 * `@communityos/shared` — the shared core both mobile apps import.
 *
 * - config: env-driven {@link AppConfig} (no hardcoded URL/secret)
 * - models: the response envelope + auth payload types (mirror the backend contract)
 * - api: the envelope-aware {@link ApiClient} (Bearer + Idempotency-Key + correlation id, 401 refresh)
 * - auth: {@link SecureTokenStore} + {@link AuthService} (in-memory access token, secure session token)
 * - notifications: {@link registerDevice} (OneSignal init + player id → backend)
 * - ui: accessible primitives ({@link AppButton}, {@link AppTextField}, {@link Screen})
 * - screens: the shared auth flow + session routing ({@link AuthProvider}, {@link AuthGate},
 *   {@link LoginScreen}, {@link ForgotPasswordScreen}, {@link ResetPasswordScreen},
 *   {@link LogoutButton}) that both apps mount around their own authenticated home
 */
export * from './config';
export * from './models';
export * from './api';
export * from './auth';
export * from './notifications';
export * from './ui';
export * from './screens';
export * from './resources';
export * from './features';
export * from './i18n';
