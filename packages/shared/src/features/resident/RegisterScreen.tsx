import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { useTranslation } from 'react-i18next';
import { BrandLogo } from '../../ui/BrandLogo';
import { FaceSelfieCapture } from '../../ui/FaceSelfieCapture';
import { PhoneField } from '../../ui/PhoneField';
import { Select, type SelectOption } from '../../ui/Select';
import { DateField } from '../../ui/DateField';
import { FormBanner } from '../../ui/FormBanner';
import { useAsync, useAsyncAction } from '../../ui/hooks';
import { emitToast } from '../../ui/toastBus';
import { theme } from '../../ui/theme';
import { useSafeInsets } from '../../ui/safeInsets';
import { useAuth } from '../../auth/AuthContext';
import type { ResourceClients } from '../../resources';
import type { PublicCommunity, PublicUnit, PublicWing, SelfRegisterResult } from '../../resources/onboardingClient';
import type { LocalFile } from '../../resources/fileClient';

export interface RegisterScreenProps {
  resources: ResourceClients;
  onBack?: () => void;
  logo?: ImageSourcePropType;
  /** 'register' (default): full anonymous sign-up. 'kyc': authenticated draft resident completing
   * verification — starts at the selfie step, skips community/mobile/otp, submits via submitKyc. */
  mode?: 'register' | 'kyc';
  /** In 'kyc' mode, called after a successful KYC submission (e.g. return to Profile). */
  onKycDone?: () => void;
}

type Step = 'community' | 'mobile' | 'otp' | 'selfie' | 'preview' | 'personal' | 'id' | 'done';
const REGISTER_STEPS: Step[] = ['community', 'mobile', 'otp', 'selfie', 'preview', 'personal', 'id'];
const KYC_STEPS: Step[] = ['selfie', 'preview', 'personal', 'id'];
const OTP_LENGTH = 6;
const RESEND_SECONDS = 24;

const RESIDENT_TYPES: { value: string; labelKey: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'owner', labelKey: 'register.owner', icon: 'key-outline' },
  { value: 'tenant', labelKey: 'register.tenant', icon: 'document-text-outline' },
];
const ID_TYPES: { value: string; labelKey: string }[] = [
  { value: 'aadhaar', labelKey: 'register.aadhaar' },
  { value: 'pan', labelKey: 'register.pan' },
  { value: 'passport', labelKey: 'register.passport' },
  { value: 'driving_license', labelKey: 'register.drivingLicense' },
];
const GENDERS: { value: string; labelKey: string }[] = [
  { value: 'male', labelKey: 'register.male' },
  { value: 'female', labelKey: 'register.female' },
  { value: 'other', labelKey: 'register.other' },
];

function warn(message: string): void {
  emitToast({ tone: 'error', title: 'Check the form', message });
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

async function toDataUrl(file: LocalFile): Promise<string> {
  const base64 = await readAsStringAsync(file.uri, { encoding: EncodingType.Base64 });
  const mime = file.mimeType || 'image/jpeg';
  return `data:${mime};base64,${base64}`;
}

async function pickImage(source: 'camera' | 'library'): Promise<LocalFile | null> {
  try {
    const ImagePicker = await import('expo-image-picker');
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      emitToast({ tone: 'error', title: 'Permission needed', message: `Allow ${source === 'camera' ? 'camera' : 'photo'} access.` });
      return null;
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.6, exif: false, cameraType: ImagePicker.CameraType.front })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ['images'] });
    if (result.canceled || !result.assets?.length) return null;
    const a = result.assets[0]!;
    return { uri: a.uri, name: a.fileName ?? 'photo.jpg', mimeType: a.mimeType ?? 'image/jpeg' };
  } catch {
    emitToast({ tone: 'error', title: 'Camera unavailable', message: 'Could not open the camera.' });
    return null;
  }
}

