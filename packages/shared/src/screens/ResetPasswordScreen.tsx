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

export interface ResetPasswordScreenProps {
  auth: AuthService;
  /** Identifier carried over from the forgot screen. */
  initialIdentifier?: string;
  /** The OTP validated on the verify screen (submitted with the new password to the reset endpoint). */
  verifiedCode: string;
  /** Return to login after a successful reset — the host passes a success message to show there. */
  onResetComplete: (message: string) => void;
  /** Go back to the login screen without resetting. */
  onBackToLogin: () => void;
}

const NO_ERROR: FormErrorView = { message: '', fieldErrors: {} };
const SUCCESS_MESSAGE = 'Your password has been reset. Please sign in.';
const MIN_PASSWORD = 4;

/**
 * Step 3 of the password reset (Req 2.3): set the new password. The identifier + the OTP verified on
 * the previous screen + the new password go to `AuthService.resetPassword` — which is where the
 * server actually validates the code (there is no standalone verify endpoint). On success the host
 * returns to login with a success banner. If the server rejects the code (expired/used) the error is
 * shown here; the user can go back to request a fresh code. Accessible shared primitives (Req 65.6).
 */
export function ResetPasswordScreen({
  auth,
  initialIdentifier = '',
  verifiedCode,
  onResetComplete,
  onBackToLogin,
}: ResetPasswordScreenProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<FormErrorView>(NO_ERROR);

  const submit = async () => {
    if (submitting) return;

    if (newPassword.length < MIN_PASSWORD) {
      setError({ message: '', fieldErrors: { newPassword: `Use at least ${MIN_PASSWORD} characters` } });
      return;
    }
    if (newPassword !== confirm) {
      setError({ message: '', fieldErrors: { confirm: 'Passwords do not match' } });
      return;
    }

    setSubmitting(true);
    setError(NO_ERROR);
    try {
      await auth.resetPassword({
        identifier: initialIdentifier.trim(),
        code: verifiedCode.trim(),
        newPassword,
      });
      onResetComplete(SUCCESS_MESSAGE);
    } catch (err) {
      setError(toFormError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root} accessibilityLabel="Set new password">
      <ScreenHeader title="Set a new password" subtitle="Step 3 of 3" onBack={onBackToLogin} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.iconBadge}>
            <Ionicons name="lock-closed-outline" size={26} color={theme.color.primary} />
          </View>
          <Text style={styles.heroText}>Choose a new password for your account.</Text>
        </View>

        <FormBanner message={error.message} tone="error" testID="reset-error" />

      <AppTextField
        label="New password"
        value={newPassword}
        onChangeText={setNewPassword}
        error={error.fieldErrors.newPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="password-new"
        textContentType="newPassword"
        editable={!submitting}
        returnKeyType="next"
        testID="reset-new-password"
      />
      <AppTextField
        label="Confirm new password"
        value={confirm}
        onChangeText={setConfirm}
        error={error.fieldErrors.confirm}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="password-new"
        textContentType="newPassword"
        editable={!submitting}
        returnKeyType="go"
        onSubmitEditing={submit}
        testID="reset-confirm-password"
      />

      <AppButton
        title="Reset password"
        onPress={submit}
        loading={submitting}
        accessibilityHint="Sets your new password using the verified code"
        testID="reset-submit"
      />
        <LinkButton
          title="Back to login"
          onPress={onBackToLogin}
          disabled={submitting}
          accessibilityHint="Returns to the sign in screen"
          testID="reset-back"
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
});
