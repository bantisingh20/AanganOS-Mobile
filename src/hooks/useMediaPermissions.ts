import { useEffect } from 'react';

/**
 * Request camera + media-library permissions once on app launch so the user grants them up front
 * instead of at the moment they tap "take photo" (Req: on open, check + request required
 * permissions). Idempotent: if already granted the OS returns immediately without a prompt.
 *
 * <p>`expo-image-picker` is a native module provided by the host app and imported dynamically, so
 * this is a safe no-op in environments where it isn't present (tests, a build without the module).
 * Any failure is swallowed — a permission prompt must never crash app startup (fail safe).</p>
 */
export function useMediaPermissions(): void {
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const ImagePicker = await import('expo-image-picker');
        if (!active) return;
        // Only prompt when not already determined — avoids re-asking a user who chose "don't allow".
        const cam = await ImagePicker.getCameraPermissionsAsync();
        if (cam.status === 'undetermined' && cam.canAskAgain !== false) {
          await ImagePicker.requestCameraPermissionsAsync();
        }
        const lib = await ImagePicker.getMediaLibraryPermissionsAsync();
        if (lib.status === 'undetermined' && lib.canAskAgain !== false) {
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        }
      } catch {
        // Native module absent or prompt failed — ignore; the PhotoPicker re-requests on demand.
      }
    })();
    return () => {
      active = false;
    };
  }, []);
}
