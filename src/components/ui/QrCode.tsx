import React, { useMemo } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import qrcode from 'qrcode-generator';
import { emitToast } from '@/utils/toastBus';

export interface QrCodeProps {
  /** The string to encode (e.g. the pass QR token). */
  value: string;
  /** Overall QR size in px (the matrix is scaled to fit). Default 220. */
  size?: number;
  /** Quiet-zone margin in modules on each side. Default 2. */
  quietZone?: number;
  /** Foreground (dark) colour. Default black. */
  color?: string;
  /** Background (light) colour. Default white. */
  backgroundColor?: string;
}

/**
 * Scannable QR code rendered in PURE JS — no `react-native-svg` or any native module (so no
 * dev-client rebuild and none of the autolinking issues). `qrcode-generator` computes the module
 * matrix; we draw it as a grid of absolutely-positioned black/white {@link View} cells. Any QR
 * scanner reads it off the screen. Reusable for any value (tokens, URLs, OTPs).
 */
export function QrCode({ value, size = 220, quietZone = 2, color = '#000000', backgroundColor = '#FFFFFF' }: QrCodeProps) {
  const { count, cells } = useMemo(() => {
    // Type 0 = auto-size to fit the data; 'M' = medium error correction (good for screen scanning).
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const moduleCount = qr.getModuleCount();
    const total = moduleCount + quietZone * 2;
    const dark: Array<{ r: number; c: number }> = [];
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (qr.isDark(r, c)) dark.push({ r, c });
      }
    }
    return { count: total, cells: dark };
  }, [value, quietZone]);

  // Cell size derived so count*cell == size. Add a hairline overdraw to avoid seams between cells.
  const cell = size / count;
  const overdraw = 0.5;

  return (
    <View style={[styles.wrap, { width: size, height: size, backgroundColor }]} accessibilityRole="image" accessibilityLabel="QR code">
      {cells.map(({ r, c }, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: (r + quietZone) * cell,
            left: (c + quietZone) * cell,
            width: cell + overdraw,
            height: cell + overdraw,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', alignSelf: 'center', borderRadius: 4, overflow: 'hidden' },
});

/**
 * Generate a QR image for `value` and open the OS share sheet with it as a FILE attachment (so the
 * visitor receives a scannable QR picture, not just text). Pure-JS: {@link qrcode} renders the QR to
 * a base64 data-URL, which we write to a cache file via `expo-file-system` (a module already in the
 * app — imported dynamically so the shared package carries no hard dependency) and share by file
 * URI. Falls back to sharing `message` as text if the file write/share isn't available. Never
 * throws — a cancelled or unsupported share is a no-op (fail safe).
 *
 * @returns `true` when the QR image was shared, `false` when it fell back to text-only.
 */
export async function shareQrImage(value: string, message?: string): Promise<boolean> {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const dataUrl = qr.createDataURL(8, 2);
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');

    const FileSystem = await import('expo-file-system/legacy');
    const dir = FileSystem.cacheDirectory;
    if (!dir) {
      throw new Error('No cache directory');
    }
    const fileUri = `${dir}visit-pass-qr.gif`;
    await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });

    const Sharing = await import('expo-sharing');
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'image/gif',
        dialogTitle: message ?? 'Share visit pass QR',
        ...(message ? { UTI: 'public.image' } : {}),
      });
      return true;
    }
    throw new Error('Sharing not available');
  } catch {
    emitToast({
      tone: 'error',
      title: 'Could not attach the QR image',
      message: 'Sharing the pass details as text instead.',
    });
    try {
      if (message) {
        await Share.share({ message });
      }
    } catch {
      /* cancelled — nothing to do */
    }
    return false;
  }
}
