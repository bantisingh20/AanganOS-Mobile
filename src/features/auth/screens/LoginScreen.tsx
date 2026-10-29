import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { PhoneField } from '@/components/ui/PhoneField';
import { FormBanner } from '@/components/ui/FormBanner';
import { LinkButton } from '@/components/ui/LinkButton';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { theme } from '@/theme';
import { useSafeInsets } from '@/utils/safeInsets';
import { toFormError, type FormErrorView } from '@/utils/formError';
import { ApiRequestError } from '@/services/api/errors';
import { useAuth } from '@/store/AuthContext';
import type { SecureStorage } from '@/services/storage/tokenStore';

export interface LoginScreenProps {
  appTitle: string;
  onForgotPassword: () => void;
  onRegister?: () => void;
  logo?: ImageSourcePropType;
  storage?: SecureStorage;
  headerSlot?: React.ReactNode;
}

const NO_ERROR: FormErrorView = { message: '', fieldErrors: {} };

declare const __DEV__: boolean;

const DEV_DEFAULT_IDENTIFIER = __DEV__ ? '+917984263575' : '';
const DEV_DEFAULT_PASSWORD = __DEV__ ? '123' : '';

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; key: string; tint: string }[] = [
  { icon: 'shield-checkmark', key: 'features.secureSociety', tint: theme.color.primary },
  { icon: 'people', key: 'features.connectedResidents', tint: theme.color.info },
  { icon: 'settings-sharp', key: 'features.easyManagement', tint: '#8250df' },
  { icon: 'leaf', key: 'features.greenerLiving', tint: '#16a34a' },
];


