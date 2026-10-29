import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { FormScreen } from '@/components/ui/FormScreen';
import { AppTextField } from '@/components/ui/AppTextField';
import { AppButton } from '@/components/ui/AppButton';
import { FormBanner } from '@/components/ui/FormBanner';
import { useAsyncAction } from '@/hooks';
import { theme } from '@/theme';
import type { ResourceClients } from '@/services/resources';
import type { ScanAccessResult } from '@/types/gate';

export interface VisitPassVerifyScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
}

/** Manual fallback entry mode when the camera can't read the QR (damaged code / no camera). */
type ManualMode = 'otp' | 'token';

/**
 * Guard visit-pass verification (Req 23.3, 23.4, 25.3) — redesigned around a LIVE QR SCAN.
 *
 * <p>The guard points the camera at the visitor's pass QR; a successful scan auto-verifies the pass
 * and the result opens as a CARD (visitor, uses, status, admit). No typing in the common path. For a
 * damaged code or a visitor reading a code aloud, a manual fallback (OTP or pasted token) stays one
 * tap away. Rejections (expired/used/revoked/invalid) show the server's reason and never record an
 * entry (Req 23.4, 24.5). Verify + record-entry both go through the shared gate client, so each write
 * already carries an idempotency key.</p>
 *
 * <p>Camera permission is requested on demand; a denied/unavailable camera degrades gracefully to the
 * manual fallback rather than a dead screen. One scan = one verify (a short cooldown debounces the
 * continuous scanner so we don't spam the API with the same code).</p>
 */
export function VisitPassVerifyScreen({ resources, onBack }: VisitPassVerifyScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<ScanAccessResult | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualMode, setManualMode] = useState<ManualMode>('otp');
  const [otp, setOtp] = useState('');
  const [token, setToken] = useState('');
  // Guards the continuous scanner: once a code fires a scan we stop accepting new scans until the
  // guard taps "Scan again" (prevents the same QR re-triggering the scan dozens of times per second).
  const lockRef = useRef(false);

  const verify = useAsyncAction((input: { qrToken?: string; otp?: string }) =>
    resources.gate.scanAccess(input).then((r) => {
      setResult(r);
      return r;
    }),
  );

  const onScan = useCallback(
    (scan: BarcodeScanningResult) => {
      if (lockRef.current || !scan.data) return;
      lockRef.current = true;
      void verify.run({ qrToken: scan.data.trim() });
    },
    [verify],
  );

  const reset = () => {
    lockRef.current = false;
    setResult(null);
    verify.reset();
  };

  const submitManual = () => {
    const value = (manualMode === 'otp' ? otp : token).trim();
    if (!value) return;
    lockRef.current = true; // pause the scanner while a manual result is shown
    void verify.run(manualMode === 'otp' ? { otp: value } : { qrToken: value });
  };

  const scanning = !result && !verify.running;
  const granted = permission?.granted === true;

  return (
    <FormScreen title="Verify visit pass" subtitle="Scan the visitor's pass QR" {...(onBack ? { onBack } : {})}>
      {/* Scanner surface — the primary path. Shows the live camera when permitted, else a prompt. */}
      <View style={styles.scanner}>
        {granted ? (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              active={scanning}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanning ? onScan : undefined}
            />
            {/* Reticle overlay — a framed window hints where to aim the QR. */}
            <View style={styles.reticle} pointerEvents="none">
              <View style={[styles.corner, styles.tl]} />
              <View style={[styles.corner, styles.tr]} />
              <View style={[styles.corner, styles.bl]} />
              <View style={[styles.corner, styles.br]} />
            </View>
            {verify.running ? (
              <View style={styles.scanBusy} pointerEvents="none">
                <ActivityIndicator color={theme.color.primaryText} />
                <Text style={styles.scanBusyText}>Verifying…</Text>
              </View>
            ) : !result ? (
              <View style={styles.scanHint} pointerEvents="none">
                <Ionicons name="qr-code-outline" size={16} color={theme.color.primaryText} />
                <Text style={styles.scanHintText}>Point at the pass QR</Text>
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.permission}>
            <Ionicons name="camera-outline" size={32} color={theme.color.primaryText} />
            <Text style={styles.permissionText}>
              {permission && !permission.canAskAgain
                ? 'Camera access is off. Enable it in Settings, or use manual entry below.'
                : 'Allow camera access to scan the visitor pass QR.'}
            </Text>
            {!permission || permission.canAskAgain ? (
              <View style={styles.permissionBtn}>
                <AppButton
                  title="Enable camera"
                  onPress={() => void requestPermission()}
                  accessibilityHint="Grant camera access to scan QR codes"
                />
              </View>
            ) : null}
          </View>
        )}
      </View>

      {/* Result card — opens on any scan (scan or manual). Shows checked-in / out / closed. */}
      {result ? (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.avatar, { backgroundColor: `${scanTone(result.action)}1f` }]}>
              <Ionicons name={scanIcon(result.action)} size={26} color={scanTone(result.action)} />
            </View>
            <View style={styles.cardHeadText}>
              <Text style={styles.visitor} numberOfLines={1}>{result.name || scanTitle(result.action)}</Text>
              <Text style={styles.sub}>{scanTitle(result.action)}</Text>
            </View>
          </View>

          {result.reason ? (
            <FormBanner message={result.reason} tone={result.action === 'rejected' || result.action === 'closed' ? 'error' : 'success'} />
          ) : null}

          <AppButton
            title="Scan again"
            variant="secondary"
            onPress={reset}
            accessibilityHint="Clear this result and scan another pass"
          />
        </View>
      ) : null}

      {/* Verify error (e.g. network) outside the card so the guard can retry by scanning again. */}
      {!result && verify.error ? (
        <View style={styles.card}>
          <FormBanner message={verify.error.message} tone="error" />
          <AppButton title="Try again" variant="secondary" onPress={reset} accessibilityHint="Reset and scan again" />
        </View>
      ) : null}

      {/* Manual fallback — collapsed by default so the scan path stays front and centre. */}
      <Pressable
        style={styles.manualToggle}
        onPress={() => setManualOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityHint="Enter the pass OTP or token manually when the QR can't be scanned"
      >
        <Ionicons name="keypad-outline" size={16} color={theme.color.primary} />
        <Text style={styles.manualToggleText}>Can't scan? Enter manually</Text>
        <Ionicons name={manualOpen ? 'chevron-up' : 'chevron-down'} size={16} color={theme.color.primary} />
      </Pressable>

      {manualOpen ? (
        <View style={styles.manual}>
          <View style={styles.segment}>
            <View style={styles.flex}>
              <AppButton
                title="OTP"
                variant={manualMode === 'otp' ? 'primary' : 'secondary'}
                onPress={() => setManualMode('otp')}
                accessibilityHint="Enter the visitor's one-time code"
              />
            </View>
            <View style={styles.flex}>
              <AppButton
                title="Token"
                variant={manualMode === 'token' ? 'primary' : 'secondary'}
                onPress={() => setManualMode('token')}
                accessibilityHint="Paste the pass QR token"
              />
            </View>
          </View>
          {manualMode === 'otp' ? (
            <AppTextField
              label="OTP"
              value={otp}
              onChangeText={setOtp}
              placeholder="Enter the visitor's code"
              keyboardType="number-pad"
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={submitManual}
            />
          ) : (
            <AppTextField
              label="QR token"
              value={token}
              onChangeText={setToken}
              placeholder="Paste the pass QR token"
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={submitManual}
            />
          )}
          <AppButton
            title="Verify"
            loading={verify.running}
            disabled={(manualMode === 'otp' ? otp.trim() : token.trim()).length === 0}
            onPress={submitManual}
            accessibilityHint="Verify this visit pass"
          />
        </View>
      ) : null}
    </FormScreen>
  );
}

