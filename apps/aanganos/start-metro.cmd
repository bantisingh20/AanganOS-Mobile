@echo off
set ANDROID_HOME=C:\AndroidSdk
set ANDROID_SDK_ROOT=C:\AndroidSdk
cd /d "c:\Mobibox\Banti\CommunityOS-Mobile\apps\aanganos"
npx expo start --dev-client > metro.log 2>&1
