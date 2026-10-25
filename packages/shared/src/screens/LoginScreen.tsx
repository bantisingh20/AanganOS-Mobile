import React, { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppTextField } from '../ui/AppTextField';
import { PhoneField } from '../ui/PhoneField';
import { AppButton } from '../ui/AppButton';
import { FormBanner } from '../ui/FormBanner';
import { LinkButton } from '../ui/LinkButton';
import { theme } from '../ui/theme';
import { useSafeInsets } from '../ui/safeInsets';
import { toFormError, type FormErrorView } from '../api/formError';
import { ApiRequestError } from '../api/errors';
import { useAuth } from '../auth/AuthContext';

export interface LoginScreenProps {
  /** App name shown in the header, e.g. "Resident" / "Guard". */
  appTitle: string;
  /** Navigate to the forgot-password screen. */
  onForgotPassword: () => void;
  /** Optional content rendered above the form (e.g. a one-time "password reset" success notice). */
  headerSlot?: React.ReactNode;
}

const NO_ERROR: FormErrorView = { message: '', fieldErrors: {} };

// `__DEV__` is a React Native global: true in dev (Metro), false in a release bundle.
declare const __DEV__: boolean;

// DEV-ONLY login prefill to speed up local testing. In a RELEASE build (__DEV__ === false) the
// fields start EMPTY — testers never see dev credentials or a prefilled form.
const DEV_DEFAULT_IDENTIFIER = __DEV__ ? '+917984263575' : '';
const DEV_DEFAULT_PASSWORD = __DEV__ ? '123' : '';

// Online logo (per request: use an online logo). A neutral community/building glyph on a soft badge.
const LOGO_URI = 'https://cdn-icons-png.flaticon.com/512/619/619153.png';


