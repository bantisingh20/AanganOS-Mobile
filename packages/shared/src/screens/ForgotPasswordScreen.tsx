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

export interface ForgotPasswordScreenProps {
  auth: AuthService;
  /** Go to the reset screen, pre-filling the identifier the user just entered. */
  onCodeRequested: (identifier: string) => void;
  /** Go back to the login screen. */
  onBackToLogin: () => void;
}

const NO_ERROR: FormErrorView = { message: '', fieldErrors: {} };

/**
 * Forgot-password screen (Req 2.1). Submits the identifier to request an OTP, then shows a NEUTRAL
 * "if registered, a code was sent" message — the UI never reveals whether the account exists
 * (security first), regardless of the backend response. From here the user proceeds to enter the
 * code on the reset screen. Accessible shared primitives throughout (Req 65.6).
 */
export function ForgotPasswordScreen({
  auth,
  onCodeRequested,
  onBackToLogin,
}: ForgotPasswordScreenProps) {
  const [identifier, setIdentifier] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<FormErrorView>(NO_ERROR);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(NO_ERROR);
    try {
      await auth.forgotPassword({ identifier: identifier.trim() });
      // Neutral regardless of outcome — don't leak account existence.
      setSent(true);
    } catch (err) {
      const view = toFormError(err);
      // Keep field-level validation (e.g. "identifier is required") but suppress a server message
      // that could hint at existence; for anything non-field we still show the neutral notice.
      if (Object.keys(view.fieldErrors).length > 0) {
        setError(view);
      } else {
        setSent(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root} accessibilityLabel="Forgot password">
      <ScreenHeader title="Forgot password" subtitle="Step 1 of 3" onBack={onBackToLogin} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Icon + intro */}
        <View style={styles.hero}>
          <View style={styles.iconBadge}>
            <Ionicons name="key-outline" size={26} color={theme.color.primary} />
          </View>
          <Text style={styles.heroText}>
            Enter your email or phone and we&apos;ll send a one-time code if it&apos;s registered.
          </Text>
        </View>

        <FormBanner message={error.message} tone="error" testID="forgot-error" />
      {sent ? (
        <FormBanner
          message="If that account is registered, a code has been sent."
          tone="success"
          testID="forgot-sent"
        />
      ) : null}

      <AppTextField
        label="Email or phone"
        value={identifier}
        onChangeText={setIdentifier}
        error={error.fieldErrors.identifier}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="username"
        textContentType="username"
        editable={!submitting}
        returnKeyType="go"
        onSubmitEditing={submit}
        testID="forgot-identifier"
      />

      <AppButton
        title="Send code"
        onPress={submit}
        loading={submitting}
        accessibilityHint="Requests a one-time reset code"
        testID="forgot-submit"
      />
      {sent ? (
        <AppButton
          title="Enter code"
          variant="secondary"
          onPress={() => onCodeRequested(identifier.trim())}
          accessibilityHint="Opens the code verification screen"
          testID="forgot-continue"
        />
      ) : null}
        <LinkButton
          title="Back to login"
          onPress={onBackToLogin}
          disabled={submitting}
          accessibilityHint="Returns to the sign in screen"
          testID="forgot-back"
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
