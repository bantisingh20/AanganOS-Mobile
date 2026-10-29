import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Device-accurate safe-area insets, auto-adjusting per device, from
 * `react-native-safe-area-context` (the values the OS reports for the status bar / notch and the
 * gesture-navigation bar). Nothing is hardcoded — a tall-notch phone, a gesture-pill phone and a
 * 3-button-nav phone each report their own insets and the bars pad themselves accordingly.
 *
 * Must be rendered under a `<SafeAreaProvider>` (wired once in each app's root). The whole shell
 * reads from here, so a device with a different gesture bar just works.
 */
export interface SafeInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Current safe-area insets for the active device (reactive — updates on rotation / system-bar changes). */
export function useSafeInsets(): SafeInsets {
  const insets = useSafeAreaInsets();
  return { top: insets.top, bottom: insets.bottom, left: insets.left, right: insets.right };
}
