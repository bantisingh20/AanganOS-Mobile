@echo off
set ANDROID_HOME=C:\AndroidSdk
set ANDROID_SDK_ROOT=C:\AndroidSdk
cd /d "c:\Mobibox\Banti\CommunityOS-Mobile\apps\aanganos"
npx expo start --clear > metro.log 2>&1