function scanTone(action: ScanAccessResult['action']): string {
  switch (action) {
    case 'checked_in': return theme.color.success;
    case 'checked_out': return theme.color.info;
    default: return theme.color.danger;
  }
}

function scanIcon(action: ScanAccessResult['action']): keyof typeof Ionicons.glyphMap {
  switch (action) {
    case 'checked_in': return 'log-in';
    case 'checked_out': return 'log-out';
    default: return 'close-circle';
  }
}

function scanTitle(action: ScanAccessResult['action']): string {
  switch (action) {
    case 'checked_in': return 'Checked in';
    case 'checked_out': return 'Checked out';
    case 'closed': return 'Access closed';
    default: return 'Not valid';
  }
}

const RETICLE = 200;

const styles = StyleSheet.create({
  scanner: {
    height: 300,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    backgroundColor: theme.color.hero,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadow.card,
  },
  reticle: {
    width: RETICLE,
    height: RETICLE,
    alignSelf: 'center',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: theme.color.primaryText,
  },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: theme.radius.md },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: theme.radius.md },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: theme.radius.md },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: theme.radius.md },
  scanHint: {
    position: 'absolute',
    bottom: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.color.onHeroSoft,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
  },
  scanHintText: { color: theme.color.primaryText, fontSize: theme.fontSize.caption, fontWeight: '600' },
  scanBusy: {
    position: 'absolute',
    bottom: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.color.onHeroSoft,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
  },
  scanBusyText: { color: theme.color.primaryText, fontSize: theme.fontSize.caption, fontWeight: '600' },
  permission: { alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.xl },
  permissionText: {
    color: theme.color.primaryText,
    fontSize: theme.fontSize.label,
    textAlign: 'center',
    opacity: 0.9,
  },
  permissionBtn: { alignSelf: 'stretch' },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadow.soft,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  avatar: { width: 48, height: 48, borderRadius: theme.radius.pill, alignItems: 'center', justifyContent: 'center' },
  cardHeadText: { flex: 1, gap: 2 },
  visitor: { fontSize: theme.fontSize.title, fontWeight: '800', color: theme.color.text },
  sub: { fontSize: theme.fontSize.label, color: theme.color.mutedText },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: theme.fontSize.body, color: theme.color.text },
  entryOk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#e6f4ea',
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  entryOkText: { color: theme.color.success, fontWeight: '700', fontSize: theme.fontSize.body },
  manualToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: theme.spacing.sm,
  },
  manualToggleText: { color: theme.color.primary, fontWeight: '700', fontSize: theme.fontSize.label },
  manual: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadow.soft,
  },
  segment: { flexDirection: 'row', gap: theme.spacing.sm },
  flex: { flex: 1 },
});
