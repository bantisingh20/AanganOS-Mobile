@echo off
setlocal
set ANDROID_HOME=C:\AndroidSdk
set ANDROID_SDK_ROOT=C:\AndroidSdk
set ADB=C:\AndroidSdk\platform-tools\adb.exe
set PKG=com.aanganos.app
set APK=c:\Mobibox\Banti\CommunityOS-Mobile\apps\aanganos\android\app\build\outputs\apk\debug\app-debug.apk
cd /d "c:\Mobibox\Banti\CommunityOS-Mobile\apps\aanganos\android"


echo === Devices ===
"%ADB%" devices

echo === Building debug APK ===
call gradlew.bat :app:assembleDebug -PreactNativeArchitectures=arm64-v8a,armeabi-v7a --console=plain
if errorlevel 1 (
  echo BUILD FAILED
  exit /b 1
)

echo === Uninstalling old app (ignored if not installed) ===
"%ADB%" uninstall %PKG%

echo === Installing fresh APK ===
"%ADB%" install -r "%APK%"
if errorlevel 1 (
  echo.
  echo adb install blocked ^(Install via USB is OFF^). Pushing APK to the phone instead...
  "%ADB%" push "%APK%" /sdcard/Download/aanganos-debug.apk
  echo.
  echo DONE. On the phone open:  Files -^> Download -^> aanganos-debug.apk  and tap Install.
  echo Then open the app ^(Metro below will serve the JS^).
) else (
  echo === Launching app ===
  "%ADB%" shell monkey -p %PKG% -c android.intent.category.LAUNCHER 1
)

echo === Setting up adb reverse tunnels (Metro + API over USB) ===
"%ADB%" reverse tcp:8081 tcp:8081
"%ADB%" reverse tcp:5080 tcp:5080

echo === Starting Metro (keep this window open) ===
cd /d "c:\Mobibox\Banti\CommunityOS-Mobile\apps\aanganos"
npx expo start --dev-client --port 8081
endlocal
