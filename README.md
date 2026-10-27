# AanganOS Mobile

React Native workspace for the AanganOS mobile app — one **role-aware Resident app** that serves
resident, guard, and admin features based on the signed-in user's roles — plus a shared internal
core. iOS **and** Android. (A separate Guard app existed earlier; it was merged into the one app and
removed — guard/gate features now live in `@communityos/shared` and are shown by role.)

## Setup choice: Expo (SDK 54) + dev client, npm workspaces monorepo

- **npm workspaces** share one TypeScript package (`@communityos/shared`) between both apps.
  Metro is configured (`metro.config.js` in each app) to watch the repo root and resolve the
  shared package from source — no build/publish step.
- **Expo dev client** (not Expo Go): OneSignal and secure storage need native modules.
  `react-native-onesignal` is wired through `onesignal-expo-plugin`; `expo-secure-store` gives
  Keychain (iOS) / Keystore (Android). Both are iOS + Android.
- Dependency versions are **pinned** (no `^`/`~`).

## Structure

```
CommunityOS-Mobile/
  package.json            # npm workspaces root
  tsconfig.base.json      # strict TS base + @communityos/shared path alias
  .env.example            # example env (no secrets)
  packages/shared/        # @communityos/shared
    src/
      config/             # resolveConfigFromEnv() -> AppConfig (env, nothing hardcoded)
      models/             # ApiResult/ApiError/FieldError/ErrorCode + auth payloads (mirror backend)
      api/                # ApiClient (envelope-aware) + ApiRequestError
      auth/               # SecureTokenStore + AuthService
      notifications/      # registerDevice() (OneSignal -> backend device)
      ui/                 # AppButton, AppTextField, Screen, theme (accessible)
  apps/urbannest/         # The single role-aware app (Expo) — resident/guard/admin by role
```

## Shared core (`@communityos/shared`)

- **API client** (`ApiClient`): prefixes the env base URL, injects `Authorization: Bearer`,
  injects `Idempotency-Key` for idempotent writes, sends/propagates `X-Correlation-Id`, unwraps
  the `{ success, data, error, correlationId }` envelope, maps `error.fieldErrors` into a
  `{ field: reason }` map, surfaces the error `code`, and runs a single-flight
  **refresh-or-logout** on `401`.
- **Secure token store** (`SecureTokenStore`): access token in memory, session token in
  `expo-secure-store`. Tokens are never logged.
- **OneSignal** (`registerDevice`): init with the env app id, obtain the player id, POST it to the
  configurable device endpoint (idempotent per device).
- **UI primitives**: accessible `AppButton` / `AppTextField` / `Screen` (labels, roles, ≥44pt
  touch targets).

## Running

```
cp .env.example apps/urbannest/.env   # fill in real values (never commit)
npm install
npm run typecheck                     # type-checks the shared package
npm run urbannest                     # expo start --dev-client (needs a dev client build)
```

Native builds require a one-time `expo prebuild` + a dev client build (`expo run:ios` /
`expo run:android`) because of the OneSignal native module.
