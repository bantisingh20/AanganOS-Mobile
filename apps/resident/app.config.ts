import type { ExpoConfig } from 'expo/config';

/**
 * Resident/Owner app config. iOS + Android. Push notifications via OneSignal (FCM under the hood)
 * using its Expo config plugin — this needs a dev-client / prebuild, not Expo Go. The OneSignal
 * app id is read from env at build time (EXPO_PUBLIC_ONESIGNAL_APP_ID), never hardcoded here.
 */
const config: ExpoConfig = {
  name: 'UrbanNest',
  slug: 'urbannest-resident',
  scheme: 'urbannest',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: 'com.urbannest.resident',
    supportsTablet: true,
  },
  android: {
    package: 'com.urbannest.resident',
    newArchEnabled: false,
    permissions: [
      'android.permission.CAMERA',
      'android.permission.READ_MEDIA_IMAGES',
    ],
  },
  plugins: [
    'expo-secure-store',
    [
      'onesignal-expo-plugin',
      {
        mode: 'production',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow $(PRODUCT_NAME) to add a visitor photo from your library.',
        cameraPermission: 'Allow $(PRODUCT_NAME) to take a visitor photo.',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'Allow $(PRODUCT_NAME) to scan a visitor pass QR code at the gate.',
      },
    ],
  ],
};

export default config;
