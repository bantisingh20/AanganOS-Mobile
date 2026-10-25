import type { ExpoConfig } from 'expo/config';

/**
 * Resident/Owner app config. iOS + Android. This build ships WITHOUT the OneSignal plugin and the
 * Expo dev-client launcher so it opens straight into the app (no developer "select network / scan
 * QR / enter URL" harness). Push can be re-added later behind a real OneSignal app id.
 */
const config: ExpoConfig = {
  name: 'UrbanNest',
  slug: 'communityos-resident',
  scheme: 'communityos-resident',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: 'com.communityos.resident',
    supportsTablet: true,
  },
  android: {
    package: 'com.communityos.resident',
    newArchEnabled: false,
    permissions: [
      'android.permission.CAMERA',
      'android.permission.READ_MEDIA_IMAGES',
    ],
  },
  plugins: [
    'expo-secure-store',
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
