# AanganOS mobile — run / build commands

The single app lives in `apps/aanganos` (workspace package `@communityos/aanganos`).
All shared logic is in `packages/shared`. Android package id is `com.urbannest.resident`
(do NOT change — Firebase/OneSignal push registration depends on it).

Set the Android SDK env first in any PowerShell terminal that builds native:
```
$env:ANDROID_HOME="C:\AndroidSdk"; $env:ANDROID_SDK_ROOT="C:\AndroidSdk"
```

## 1. Start Metro only (JS reload for an already-installed dev client)
From repo root `c:\Mobibox\Banti\CommunityOS-Mobile`:
```
npm run aanganos
```
or (clears cache):
```
npm run aanganos -- --clear
```
Helper scripts (set SDK env + start Metro): `apps/aanganos/start-metro.cmd`,
`apps/aanganos/start-metro-clear.cmd`.

## 2. One-shot native run (build + install + start Metro)
From `c:\Mobibox\Banti\CommunityOS-Mobile\apps\aanganos`:
```
npx expo run:android
```
Needs a connected device/emulator. On MIUI (Xiaomi) the `adb install` step can be
blocked — enable Settings > Additional settings > Developer options > "Install via USB",
or use the manual sideload below.

## 3. Build the debug APK with Gradle (then sideload)
From `c:\Mobibox\Banti\CommunityOS-Mobile\apps\aanganos\android`:
```
cmd /c "gradlew.bat :app:assembleDebug --console=plain"
```
Output APK:
```
apps/aanganos/android/app/build/outputs/apk/debug/app-debug.apk
```
Install to the device:
```
adb install -r "apps/aanganos/android/app/build/outputs/apk/debug/app-debug.apk"
```
If `adb install` is blocked by MIUI, push it and open it from the phone's Files app:
```
adb push "apps/aanganos/android/app/build/outputs/apk/debug/app-debug.apk" /sdcard/Download/aanganos-debug.apk

adb reverse tcp:8081 tcp:8081
adb reverse tcp:5080 tcp:5080
```

## 4. Release build (small app size)
From `apps/aanganos/android`:
```
cmd /c "gradlew.bat :app:assembleRelease --console=plain"
```
Output APK: `apps/aanganos/android/app/build/outputs/apk/release/app-release.apk`.

Size reductions are release-only (debug stays large, ~128 MB, because it bundles
JS-from-Metro tooling + all ABIs + no minify — that is expected and does not affect dev):
- `android.enableMinifyInReleaseBuilds=true` — R8 code shrink/obfuscation.
- `android.enableShrinkResourcesInReleaseBuilds=true` — removes unused resources.
- `reactNativeArchitectures=armeabi-v7a,arm64-v8a` + `ndk.abiFilters` in
  `app/build.gradle` (driven by the same list) — drops x86/x86_64 (emulator-only).
  Important: `reactNativeArchitectures` alone does NOT remove third-party prebuilt
  `.so` files (ML Kit/QR, Expo, etc.) — those still ship all 4 ABIs. The
  `ndk.abiFilters` in `defaultConfig` is what actually filters every native lib.
- Hermes is on (`hermesEnabled=true`) so JS ships as compact bytecode.

Measured result (universal APK, both arm ABIs): debug 127.6 MB -> release 38.2 MB
(~70% smaller). `lib/` native code is the dominant remaining weight (ML Kit barcode +
Hermes/RN); a single-ABI split or AAB roughly halves it again per device.

Smaller still — per-ABI APKs (optional): set `android.enableAbiSplitsInReleaseBuilds=true`
in `gradle.properties`, then `assembleRelease` emits one APK per ABI (arm64 users only
download the arm64 one) plus a universal APK. A device install should use the matching
`app-arm64-v8a-release.apk` / `app-armeabi-v7a-release.apk`.

Smallest download — App Bundle for Play Store:
```
cmd /c "gradlew.bat :app:bundleRelease --console=plain"
```
Output: `apps/aanganos/android/app/build/outputs/bundle/release/app-release.aab`.
Google Play generates per-device APKs from the AAB, so users download ~20-30 MB.

Caution: release uses R8/minify. Native modules (OneSignal, Firebase, Hermes, Expo)
ship their own keep rules, but always install + smoke-test a release build (push,
login, QR scan) before shipping — minify can strip reflection-reached classes. Add
keeps to `apps/aanganos/android/app/proguard-rules.pro` if anything breaks. Release
is currently signed with the DEBUG keystore (`signingConfigs.debug`) — generate a real
keystore before a Play release.

## Notes
- Debug builds load JS from Metro at runtime, so a JS-only change just needs Metro
  running + a reload (shake -> Reload) — no rebuild. A NATIVE dependency change
  (new native module) DOES need a rebuild (step 2 or 3).
- Typecheck everything: `npm run typecheck:all` from the repo root.
- Device checks: `adb devices` (wireless adb shows up as an `_adb-tls-connect` entry);
  `adb reverse tcp:5080 tcp:5080` to let the device reach a local backend on localhost.
- Local backend API base for the device: set `EXPO_PUBLIC_API_BASE_URL` in
  `apps/aanganos/.env` (restart Metro with --clear after changing env). Production
  default is `https://urbannestapi.sharcnix.com`.