export function RegisterScreen({ resources, onBack, logo, mode = 'register', onKycDone }: RegisterScreenProps) {
  const { adoptSession } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeInsets();
  const isKyc = mode === 'kyc';
  const STEP_ORDER = isKyc ? KYC_STEPS : REGISTER_STEPS;

  const residentTypeOptions: SelectOption[] = useMemo(() => RESIDENT_TYPES.map((r) => ({ value: r.value, label: t(r.labelKey) })), [t]);
  const idTypeOptions: SelectOption[] = useMemo(() => ID_TYPES.map((r) => ({ value: r.value, label: t(r.labelKey) })), [t]);

  const [step, setStep] = useState<Step>(isKyc ? 'selfie' : 'community');

  const [communitySearch, setCommunitySearch] = useState('');
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [communityName, setCommunityName] = useState('');
  const [wingId, setWingId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [residentType, setResidentType] = useState<string | null>('owner');
  const [moveInDate, setMoveInDate] = useState<Date | null>(null);

  const [phone, setPhone] = useState('');
  const [digits, setDigits] = useState<string[]>(() => Array(OTP_LENGTH).fill(''));
  const [verifiedCode, setVerifiedCode] = useState('');
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [otpError, setOtpError] = useState('');
  const inputs = useRef<Array<TextInput | null>>([]);

  const [selfie, setSelfie] = useState<LocalFile | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [dob, setDob] = useState<Date | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [idType, setIdType] = useState<string | null>(null);
  const [idFront, setIdFront] = useState<LocalFile | null>(null);
  const [idBack, setIdBack] = useState<LocalFile | null>(null);

  const [registered, setRegistered] = useState<SelfRegisterResult | null>(null);

  const query = communitySearch.trim();
  const communities = useAsync<PublicCommunity[]>(
    (signal) => (communityId || query.length < 2 ? Promise.resolve([]) : resources.onboarding.searchCommunities(query, { signal })),
    [resources, communitySearch, communityId],
  );
  const wings = useAsync<PublicWing[]>(
    (signal) => (communityId ? resources.onboarding.listWings(communityId, { signal }) : Promise.resolve([])),
    [resources, communityId],
  );
  const units = useAsync<PublicUnit[]>(
    (signal) => (communityId ? resources.onboarding.listUnits(communityId, wingId ?? undefined, undefined, { signal }) : Promise.resolve([])),
    [resources, communityId, wingId],
  );

  const wingOptions: SelectOption[] = useMemo(() => (wings.data ?? []).map((w) => ({ value: w.id, label: w.name })), [wings.data]);
  const unitOptions: SelectOption[] = useMemo(() => (units.data ?? []).map((u) => ({ value: u.id, label: `Unit ${u.unitNumber}` })), [units.data]);
  const hasWings = (wings.data ?? []).length > 0;

  useEffect(() => {
    if (step !== 'otp' || countdown <= 0) return;
    const id = setInterval(() => setCountdown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(id);
  }, [step, countdown]);

  const phoneValid = /^\+\d{6,}$/.test(phone.trim());
  const otpValue = digits.join('');
  const stepIndex = STEP_ORDER.indexOf(step);

  const requestOtp = useAsyncAction(async () => {
    await resources.onboarding.requestOtp(phone.trim());
    setDigits(Array(OTP_LENGTH).fill(''));
    setVerifiedCode('');
    setOtpError('');
    setCountdown(RESEND_SECONDS);
    setStep('otp');
  });

  const verifyOtp = useAsyncAction(async () => {
    const res = await resources.onboarding.verifyOtp(phone.trim(), otpValue);
    if (!res.valid) {
      setOtpError('That code is invalid or has expired.');
      return;
    }
    setVerifiedCode(otpValue);
    setOtpError('');
    setStep('selfie');
  });

  const resendOtp = async () => {
    if (resending || countdown > 0) return;
    setResending(true);
    try {
      await resources.onboarding.requestOtp(phone.trim());
      setCountdown(RESEND_SECONDS);
      emitToast({ tone: 'success', title: 'Sent', message: 'A new code has been sent.' });
    } catch {
      warn('Could not resend the code.');
    } finally {
      setResending(false);
    }
  };

  const submit = useAsyncAction(async () => {
    const selfieBase64 = selfie ? await toDataUrl(selfie) : undefined;
    const frontBase64 = idFront ? await toDataUrl(idFront) : undefined;
    const backBase64 = idBack ? await toDataUrl(idBack) : undefined;
    if (isKyc) {
      await resources.residents.submitKyc({
        ...(dob ? { dateOfBirth: dob.toISOString().slice(0, 10) } : {}),
        ...(gender ? { gender } : {}),
        ...(moveInDate ? { moveInDate: moveInDate.toISOString().slice(0, 10) } : {}),
        ...(idType ? { govtIdType: idType } : {}),
        ...(selfieBase64 ? { selfieBase64 } : {}),
        ...(frontBase64 ? { govtIdFrontBase64: frontBase64 } : {}),
        ...(backBase64 ? { govtIdBackBase64: backBase64 } : {}),
      });
      setStep('done');
      return;
    }
    const result = await resources.onboarding.selfRegister({
      communityId: communityId!,
      unitId: unitId!,
      name: name.trim(),
      phone: phone.trim(),
      ...(email.trim() ? { email: email.trim() } : {}),
      password,
      code: verifiedCode,
      ...(residentType ? { residentType } : {}),
      ...(dob ? { dateOfBirth: dob.toISOString().slice(0, 10) } : {}),
      ...(gender ? { gender } : {}),
      ...(moveInDate ? { moveInDate: moveInDate.toISOString().slice(0, 10) } : {}),
      ...(idType ? { govtIdType: idType } : {}),
      ...(selfieBase64 ? { selfieBase64 } : {}),
      ...(frontBase64 ? { govtIdFrontBase64: frontBase64 } : {}),
      ...(backBase64 ? { govtIdBackBase64: backBase64 } : {}),
    });
    setRegistered(result);
    setStep('done');
  });

  const goHome = useAsyncAction(async () => {
    if (registered) await adoptSession(registered.login, name.trim());
  });

  const setDigitAt = (index: number, value: string) => {
    const clean = value.replace(/\D/g, '');
    if (otpError) setOtpError('');
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

  const back = () => {
    const i = STEP_ORDER.indexOf(step);
    if (i > 0) { setStep(STEP_ORDER[i - 1]!); return; }
    onBack?.();
  };

  const retakeSelfie = () => { setSelfie(null); setStep('selfie'); };

  const goCommunity = () => {
    if (!communityId) return warn(t('register.societyPlaceholder'));
    if (hasWings && !wingId) return warn(t('register.towerPlaceholder'));
    if (!unitId) return warn(t('register.unitPlaceholder'));
    if (!residentType) return warn(t('register.residentType'));
    setStep('mobile');
  };

  const goPersonal = () => {
    if (!isKyc && !name.trim()) return warn(t('register.fullName'));
    if (!isKyc && password.length < 6) return warn(t('register.passwordPlaceholder'));
    setStep('id');
  };

  const onFinalSubmit = () => {
    if (!idType) return warn(t('register.idTypePlaceholder'));
    if (!idFront) return warn(t('register.frontSide'));
    if (!idBack) return warn(t('register.backSide'));
    void submit.run();
  };

  if (step === 'done') {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.flex}>
          <View style={[styles.successBody, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
            <View style={styles.checkOuter}><View style={styles.checkInner}><Ionicons name="checkmark" size={56} color={theme.color.primaryText} /></View></View>
            {isKyc ? (
              <>
                <Text style={styles.title}>{t('register.kycDoneTitle')}</Text>
                <Text style={styles.subtitle}>{t('register.kycDoneSubtitle')}</Text>
                <Pressable onPress={() => onKycDone?.()} accessibilityRole="button" accessibilityLabel={t('register.kycDoneBack')} style={({ pressed }) => [styles.primaryBtn, pressed ? styles.pressed : null]}>
                  <Text style={styles.primaryText}>{t('register.kycDoneBack')}</Text>
                  <View style={styles.primaryArrow}><Ionicons name="arrow-forward" size={18} color={theme.color.primaryText} /></View>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.title}>{t('register.doneTitle')}</Text>
                <Text style={styles.subtitle}>{t('register.doneSubtitle')}</Text>
                <View style={styles.summaryCard}>
                  <SummaryRow label={t('register.name')} value={name.trim()} />
                  <SummaryRow label={t('register.society')} value={communityName} />
                  <SummaryRow label={t('register.unitSummary')} value={unitOptions.find((u) => u.value === unitId)?.label ?? ''} />
                  <SummaryRow label={t('register.memberType')} value={residentTypeOptions.find((r) => r.value === residentType)?.label ?? ''} />
                </View>
                <Pressable onPress={() => void goHome.run()} disabled={goHome.running} accessibilityRole="button" accessibilityLabel="Go to Home" style={({ pressed }) => [styles.primaryBtn, pressed && !goHome.running ? styles.pressed : null]}>
                  {goHome.running ? <ActivityIndicator color={theme.color.primaryText} /> : (
                    <>
                      <Text style={styles.primaryText}>{t('register.goToHome')}</Text>
                      <View style={styles.primaryArrow}><Ionicons name="arrow-forward" size={18} color={theme.color.primaryText} /></View>
                    </>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.backRow, { paddingTop: insets.top + theme.spacing.xs }]}>
            <Pressable onPress={back} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color={theme.color.text} />
            </Pressable>
          </View>

          <View style={styles.steps} accessibilityLabel={`Step ${stepIndex + 1} of ${STEP_ORDER.length}`}>
            {STEP_ORDER.map((_, i) => (
              <React.Fragment key={i}>
                <View style={[styles.stepDot, i < stepIndex ? styles.stepDotDone : i === stepIndex ? styles.stepDotActive : null]}>
                  {i < stepIndex ? <Ionicons name="checkmark" size={12} color={theme.color.primaryText} /> : <Text style={[styles.stepNum, i === stepIndex ? styles.stepNumActive : null]}>{i + 1}</Text>}
                </View>
                {i < STEP_ORDER.length - 1 ? <View style={[styles.stepBar, i < stepIndex ? styles.stepBarDone : null]} /> : null}
              </React.Fragment>
            ))}
          </View>

          <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + theme.spacing.lg }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {step === 'community' ? (
              <>
                <BrandLogo {...(logo ? { logo } : {})} size={72} nameSize={theme.fontSize.title} taglineSize={theme.fontSize.caption} />
                <Text style={styles.title}>{t('register.createTitle')}</Text>
                <Text style={styles.subtitle}>{t('register.createSubtitle')}</Text>

                {communityId ? (
                  <View style={styles.selectedRow}>
                    <View style={styles.flex1}>
                      <Text style={styles.fieldLabel}>{t('register.society')}</Text>
                      <Text style={styles.selectedValue}>{communityName}</Text>
                    </View>
                    <Text style={styles.change} onPress={() => { setCommunityId(null); setCommunityName(''); setWingId(null); setUnitId(null); setCommunitySearch(''); }} accessibilityRole="button">{t('register.change')}</Text>
                  </View>
                ) : (
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>{t('register.selectSociety')}</Text>
                    <View style={styles.inputRow}>
                      <Ionicons name="search" size={18} color={theme.color.mutedText} style={styles.inputIcon} />
                      <TextInput value={communitySearch} onChangeText={setCommunitySearch} placeholder={t('register.societyPlaceholder')} placeholderTextColor={theme.color.mutedText} autoCapitalize="words" style={styles.inputControl} />
                    </View>
                    {communities.loading ? <Text style={styles.note}>{t('register.searching')}</Text> : null}
                    {(communities.data ?? []).map((c) => (
                      <Pressable key={c.id} onPress={() => { setCommunityId(c.id); setCommunityName(c.name); setWingId(null); setUnitId(null); }} style={styles.resultRow}>
                        <Text style={styles.resultText}>{c.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {communityId && hasWings ? (
                  <View style={styles.pickerCard}>
                    <View style={styles.pickerIcon}><Ionicons name="business-outline" size={20} color={theme.color.primary} /></View>
                    <View style={styles.flex1}>
                      <Select label={t('register.towerBlock')} value={wingId} options={wingOptions} onChange={(v) => { setWingId(v); setUnitId(null); }} placeholder={wings.loading ? t('register.searching') : t('register.towerPlaceholder')} />
                    </View>
                  </View>
                ) : null}

                {communityId && (!hasWings || wingId) ? (
                  <View style={styles.field}>
                    <View style={styles.pickerCard}>
                      <View style={styles.pickerIcon}><Ionicons name="home-outline" size={20} color={theme.color.primary} /></View>
                      <View style={styles.flex1}>
                        <Select label={t('register.unit')} value={unitId} options={unitOptions} onChange={setUnitId} placeholder={units.loading ? t('register.searching') : t('register.unitPlaceholder')} />
                      </View>
                    </View>
                    {!units.loading && unitOptions.length === 0 ? (
                      <Text style={styles.emptyNote}>{hasWings ? t('register.noUnitsTower') : t('register.noUnitsSociety')}</Text>
                    ) : null}
                  </View>
                ) : null}

                {communityId ? (
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>{t('register.residentType')}</Text>
                    <View style={styles.typeRow}>
                      {RESIDENT_TYPES.map((rt) => {
                        const on = residentType === rt.value;
                        return (
                          <Pressable key={rt.value} onPress={() => setResidentType(rt.value)} style={[styles.typeCard, on ? styles.typeCardOn : null]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                            <Ionicons name={rt.icon} size={22} color={on ? theme.color.primary : theme.color.mutedText} />
                            <Text style={[styles.typeLabel, on ? styles.typeLabelOn : null]}>{t(rt.labelKey)}</Text>
                            {on ? <View style={styles.typeCheck}><Ionicons name="checkmark" size={11} color={theme.color.primaryText} /></View> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                {communityId ? (
                  <DateField label={t('register.moveInDate')} value={moveInDate} onChange={setMoveInDate} maximumDate={new Date()} placeholder={t('register.selectDate')} />
                ) : null}

                {renderPrimary(t('register.next'), goCommunity, false)}

                {onBack ? (
                  <Pressable onPress={onBack} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('register.logIn')} style={styles.backLinkRow}>
                    <Text style={styles.backLinkText}>{t('register.haveAccount')} <Text style={styles.backLinkStrong}>{t('register.logIn')}</Text></Text>
                  </Pressable>
                ) : null}
              </>
            ) : step === 'mobile' ? (
              <>
                <View style={styles.iconBadge}><Ionicons name="phone-portrait-outline" size={28} color={theme.color.primary} /></View>
                <Text style={styles.title}>{t('register.mobileTitle')}</Text>
                <Text style={styles.subtitle}>{t('register.mobileSubtitle')}</Text>
                <View style={styles.field}><PhoneField label={t('register.mobileNumber')} value={phone} onChangeText={setPhone} editable={!requestOtp.running} placeholder={t('register.mobilePlaceholder')} /></View>
                {renderPrimary(t('register.sendOtp'), () => { if (!phoneValid) return warn(t('register.mobilePlaceholder')); void requestOtp.run(); }, requestOtp.running)}
              </>
            ) : step === 'otp' ? (
              <>
                <View style={styles.iconBadge}><Ionicons name="chatbox-ellipses-outline" size={28} color={theme.color.primary} /></View>
                <Text style={styles.title}>{t('register.otpTitle')}</Text>
                <Text style={styles.subtitle}>{t('register.otpSentTo')}{'\n'}<Text style={styles.subtitleStrong}>{phone}</Text></Text>
                <View style={styles.otpRow}>
                  {digits.map((d, i) => (
                    <TextInput key={i} ref={(el) => { inputs.current[i] = el; }} value={d} onChangeText={(v) => setDigitAt(i, v)} onKeyPress={(e) => onKeyPress(i, e)} keyboardType="number-pad" maxLength={OTP_LENGTH} autoFocus={i === 0} accessibilityLabel={`Digit ${i + 1}`} style={[styles.otpBox, d ? styles.otpBoxFilled : null, otpError ? styles.otpBoxError : null]} />
                  ))}
                </View>
                <View style={styles.resendRow}>
                  <Text style={styles.resendText}>{t('register.didntReceive')} </Text>
                  {countdown > 0 ? <Text style={styles.resendCountdown}>{t('register.resendIn')} {formatCountdown(countdown)}</Text> : (
                    <Pressable onPress={resendOtp} disabled={resending} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('register.resend')}><Text style={styles.resendLink}>{resending ? '…' : t('register.resend')}</Text></Pressable>
                  )}
                </View>
                <FormBanner message={otpError} tone="error" />
                {renderPrimary(t('register.verifyOtp'), () => { if (otpValue.length !== OTP_LENGTH) return setOtpError(t('register.enterCode')); void verifyOtp.run(); }, verifyOtp.running)}
              </>
            ) : step === 'selfie' ? (
              <>
                <Text style={styles.title}>{t('register.selfieTitle')}</Text>
                <Text style={styles.subtitle}>{t('register.selfieSubtitle')}</Text>
                <FaceSelfieCapture onCapture={(f) => { setSelfie(f); setStep('preview'); }} />
                <View style={styles.hintRow}>
                  <SelfieHint icon="sunny-outline" label={t('register.goodLighting')} />
                  <SelfieHint icon="person-outline" label={t('register.lookStraight')} />
                  <SelfieHint icon="glasses-outline" label={t('register.removeMask')} />
                </View>
              </>
            ) : step === 'preview' ? (
              <>
                <View style={styles.iconBadge}><Ionicons name="checkmark-done-outline" size={28} color={theme.color.primary} /></View>
                <Text style={styles.title}>{t('register.previewTitle')}</Text>
                <Text style={styles.subtitle}>{t('register.previewSubtitle')}</Text>
                {selfie ? <Image source={{ uri: selfie.uri }} style={styles.previewImg} /> : null}
                <View style={styles.rules}>
                  {[t('register.faceVisible'), t('register.goodLightingRule'), t('register.noMask'), t('register.notBlurred')].map((r) => (
                    <View key={r} style={styles.ruleRow}><Ionicons name="checkmark-circle" size={18} color={theme.color.primary} /><Text style={styles.ruleTextOk}>{r}</Text></View>
                  ))}
                </View>
                <View style={styles.dualRow}>
                  <Pressable onPress={retakeSelfie} style={({ pressed }) => [styles.outlineBtn, pressed ? styles.pressed : null]} accessibilityRole="button" accessibilityLabel={t('register.retake')}>
                    <Ionicons name="refresh" size={18} color={theme.color.primary} /><Text style={styles.outlineText}>{t('register.retake')}</Text>
                  </Pressable>
                  <Pressable onPress={() => setStep('personal')} style={({ pressed }) => [styles.halfPrimaryBtn, pressed ? styles.pressed : null]} accessibilityRole="button" accessibilityLabel={t('register.usePhoto')}>
                    <Text style={styles.primaryText}>{t('register.usePhoto')}</Text><Ionicons name="arrow-forward" size={18} color={theme.color.primaryText} />
                  </Pressable>
                </View>
              </>
            ) : step === 'personal' ? (
              <>
                <View style={styles.iconBadge}><Ionicons name="person-circle-outline" size={28} color={theme.color.primary} /></View>
                <Text style={styles.title}>{t('register.personalTitle')}</Text>
                <Text style={styles.subtitle}>{t('register.personalSubtitle')}</Text>
                <LabeledInput label={t('register.fullName')} value={name} onChangeText={setName} placeholder={t('register.fullNamePlaceholder')} autoCapitalize="words" />
                <LabeledInput label={t('register.emailOptional')} value={email} onChangeText={setEmail} placeholder={t('register.emailPlaceholder')} keyboardType="email-address" autoCapitalize="none" />
                <DateField label={t('register.dateOfBirth')} value={dob} onChange={setDob} maximumDate={new Date()} placeholder={t('register.selectDate')} />
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>{t('register.gender')}</Text>
                  <View style={styles.pillRow}>
                    {GENDERS.map((g) => (
                      <Pressable key={g.value} onPress={() => setGender(g.value)} style={[styles.pill, gender === g.value ? styles.pillOn : null]} accessibilityRole="button" accessibilityState={{ selected: gender === g.value }}>
                        <Text style={[styles.pillText, gender === g.value ? styles.pillTextOn : null]}>{t(g.labelKey)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                {!isKyc ? (
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>{t('register.password')}</Text>
                    <View style={styles.inputRow}>
                      <Ionicons name="lock-closed-outline" size={20} color={theme.color.mutedText} style={styles.inputIcon} />
                      <TextInput value={password} onChangeText={setPassword} placeholder={t('register.passwordPlaceholder')} placeholderTextColor={theme.color.mutedText} secureTextEntry={!showPassword} autoCapitalize="none" style={styles.inputControl} />
                      <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8} accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide' : 'Show'} style={styles.inputIconBtn}><Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.color.mutedText} /></Pressable>
                    </View>
                  </View>
                ) : null}
                {renderPrimary(t('register.next'), goPersonal, false)}
              </>
            ) : (
              <>
                <View style={styles.iconBadge}><Ionicons name="shield-checkmark-outline" size={28} color={theme.color.primary} /></View>
                <Text style={styles.title}>{t('register.idTitle')}</Text>
                <Text style={styles.subtitle}>{t('register.idSubtitle')}</Text>
                <Select label={t('register.selectIdType')} value={idType} options={idTypeOptions} onChange={setIdType} placeholder={t('register.idTypePlaceholder')} />
                <View style={styles.dualRow}>
                  <IdUpload label={t('register.frontSide')} uploadLabel={t('register.upload')} changeLabel={t('register.change')} file={idFront} onPick={async () => { const f = await pickImage('library'); if (f) setIdFront(f); }} />
                  <IdUpload label={t('register.backSide')} uploadLabel={t('register.upload')} changeLabel={t('register.change')} file={idBack} onPick={async () => { const f = await pickImage('library'); if (f) setIdBack(f); }} />
                </View>
                <View style={styles.secureRow}><Ionicons name="lock-closed" size={16} color={theme.color.mutedText} /><Text style={styles.secureText}>{t('register.secureNote')}</Text></View>
                {renderPrimary(t('register.createAccount'), onFinalSubmit, submit.running)}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );

  function renderPrimary(label: string, onPress: () => void, loading: boolean, icon: keyof typeof Ionicons.glyphMap = 'arrow-forward') {
    return (
      <Pressable onPress={onPress} disabled={loading} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: loading, busy: loading }} style={({ pressed }) => [styles.primaryBtn, pressed && !loading ? styles.pressed : null, loading ? styles.primaryBtnDisabled : null]}>
        {loading ? <ActivityIndicator color={theme.color.primaryText} /> : (
          <>
            <Text style={styles.primaryText}>{label}</Text>
            <View style={styles.primaryArrow}><Ionicons name={icon} size={18} color={theme.color.primaryText} /></View>
          </>
        )}
      </Pressable>
    );
  }
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>
  );
}

function SelfieHint({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.hint}><View style={styles.hintIcon}><Ionicons name={icon} size={18} color={theme.color.primary} /></View><Text style={styles.hintLabel}>{label}</Text></View>
  );
}

function LabeledInput({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput placeholderTextColor={theme.color.mutedText} style={styles.inputControl} {...props} />
      </View>
    </View>
  );
}

function IdUpload({ label, uploadLabel, changeLabel, file, onPick }: { label: string; uploadLabel: string; changeLabel: string; file: LocalFile | null; onPick: () => void }) {
  return (
    <View style={styles.idCol}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable onPress={onPick} style={styles.idBox} accessibilityRole="button" accessibilityLabel={`${uploadLabel} ${label}`}>
        {file ? <Image source={{ uri: file.uri }} style={styles.idImg} /> : <Ionicons name="cloud-upload-outline" size={28} color={theme.color.mutedText} />}
      </Pressable>
      <Text style={styles.idChange}>{file ? changeLabel : uploadLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.surface },
  flex: { flex: 1 },
  flex1: { flex: 1 },

  backRow: { paddingHorizontal: theme.spacing.md },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  steps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm },
  stepDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: theme.color.border, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { borderColor: theme.color.primary, backgroundColor: theme.color.accentSoft },
  stepDotDone: { borderColor: theme.color.primary, backgroundColor: theme.color.primary },
  stepNum: { fontSize: 11, fontWeight: '800', color: theme.color.mutedText },
  stepNumActive: { color: theme.color.primary },
  stepBar: { flex: 1, maxWidth: 24, height: 2, backgroundColor: theme.color.border, marginHorizontal: 3 },
  stepBarDone: { backgroundColor: theme.color.primary },

  body: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md, alignItems: 'center', paddingTop: theme.spacing.xs },
  successBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.xl, gap: theme.spacing.md },

  iconBadge: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.color.accentSoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: theme.fontSize.title, fontWeight: '800', color: theme.color.text, textAlign: 'center' },
  subtitle: { fontSize: theme.fontSize.label, color: theme.color.mutedText, textAlign: 'center', lineHeight: 20 },
  subtitleStrong: { color: theme.color.text, fontWeight: '700' },

  field: { gap: theme.spacing.xs, alignSelf: 'stretch' },
  fieldLabel: { fontSize: theme.fontSize.label, color: theme.color.text, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', minHeight: theme.minTouchTarget, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md, backgroundColor: theme.color.surface },
  inputIcon: { marginRight: theme.spacing.sm },
  inputControl: { flex: 1, fontSize: theme.fontSize.body, color: theme.color.text, paddingVertical: theme.spacing.sm },
  inputIconBtn: { paddingLeft: theme.spacing.sm, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
  resultRow: { paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  resultText: { fontSize: theme.fontSize.body, color: theme.color.text },
  selectedRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md },
  selectedValue: { fontSize: theme.fontSize.body, fontWeight: '700', color: theme.color.text },
  change: { fontSize: theme.fontSize.label, fontWeight: '700', color: theme.color.primary, paddingLeft: theme.spacing.md },

  pickerCard: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm, alignSelf: 'stretch' },
  pickerIcon: { width: 44, height: 44, borderRadius: theme.radius.md, backgroundColor: theme.color.accentSoft, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  emptyNote: { fontSize: theme.fontSize.caption, color: theme.color.warning, lineHeight: 18 },

  typeRow: { flexDirection: 'row', gap: theme.spacing.sm },
  typeCard: { flex: 1, alignItems: 'center', gap: theme.spacing.xs, paddingVertical: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1.5, borderColor: theme.color.border, backgroundColor: theme.color.surface },
  typeCardOn: { borderColor: theme.color.primary, backgroundColor: theme.color.accentSoft },
  typeLabel: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, fontWeight: '600', textAlign: 'center' },
  typeLabelOn: { color: theme.color.primary },
  typeCheck: { position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, backgroundColor: theme.color.primary, alignItems: 'center', justifyContent: 'center' },

  backLinkRow: { alignItems: 'center', paddingVertical: theme.spacing.sm },
  backLinkText: { fontSize: theme.fontSize.label, color: theme.color.mutedText },
  backLinkStrong: { color: theme.color.primary, fontWeight: '800' },

  pillRow: { flexDirection: 'row', gap: theme.spacing.sm },
  pill: { flex: 1, alignItems: 'center', paddingVertical: theme.spacing.sm, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border },
  pillOn: { backgroundColor: theme.color.primary, borderColor: theme.color.primary },
  pillText: { fontSize: theme.fontSize.label, color: theme.color.text, fontWeight: '600' },
  pillTextOn: { color: theme.color.primaryText },

  otpRow: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  otpBox: { flex: 1, height: 56, borderRadius: theme.radius.md, borderWidth: 1.5, borderColor: theme.color.border, backgroundColor: theme.color.surface, textAlign: 'center', fontSize: theme.fontSize.title, fontWeight: '800', color: theme.color.text },
  otpBoxFilled: { borderColor: theme.color.primary },
  otpBoxError: { borderColor: theme.color.danger },
  resendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' },
  resendText: { fontSize: theme.fontSize.label, color: theme.color.mutedText },
  resendCountdown: { fontSize: theme.fontSize.label, color: theme.color.mutedText, fontWeight: '700' },
  resendLink: { fontSize: theme.fontSize.label, color: theme.color.primary, fontWeight: '800' },

  selfieFrame: { width: 220, height: 220, borderRadius: 110, borderWidth: 3, borderColor: theme.color.primary, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: theme.color.accentSoft },
  selfieImg: { width: '100%', height: '100%' },
  previewImg: { width: 220, height: 220, borderRadius: theme.radius.lg, backgroundColor: theme.color.accentSoft },
  hintRow: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', gap: theme.spacing.sm },
  hint: { flex: 1, alignItems: 'center', gap: theme.spacing.xs },
  hintIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.color.accentSoft, alignItems: 'center', justifyContent: 'center' },
  hintLabel: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, textAlign: 'center' },

  rules: { alignSelf: 'stretch', gap: theme.spacing.xs, paddingLeft: theme.spacing.xs },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  ruleTextOk: { fontSize: theme.fontSize.label, color: theme.color.text },

  idCol: { flex: 1, gap: theme.spacing.xs, alignItems: 'center' },
  idBox: { width: '100%', height: 100, borderRadius: theme.radius.md, borderWidth: 1.5, borderColor: theme.color.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: theme.color.background },
  idImg: { width: '100%', height: '100%' },
  idChange: { fontSize: theme.fontSize.caption, color: theme.color.primary, fontWeight: '700' },

  dualRow: { flexDirection: 'row', alignSelf: 'stretch', gap: theme.spacing.md },
  secureRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, alignSelf: 'stretch', backgroundColor: theme.color.background, borderRadius: theme.radius.md, padding: theme.spacing.md },
  secureText: { flex: 1, fontSize: theme.fontSize.caption, color: theme.color.mutedText },

  summaryCard: { alignSelf: 'stretch', gap: theme.spacing.sm, padding: theme.spacing.lg, borderRadius: theme.radius.lg, backgroundColor: theme.color.background },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: theme.fontSize.label, color: theme.color.mutedText },
  summaryValue: { fontSize: theme.fontSize.label, color: theme.color.text, fontWeight: '700' },

  checkOuter: { width: 150, height: 150, borderRadius: 75, backgroundColor: theme.color.accentSoft, alignItems: 'center', justifyContent: 'center' },
  checkInner: { width: 108, height: 108, borderRadius: 54, backgroundColor: theme.color.primary, alignItems: 'center', justifyContent: 'center', ...theme.shadow.soft },

  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', minHeight: 54, borderRadius: theme.radius.lg, backgroundColor: theme.color.primary, paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.sm },
  halfPrimaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, minHeight: 54, borderRadius: theme.radius.lg, backgroundColor: theme.color.primary },
  primaryBtnDisabled: { backgroundColor: theme.color.disabled },
  primaryText: { color: theme.color.primaryText, fontSize: theme.fontSize.body, fontWeight: '800' },
  primaryArrow: { position: 'absolute', right: theme.spacing.lg, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  outlineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, minHeight: 54, borderRadius: theme.radius.lg, borderWidth: 1.5, borderColor: theme.color.primary },
  outlineText: { color: theme.color.primary, fontSize: theme.fontSize.body, fontWeight: '800' },
  pressed: { opacity: 0.85 },
});
