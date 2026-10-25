import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../ui/ScreenHeader';
import { AppTextField } from '../ui/AppTextField';
import { AppButton } from '../ui/AppButton';
import { FormBanner } from '../ui/FormBanner';
import { LinkButton } from '../ui/LinkButton';
import { theme } from '../ui/theme';
import { toFormError, type FormErrorView } from '../api/formError';
import type { AuthService } from '../auth/authService';

export interface VerifyOtpScreenProps {
  auth: AuthService;
  /** The email/phone the code was sent to (carried from the forgot screen). */
  identifier: string;
  /** Advance to the new-password screen, carrying the validated code. */
  onVerified: (code: string) => void;
  /** Go back to the login screen. */
  onBackToLogin: () => void;
}

const NO_ERROR: FormErrorView = { message: '', fieldErrors: {} };
// Default OTP is 6 digits (backend AuthOptions.OtpLength); accept 4–10 to tolerate config overrides.
const OTP_RE = /^\d{4,10}$/;

/**
 * Step 2 of the password reset: enter the one-time code sent to {@link identifier}.
 *
 * The backend has NO standalone verify-OTP endpoint — the code is only checked server-side at the
 * final `resetPassword` call (together with the new password). So this screen validates the code's
 * FORMAT (numeric, 4–10 digits) and carries it forward; the real server-side check happens on the
 * next screen. A "Resend code" link re-requests an OTP via the existing forgot endpoint.
 */
export function VerifyOtpScreen({ auth, identifier, onVerified, onBackToLogin }: VerifyOtpScreenProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<FormErrorView>(NO_ERROR);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const verify = async () => {
    if (verifying) return;
    const trimmed = code.trim();
    if (!OTP_RE.test(trimmed)) {
      setError({ message: 'Enter the numeric code we sent you.', fieldErrors: { code: 'Invalid code' } });
      return;
    }
    setError(NO_ERROR);
    setVerifying(true);
    try {
      // Verify the code against the SAME identifier the user entered (server-side, no consume).
      const res = await auth.verifyOtp({ identifier: identifier.trim(), code: trimmed });
      if (res.valid) {
        onVerified(trimmed);
      } else {
        setError({
          message: 'That code is invalid or has expired. Check it or resend a new one.',
          fieldErrors: { code: 'Invalid code' },
        });
      }
    } catch (err) {
      setError(toFormError(err));
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (resending) return;
    setResending(true);
    setError(NO_ERROR);
    setResent(false);
    try {
      await auth.forgotPassword({ identifier: identifier.trim() });
      setResent(true);
    } catch (err) {
      // Neutral — don't leak account existence; only surface field errors.
      const view = toFormError(err);
      if (Object.keys(view.fieldErrors).length > 0) setError(view);
      else setResent(true);
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={styles.root} accessibilityLabel="Verify code">
      <ScreenHeader title="Enter the code" subtitle="Step 2 of 3" onBack={onBackToLogin} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.iconBadge}>
            <Ionicons name="shield-checkmark-outline" size={26} color={theme.color.primary} />
          </View>
          <Text style={styles.heroText}>
            We sent a one-time code to{'\n'}
            <Text style={styles.heroStrong}>{identifier || 'your contact'}</Text>. Enter it below to continue.
          </Text>
        </View>

        <FormBanner message={error.message} tone="error" testID="verify-error" />
      {resent ? (
        <FormBanner message="A new code has been sent." tone="success" testID="verify-resent" />
      ) : null}

      <AppTextField
        label="One-time code"
        value={code}
        onChangeText={setCode}
        error={error.fieldErrors.code}
        keyboardType="number-pad"
        autoCapitalize="none"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        returnKeyType="go"
        onSubmitEditing={verify}
        testID="verify-code"
      />

        <AppButton
          title="Verify code"
          onPress={verify}
          loading={verifying}
          accessibilityHint="Verifies the one-time code and continues to set a new password"
          testID="verify-submit"
        />
        <AppButton
          title="Resend code"
          variant="secondary"
          onPress={resend}
          loading={resending}
          accessibilityHint="Sends a new one-time code"
          testID="verify-resend"
        />
        <LinkButton
          title="Back to login"
          onPress={onBackToLogin}
          disabled={resending}
          accessibilityHint="Returns to the sign in screen"
          testID="verify-back"
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  body: { flexGrow: 1, padding: theme.spacing.lg, gap: theme.spacing.md },
  hero: { alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.xs },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: theme.color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {
    fontSize: theme.fontSize.body,
    color: theme.color.mutedText,
    textAlign: 'center',
    lineHeight: 20,
  },
  heroStrong: { color: theme.color.text, fontWeight: '700' },
});