export function LoginScreen({ appTitle, onForgotPassword, headerSlot }: LoginScreenProps) {
  const { login } = useAuth();
  // DEV ONLY: prefilled credentials for faster local testing. REMOVE before production.
  const [identifier, setIdentifier] = useState(DEV_DEFAULT_IDENTIFIER);
  const [password, setPassword] = useState(DEV_DEFAULT_PASSWORD);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<FormErrorView>(NO_ERROR);

  const submit = async () => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(NO_ERROR);
    try {
      await login({ identifier: identifier.trim(), password, platform: Platform.OS });
      // On success the AuthProvider switches the shell to the authenticated app — nothing to do.
    } catch (err) {
      const view = toFormError(err);
      if (err instanceof ApiRequestError && err.code === 'UNAUTHENTICATED' && !/lock/i.test(err.message)) {
        setError({ message: 'The phone number or password is incorrect. Please try again.', fieldErrors: view.fieldErrors });
      } else {
        setError(view);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const insets = useSafeInsets();
  return (
    <View style={styles.root} accessibilityLabel={`${appTitle} sign in`}>
      {/* Gradient-like backdrop: a dark base with soft translucent colour blobs (pure-RN "gradient"). */}
      <View style={styles.backdrop} pointerEvents="none">
        <View style={[styles.blob, styles.blobTop]} />
        <View style={[styles.blob, styles.blobMid]} />
        <View style={[styles.blob, styles.blobBottom]} />
      </View>

      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scroll,
              { paddingTop: styles.scroll.padding + insets.top, paddingBottom: styles.scroll.padding + insets.bottom },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Branded header — clay logo badge */}
            <View style={styles.header}>
              <View style={styles.logoClay}>
                <View style={styles.logoInner}>
                  <Image
                    source={{ uri: LOGO_URI }}
                    style={styles.logo}
                    resizeMode="contain"
                    accessible={false}
                  />
                </View>
              </View>
              <Text style={styles.brand} accessibilityRole="header">UrbanNest</Text>
              <View style={styles.brandPill}>
                <Text style={styles.brandSub}>{appTitle}</Text>
              </View>
            </View>

            {/* Frosted glass card */}
            <View style={styles.glassCard}>
              <Text style={styles.cardTitle}>Welcome back</Text>
              <Text style={styles.cardSubtitle}>Sign in to continue to your account</Text>

              {headerSlot}
              <FormBanner message={error.message} tone="error" testID="login-error" />

              {/* Neumorphic field well: the inputs sit on a soft extruded surface. */}
              <View style={styles.fieldWell}>
                <PhoneField
                  label="Phone number"
                  value={identifier}
                  onChangeText={setIdentifier}
                  {...(error.fieldErrors.identifier ? { error: error.fieldErrors.identifier } : {})}
                  editable={!submitting}
                  placeholder="Your phone number"
                  testID="login-identifier"
                />
                <AppTextField
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  error={error.fieldErrors.password}
                  placeholder="Your password"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password"
                  textContentType="password"
                  editable={!submitting}
                  returnKeyType="go"
                  onSubmitEditing={submit}
                  testID="login-password"
                />
              </View>

              <View style={styles.forgotRow}>
                <LinkButton
                  title="Forgot password?"
                  onPress={onForgotPassword}
                  disabled={submitting}
                  accessibilityHint="Opens the password reset screen"
                  testID="login-forgot"
                />
              </View>

              <AppButton
                title="Sign in"
                onPress={submit}
                loading={submitting}
                accessibilityHint="Signs in with your email or phone and password"
                testID="login-submit"
              />
            </View>

            <Text style={styles.footer}>Secure community management</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.primary },
  flex: { flex: 1 },

  // --- Gradient-like backdrop (blue base + soft colour blobs), matching the home header. ---
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.color.primary, overflow: 'hidden' },
  blob: { position: 'absolute', borderRadius: 9999 },
  blobTop: {
    width: 420, height: 420, top: -140, right: -120,
    backgroundColor: 'rgba(255,255,255,0.18)', // light glow
  },
  blobMid: {
    width: 360, height: 360, top: 180, left: -140,
    backgroundColor: 'rgba(14,165,233,0.45)', // cyan glow
  },
  blobBottom: {
    width: 460, height: 460, bottom: -180, right: -80,
    backgroundColor: 'rgba(37,99,235,0.55)', // deeper blue
  },

  scroll: { flexGrow: 1, justifyContent: 'center', padding: theme.spacing.xl, gap: theme.spacing.xl },

  // --- Header + clay logo badge ---
  header: { alignItems: 'center', gap: theme.spacing.md },
  logoClay: {
    width: 104, height: 104, borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.3, shadowRadius: 24, elevation: 12,
  },
  logoInner: {
    width: 76, height: 76, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0b1726', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 4,
  },
  logo: { width: 46, height: 46, tintColor: theme.color.primary },
  brand: { fontSize: theme.fontSize.display, fontWeight: '800', color: '#ffffff', letterSpacing: 0.3 },
  brandPill: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md, paddingVertical: 4,
  },
  brandSub: {
    fontSize: theme.fontSize.caption, color: '#ffffff', fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 2,
  },

  // --- Frosted glass card ---
  glassCard: {
    backgroundColor: 'rgba(255,255,255,0.90)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    shadowColor: '#030712', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.35, shadowRadius: 30, elevation: 16,
  },
  cardTitle: { fontSize: theme.fontSize.title, fontWeight: '800', color: theme.color.text },
  cardSubtitle: { fontSize: theme.fontSize.body, color: theme.color.mutedText, marginBottom: theme.spacing.xs },

  // --- Neumorphic field well ---
  fieldWell: {
    backgroundColor: '#eef1f8',
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    // Soft inset-ish feel: a subtle outer shadow so the well reads as a soft extruded surface.
    shadowColor: '#aeb7cc', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 2,
  },

  forgotRow: { alignItems: 'flex-end', marginTop: -theme.spacing.xs, marginBottom: theme.spacing.xs },
  footer: { textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: theme.fontSize.label },
});
