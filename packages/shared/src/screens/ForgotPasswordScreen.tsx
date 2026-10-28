import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputKeyPressEventData,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BrandLogo } from '../ui/BrandLogo';
import { PhoneField } from '../ui/PhoneField';
import { FormBanner } from '../ui/FormBanner';
import { theme } from '../ui/theme';
import { useSafeInsets } from '../ui/safeInsets';
import { toFormError, type FormErrorView } from '../api/formError';
import type { AuthService } from '../auth/authService';

export interface ForgotPasswordScreenProps {
  auth: AuthService;
  onBackToLogin: () => void;
  onDone: () => void;
  logo?: ImageSourcePropType;
}

type Step = 'request' | 'verify' | 'reset' | 'done';
type Mode = 'mobile' | 'email';

const NO_ERROR: FormErrorView = { message: '', fieldErrors: {} };
const OTP_LENGTH = 6;
const RESEND_SECONDS = 24;

const RULES = [
  { key: 'ruleLength', test: (p: string) => p.length >= 8 },
  { key: 'ruleNumber', test: (p: string) => /\d/.test(p) },
  { key: 'ruleUppercase', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'ruleSpecial', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function ForgotPasswordScreen({ auth, onBackToLogin, onDone, logo }: ForgotPasswordScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeInsets();

  const [step, setStep] = useState<Step>('request');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<FormErrorView>(NO_ERROR);
  const [busy, setBusy] = useState(false);

  const [mode, setMode] = useState<Mode>('mobile');

  const [digits, setDigits] = useState<string[]>(() => Array(OTP_LENGTH).fill(''));
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const inputs = useRef<Array<TextInput | null>>([]);

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (step !== 'verify' || countdown <= 0) return;
    const id = setInterval(() => setCountdown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(id);
  }, [step, countdown]);

  const back = () => {
    if (step === 'verify') { setStep('request'); setError(NO_ERROR); return; }
    if (step === 'reset') { setStep('verify'); setError(NO_ERROR); return; }
    onBackToLogin();
  };

  const sendOtp = async () => {
    if (busy) return;
    const value = identifier.trim();
    if (!value) {
      setError({ message: '', fieldErrors: { identifier: mode === 'mobile' ? t('forgot.mobilePlaceholder') : t('forgot.emailPlaceholder') } });
      return;
    }
    setBusy(true);
    setError(NO_ERROR);
    try {
      await auth.forgotPassword({ identifier: value });
      goVerify();
    } catch (err) {
      const view = toFormError(err);
      if (Object.keys(view.fieldErrors).length > 0) setError(view);
      else goVerify();
    } finally {
      setBusy(false);
    }
  };

  const goVerify = () => {
    setDigits(Array(OTP_LENGTH).fill(''));
    setCode('');
    setResent(false);
    setCountdown(RESEND_SECONDS);
    setError(NO_ERROR);
    setStep('verify');
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setIdentifier('');
    setError(NO_ERROR);
  };

  const otpCode = digits.join('');

  const setDigitAt = (index: number, value: string) => {
    const clean = value.replace(/\D/g, '');
    if (error.message || error.fieldErrors.code) setError(NO_ERROR);
    if (clean.length > 1) {
      const pasted = clean.slice(0, OTP_LENGTH).split('');
      const next = Array.from({ length: OTP_LENGTH }, (_, i) => pasted[i] ?? '');
      setDigits(next);
      const lastFilled = Math.min(pasted.length, OTP_LENGTH) - 1;
      inputs.current[Math.min(lastFilled + 1, OTP_LENGTH - 1)]?.focus();
      return;
    }
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    if (clean && index < OTP_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const onKeyPress = (index: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
    }
  };

  const verifyOtp = async () => {
    if (busy) return;
    if (otpCode.length !== OTP_LENGTH) {
      setError({ message: '', fieldErrors: { code: ' ' } });
      return;
    }
    setBusy(true);
    setError(NO_ERROR);
    try {
      const res = await auth.verifyOtp({ identifier: identifier.trim(), code: otpCode });
      if (res.valid) {
        setCode(otpCode);
        setNewPassword('');
        setConfirm('');
        setStep('reset');
      } else {
        setError({ message: 'That code is invalid or has expired. Check it or resend a new one.', fieldErrors: { code: ' ' } });
      }
    } catch (err) {
      setError(toFormError(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (resending || countdown > 0) return;
    setResending(true);
    setError(NO_ERROR);
    setResent(false);
    try {
      await auth.forgotPassword({ identifier: identifier.trim() });
      setResent(true);
      setCountdown(RESEND_SECONDS);
    } catch (err) {
      const view = toFormError(err);
      if (Object.keys(view.fieldErrors).length > 0) setError(view);
      else { setResent(true); setCountdown(RESEND_SECONDS); }
    } finally {
      setResending(false);
    }
  };

  const ruleState = RULES.map((r) => ({ key: r.key, ok: r.test(newPassword) }));
  const allRulesOk = ruleState.every((r) => r.ok);

  const resetPassword = async () => {
    if (busy) return;
    if (!allRulesOk) { setError({ message: '', fieldErrors: { newPassword: ' ' } }); return; }
    if (newPassword !== confirm) { setError({ message: '', fieldErrors: { confirm: t('forgot.passwordsDoNotMatch') } }); return; }
    setBusy(true);
    setError(NO_ERROR);
    try {
      await auth.resetPassword({ identifier: identifier.trim(), code: code.trim(), newPassword });
      setStep('done');
    } catch (err) {
      setError(toFormError(err));
    } finally {
      setBusy(false);
    }
  };

  const stepIndex = step === 'request' ? 0 : step === 'verify' ? 1 : 2;

  if (step === 'done') {
    return (
      <View style={styles.root} accessibilityLabel={t('forgot.successTitle')}>
        <SafeAreaView style={styles.flex}>
          <View style={[styles.successBody, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
            <View style={styles.checkOuter}>
              <View style={styles.checkInner}>
                <Ionicons name="checkmark" size={56} color={theme.color.primaryText} />
              </View>
            </View>
            <Text style={styles.title}>{t('forgot.successTitle')}</Text>
            <Text style={styles.subtitle}>{t('forgot.successMessage')}</Text>
            <Pressable
              onPress={onDone}
              accessibilityRole="button"
              accessibilityLabel={t('forgot.backToLogin')}
              testID="reset-success-back"
              style={({ pressed }) => [styles.primaryBtn, pressed ? styles.pressed : null]}
            >
              <Text style={styles.primaryText}>{t('forgot.backToLogin')}</Text>
              <View style={styles.primaryArrow}>
                <Ionicons name="arrow-forward" size={18} color={theme.color.primaryText} />
              </View>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root} accessibilityLabel={t('forgot.title')}>
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.backRow, { paddingTop: insets.top + theme.spacing.xs }]}>
            <Pressable onPress={back} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('forgot.backToLogin')} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color={theme.color.text} />
            </Pressable>
          </View>

          <View style={styles.steps} accessibilityLabel={`Step ${stepIndex + 1} of 3`}>
            {[0, 1, 2].map((i) => (
              <React.Fragment key={i}>
                <View style={[styles.stepDot, i < stepIndex ? styles.stepDotDone : i === stepIndex ? styles.stepDotActive : null]}>
                  {i < stepIndex ? (
                    <Ionicons name="checkmark" size={14} color={theme.color.primaryText} />
                  ) : (
                    <Text style={[styles.stepNum, i === stepIndex ? styles.stepNumActive : null]}>{i + 1}</Text>
                  )}
                </View>
                {i < 2 ? <View style={[styles.stepBar, i < stepIndex ? styles.stepBarDone : null]} /> : null}
              </React.Fragment>
            ))}
          </View>

          <ScrollView
            contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + theme.spacing.lg }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {step === 'request' ? (
              <>
                <BrandLogo {...(logo ? { logo } : {})} size={84} nameSize={theme.fontSize.heading} taglineSize={theme.fontSize.caption} />
                <Text style={styles.title}>{t('forgot.title')}</Text>
                <Text style={styles.subtitle}>{t('forgot.subtitle')}</Text>

                <View style={styles.segment}>
                  <Pressable onPress={() => switchMode('mobile')} accessibilityRole="tab" accessibilityState={{ selected: mode === 'mobile' }} style={[styles.segmentItem, mode === 'mobile' ? styles.segmentItemOn : null]}>
                    <Text style={[styles.segmentText, mode === 'mobile' ? styles.segmentTextOn : null]}>{t('forgot.tabMobile')}</Text>
                  </Pressable>
                  <Pressable onPress={() => switchMode('email')} accessibilityRole="tab" accessibilityState={{ selected: mode === 'email' }} style={[styles.segmentItem, mode === 'email' ? styles.segmentItemOn : null]}>
                    <Text style={[styles.segmentText, mode === 'email' ? styles.segmentTextOn : null]}>{t('forgot.tabEmail')}</Text>
                  </Pressable>
                </View>

                {mode === 'mobile' ? (
                  <View style={styles.field}>
                    <PhoneField
                      label=""
                      value={identifier}
                      onChangeText={setIdentifier}
                      {...(error.fieldErrors.identifier ? { error: error.fieldErrors.identifier } : {})}
                      editable={!busy}
                      placeholder={t('forgot.mobilePlaceholder')}
                      testID="forgot-identifier"
                    />
                  </View>
                ) : (
                  <View style={styles.field}>
                    <View style={[styles.inputRow, error.fieldErrors.identifier ? styles.inputRowError : null]}>
                      <Ionicons name="mail-outline" size={20} color={theme.color.mutedText} style={styles.inputIcon} />
                      <TextInput
                        value={identifier}
                        onChangeText={setIdentifier}
                        placeholder={t('forgot.emailPlaceholder')}
                        placeholderTextColor={theme.color.mutedText}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        textContentType="emailAddress"
                        editable={!busy}
                        returnKeyType="go"
                        onSubmitEditing={sendOtp}
                        accessibilityLabel={t('forgot.emailPlaceholder')}
                        style={styles.inputControl}
                        testID="forgot-identifier"
                      />
                    </View>
                    {error.fieldErrors.identifier ? <Text style={styles.fieldError} accessibilityRole="alert">{error.fieldErrors.identifier}</Text> : null}
                  </View>
                )}

                <FormBanner message={error.message} tone="error" testID="forgot-error" />
                {renderPrimary(t('forgot.sendOtp'), sendOtp, busy, 'forgot-submit')}

                <View style={styles.secureRow}>
                  <Ionicons name="shield-checkmark" size={16} color={theme.color.primary} />
                  <Text style={styles.secureText}>{t('forgot.secureNote')}</Text>
                </View>
              </>
            ) : step === 'verify' ? (
              <>
                <View style={styles.iconBadge}>
                  <Ionicons name="chatbox-ellipses-outline" size={30} color={theme.color.primary} />
                </View>
                <Text style={styles.title}>{t('forgot.verifyTitle')}</Text>
                <Text style={styles.subtitle}>
                  {t('forgot.otpSentTo')}{'\n'}
                  <Text style={styles.subtitleStrong}>{identifier || 'your contact'}</Text>
                </Text>

                <View style={styles.otpRow}>
                  {digits.map((d, i) => (
                    <TextInput
                      key={i}
                      ref={(el) => { inputs.current[i] = el; }}
                      value={d}
                      onChangeText={(v) => setDigitAt(i, v)}
                      onKeyPress={(e) => onKeyPress(i, e)}
                      keyboardType="number-pad"
                      maxLength={OTP_LENGTH}
                      editable={!busy}
                      autoFocus={i === 0}
                      accessibilityLabel={`Digit ${i + 1}`}
                      style={[styles.otpBox, d ? styles.otpBoxFilled : null, error.fieldErrors.code ? styles.otpBoxError : null]}
                      testID={`verify-otp-${i}`}
                    />
                  ))}
                </View>

                <View style={styles.resendRow}>
                  <Text style={styles.resendText}>{t('forgot.didntReceive')} </Text>
                  {countdown > 0 ? (
                    <Text style={styles.resendCountdown}>{t('forgot.resendIn')} {formatCountdown(countdown)}</Text>
                  ) : (
                    <Pressable onPress={resend} disabled={resending} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('forgot.resend')}>
                      <Text style={styles.resendLink}>{resending ? '…' : t('forgot.resend')}</Text>
                    </Pressable>
                  )}
                </View>

                <FormBanner message={error.message} tone="error" testID="verify-error" />
                {resent ? <FormBanner message="A new code has been sent." tone="success" testID="verify-resent" /> : null}
                {renderPrimary(t('forgot.verifyOtp'), verifyOtp, busy, 'verify-submit')}
              </>
            ) : (
              <>
                <View style={styles.iconBadge}>
                  <Ionicons name="lock-closed" size={28} color={theme.color.primary} />
                </View>
                <Text style={styles.title}>{t('forgot.resetTitle')}</Text>
                <Text style={styles.subtitle}>{t('forgot.resetSubtitle')}</Text>

                <View style={styles.field}>
                  <View style={[styles.inputRow, error.fieldErrors.newPassword ? styles.inputRowError : null]}>
                    <Ionicons name="lock-closed-outline" size={20} color={theme.color.mutedText} style={styles.inputIcon} />
                    <TextInput
                      value={newPassword}
                      onChangeText={(v) => { setNewPassword(v); if (error.fieldErrors.newPassword) setError(NO_ERROR); }}
                      placeholder={t('forgot.newPassword')}
                      placeholderTextColor={theme.color.mutedText}
                      secureTextEntry={!showNew}
                      autoCapitalize="none"
                      autoComplete="password-new"
                      textContentType="newPassword"
                      editable={!busy}
                      accessibilityLabel={t('forgot.newPassword')}
                      style={styles.inputControl}
                      testID="reset-new-password"
                    />
                    <Pressable onPress={() => setShowNew((v) => !v)} hitSlop={8} accessibilityRole="button" accessibilityLabel={showNew ? 'Hide password' : 'Show password'} style={styles.inputIconBtn}>
                      <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.color.mutedText} />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.rules}>
                  {ruleState.map((r) => (
                    <View key={r.key} style={styles.ruleRow}>
                      <Ionicons name={r.ok ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={r.ok ? theme.color.primary : theme.color.mutedText} />
                      <Text style={[styles.ruleText, r.ok ? styles.ruleTextOk : null]}>{t(`forgot.${r.key}`)}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.field}>
                  <View style={[styles.inputRow, error.fieldErrors.confirm ? styles.inputRowError : null]}>
                    <Ionicons name="lock-closed-outline" size={20} color={theme.color.mutedText} style={styles.inputIcon} />
                    <TextInput
                      value={confirm}
                      onChangeText={(v) => { setConfirm(v); if (error.fieldErrors.confirm) setError(NO_ERROR); }}
                      placeholder={t('forgot.confirmPassword')}
                      placeholderTextColor={theme.color.mutedText}
                      secureTextEntry={!showConfirm}
                      autoCapitalize="none"
                      autoComplete="password-new"
                      textContentType="newPassword"
                      editable={!busy}
                      returnKeyType="go"
                      onSubmitEditing={resetPassword}
                      accessibilityLabel={t('forgot.confirmPassword')}
                      style={styles.inputControl}
                      testID="reset-confirm-password"
                    />
                    <Pressable onPress={() => setShowConfirm((v) => !v)} hitSlop={8} accessibilityRole="button" accessibilityLabel={showConfirm ? 'Hide password' : 'Show password'} style={styles.inputIconBtn}>
                      <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.color.mutedText} />
                    </Pressable>
                  </View>
                  {error.fieldErrors.confirm && error.fieldErrors.confirm.trim() ? (
                    <Text style={styles.fieldError} accessibilityRole="alert">{error.fieldErrors.confirm}</Text>
                  ) : null}
                </View>

                <FormBanner message={error.message} tone="error" testID="reset-error" />
                {renderPrimary(t('forgot.resetPassword'), resetPassword, busy, 'reset-submit')}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );

  function renderPrimary(label: string, onPress: () => void, loading: boolean, testID: string) {
    return (
      <Pressable
        onPress={onPress}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: loading, busy: loading }}
        testID={testID}
        style={({ pressed }) => [styles.primaryBtn, pressed && !loading ? styles.pressed : null, loading ? styles.primaryBtnDisabled : null]}
      >
        {loading ? (
          <ActivityIndicator color={theme.color.primaryText} />
        ) : (
          <>
            <Text style={styles.primaryText}>{label}</Text>
            <View style={styles.primaryArrow}>
              <Ionicons name="arrow-forward" size={18} color={theme.color.primaryText} />
            </View>
          </>
        )}
      </Pressable>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.surface },
  flex: { flex: 1 },

  backRow: { paddingHorizontal: theme.spacing.md },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  steps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.sm },
  stepDot: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: theme.color.border,
    backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center',
  },
  stepDotActive: { borderColor: theme.color.primary, backgroundColor: theme.color.accentSoft },
  stepDotDone: { borderColor: theme.color.primary, backgroundColor: theme.color.primary },
  stepNum: { fontSize: theme.fontSize.caption, fontWeight: '800', color: theme.color.mutedText },
  stepNumActive: { color: theme.color.primary },
  stepBar: { flex: 1, maxWidth: 48, height: 2, backgroundColor: theme.color.border, marginHorizontal: theme.spacing.xs },
  stepBarDone: { backgroundColor: theme.color.primary },

  body: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md, alignItems: 'center', paddingTop: theme.spacing.sm },
  successBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.xl, gap: theme.spacing.lg },

  iconBadge: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: theme.color.accentSoft, alignItems: 'center', justifyContent: 'center',
  },
  checkOuter: {
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: theme.color.accentSoft, alignItems: 'center', justifyContent: 'center',
  },
  checkInner: {
    width: 116, height: 116, borderRadius: 58,
    backgroundColor: theme.color.primary, alignItems: 'center', justifyContent: 'center',
    ...theme.shadow.soft,
  },

  title: { fontSize: theme.fontSize.title, fontWeight: '800', color: theme.color.text, textAlign: 'center' },
  subtitle: { fontSize: theme.fontSize.label, color: theme.color.mutedText, textAlign: 'center', lineHeight: 20 },
  subtitleStrong: { color: theme.color.text, fontWeight: '700' },

  segment: { flexDirection: 'row', backgroundColor: theme.color.accentSoft, borderRadius: theme.radius.md, padding: 4, alignSelf: 'stretch' },
  segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: theme.spacing.sm, borderRadius: theme.radius.sm },
  segmentItemOn: { backgroundColor: theme.color.surface, ...theme.shadow.soft },
  segmentText: { fontSize: theme.fontSize.label, color: theme.color.mutedText, fontWeight: '700' },
  segmentTextOn: { color: theme.color.primary },

  field: { gap: theme.spacing.xs, alignSelf: 'stretch' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', minHeight: theme.minTouchTarget,
    borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md, backgroundColor: theme.color.surface,
  },
  inputRowError: { borderColor: theme.color.danger },
  inputIcon: { marginRight: theme.spacing.sm },
  inputControl: { flex: 1, fontSize: theme.fontSize.body, color: theme.color.text, paddingVertical: theme.spacing.sm },
  inputIconBtn: { paddingLeft: theme.spacing.sm, alignItems: 'center', justifyContent: 'center' },
  fieldError: { fontSize: theme.fontSize.label, color: theme.color.danger },

  rules: { alignSelf: 'stretch', gap: theme.spacing.xs, paddingLeft: theme.spacing.xs },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  ruleText: { fontSize: theme.fontSize.label, color: theme.color.mutedText },
  ruleTextOk: { color: theme.color.text },

  otpRow: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  otpBox: {
    flex: 1, height: 56, borderRadius: theme.radius.md, borderWidth: 1.5, borderColor: theme.color.border,
    backgroundColor: theme.color.surface, textAlign: 'center',
    fontSize: theme.fontSize.title, fontWeight: '800', color: theme.color.text,
  },
  otpBoxFilled: { borderColor: theme.color.primary },
  otpBoxError: { borderColor: theme.color.danger },

  resendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', marginTop: theme.spacing.xs },
  resendText: { fontSize: theme.fontSize.label, color: theme.color.mutedText },
  resendCountdown: { fontSize: theme.fontSize.label, color: theme.color.mutedText, fontWeight: '700' },
  resendLink: { fontSize: theme.fontSize.label, color: theme.color.primary, fontWeight: '800' },

  secureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  secureText: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, fontWeight: '600' },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch',
    minHeight: 54, borderRadius: theme.radius.lg, backgroundColor: theme.color.primary,
    paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.xs,
  },
  primaryBtnDisabled: { backgroundColor: theme.color.disabled },
  primaryText: { color: theme.color.primaryText, fontSize: theme.fontSize.body, fontWeight: '800' },
  primaryArrow: { position: 'absolute', right: theme.spacing.lg, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85 },
});