export function LoginScreen({ appTitle, onForgotPassword, onRegister, logo, storage, headerSlot }: LoginScreenProps) {
  const { login } = useAuth();
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState(DEV_DEFAULT_IDENTIFIER);
  const [password, setPassword] = useState(DEV_DEFAULT_PASSWORD);
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
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
      <View style={styles.backdrop} pointerEvents="none">
        <View style={[styles.blob, styles.blobTop]} />
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
              { paddingTop: theme.spacing.xxl + insets.top, paddingBottom: theme.spacing.lg + insets.bottom },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {storage ? (
              <View style={styles.langRow}>
                <LanguageSwitcher storage={storage} />
              </View>
            ) : null}

            <BrandLogo {...(logo ? { logo } : {})} size={96} />

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('common.welcomeBack')} 👋</Text>
              <Text style={styles.cardSubtitle}>{t('common.signInSubtitle')}</Text>

              {headerSlot}
              <FormBanner message={error.message} tone="error" testID="login-error" />

              <PhoneField
                label={t('common.mobileNumber')}
                value={identifier}
                onChangeText={setIdentifier}
                {...(error.fieldErrors.identifier ? { error: error.fieldErrors.identifier } : {})}
                editable={!submitting}
                placeholder={t('common.mobileNumber')}
                testID="login-identifier"
              />
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('common.password')}</Text>
                <View style={[styles.inputRow, error.fieldErrors.password ? styles.inputRowError : null]}>
                  <Ionicons name="lock-closed-outline" size={20} color={theme.color.mutedText} style={styles.inputIcon} />
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder={t('common.password')}
                    placeholderTextColor={theme.color.mutedText}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="password"
                    textContentType="password"
                    editable={!submitting}
                    returnKeyType="go"
                    onSubmitEditing={submit}
                    accessibilityLabel={t('common.password')}
                    style={styles.inputControl}
                    testID="login-password"
                  />
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    style={styles.inputIconBtn}
                  >
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.color.mutedText} />
                  </Pressable>
                </View>
                {error.fieldErrors.password ? (
                  <Text style={styles.fieldError} accessibilityLiveRegion="polite" accessibilityRole="alert">
                    {error.fieldErrors.password}
                  </Text>
                ) : null}
              </View>

              <View style={styles.row}>
                <Pressable
                  style={styles.remember}
                  onPress={() => setRemember((v) => !v)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: remember }}
                  accessibilityLabel="Remember me"
                  hitSlop={6}
                >
                  <View style={[styles.checkbox, remember ? styles.checkboxOn : null]}>
                    {remember ? <Ionicons name="checkmark" size={13} color={theme.color.primaryText} /> : null}
                  </View>
                  <Text style={styles.rememberText}>{t('common.rememberMe')}</Text>
                </Pressable>
                <LinkButton
                  title={t('common.forgotPassword')}
                  onPress={onForgotPassword}
                  disabled={submitting}
                  accessibilityHint="Opens the password reset screen"
                  testID="login-forgot"
                />
              </View>

              <Pressable
                onPress={submit}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel={t('common.login')}
                accessibilityHint="Signs in with your phone and password"
                accessibilityState={{ disabled: submitting, busy: submitting }}
                testID="login-submit"
                style={({ pressed }) => [styles.loginBtn, pressed && !submitting ? styles.pressed : null, submitting ? styles.loginBtnDisabled : null]}
              >
                {submitting ? (
                  <ActivityIndicator color={theme.color.primaryText} />
                ) : (
                  <>
                    <Text style={styles.loginText}>{t('common.login')}</Text>
                    <View style={styles.loginArrow}>
                      <Ionicons name="arrow-forward" size={18} color={theme.color.primaryText} />
                    </View>
                  </>
                )}
              </Pressable>

              {onRegister ? (
                <View style={styles.registerRow}>
                  <Text style={styles.registerText}>{t('common.newHere')}</Text>
                  <LinkButton
                    title={t('common.createAccountShort')}
                    onPress={onRegister}
                    disabled={submitting}
                    accessibilityHint="Opens the registration screen"
                    testID="login-register"
                  />
                </View>
              ) : null}
            </View>

            <View style={styles.features}>
              {FEATURES.map((f) => (
                <View key={f.key} style={styles.feature}>
                  <View style={[styles.featureIcon, { backgroundColor: `${f.tint}1f` }]}>
                    <Ionicons name={f.icon} size={20} color={f.tint} />
                  </View>
                  <Text style={styles.featureLabel}>{t(f.key)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  flex: { flex: 1 },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.color.background, overflow: 'hidden' },
  blob: { position: 'absolute', borderRadius: 9999 },
  blobTop: { width: 380, height: 380, top: -160, right: -120, backgroundColor: 'rgba(5,184,114,0.10)' },
  blobBottom: { width: 420, height: 420, bottom: -200, left: -140, backgroundColor: 'rgba(14,165,233,0.08)' },

  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: theme.spacing.lg, gap: theme.spacing.lg },

  langRow: { alignItems: 'flex-end' },

  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    ...theme.shadow.card,
  },
  cardTitle: { fontSize: theme.fontSize.heading, fontWeight: '800', color: theme.color.text },
  cardSubtitle: { fontSize: theme.fontSize.label, color: theme.color.mutedText, marginBottom: theme.spacing.xs },

  field: { gap: theme.spacing.xs },
  fieldLabel: { fontSize: theme.fontSize.label, color: theme.color.text, fontWeight: '600' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    minHeight: theme.minTouchTarget,
    borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
  },
  inputRowError: { borderColor: theme.color.danger },
  inputIcon: { marginRight: theme.spacing.sm },
  inputControl: { flex: 1, fontSize: theme.fontSize.body, color: theme.color.text, paddingVertical: theme.spacing.sm },
  inputIconBtn: { paddingLeft: theme.spacing.sm, alignItems: 'center', justifyContent: 'center' },
  fieldError: { fontSize: theme.fontSize.label, color: theme.color.danger },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -theme.spacing.xs },
  remember: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  checkbox: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: theme.color.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: theme.color.primary, borderColor: theme.color.primary },
  rememberText: { fontSize: theme.fontSize.label, color: theme.color.text, fontWeight: '600' },

  loginBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    minHeight: 54, borderRadius: theme.radius.lg, backgroundColor: theme.color.primary,
    paddingHorizontal: theme.spacing.lg,
  },
  loginBtnDisabled: { backgroundColor: theme.color.disabled },
  loginText: { color: theme.color.primaryText, fontSize: theme.fontSize.body, fontWeight: '800' },
  loginArrow: { position: 'absolute', right: theme.spacing.lg, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85 },

  registerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  registerText: { color: theme.color.mutedText, fontSize: theme.fontSize.label },

  features: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: theme.spacing.xs },
  feature: { flex: 1, alignItems: 'center', gap: theme.spacing.xs },
  featureIcon: { width: 44, height: 44, borderRadius: theme.radius.pill, alignItems: 'center', justifyContent: 'center' },
  featureLabel: { fontSize: theme.fontSize.caption, color: theme.color.text, fontWeight: '600', textAlign: 'center', lineHeight: 15 },
});
