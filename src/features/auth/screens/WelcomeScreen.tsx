import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { useSafeInsets } from '@/utils/safeInsets';
import { theme } from '@/theme';
import type { SecureStorage } from '@/services/storage/tokenStore';

export interface WelcomeScreenProps {
  logo?: ImageSourcePropType;
  hero?: ImageSourcePropType;
  storage?: SecureStorage;
  onLogin: () => void;
  onRegister?: () => void;
}

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; key: string; tint: string }[] = [
  { icon: 'shield-checkmark', key: 'features.secureSociety', tint: theme.color.primary },
  { icon: 'people', key: 'features.connectedResidents', tint: theme.color.info },
  { icon: 'settings-sharp', key: 'features.easyManagement', tint: '#8250df' },
  { icon: 'leaf', key: 'features.greenerLiving', tint: '#16a34a' },
];

const DEFAULT_HERO_URI =
  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=900&q=70';

export function WelcomeScreen({ logo, hero, storage, onLogin, onRegister }: WelcomeScreenProps) {
  const insets = useSafeInsets();
  const { t } = useTranslation();
  return (
    <View style={styles.root}>
      <Image source={hero ?? { uri: DEFAULT_HERO_URI }} style={styles.heroFill} resizeMode="cover" accessibilityLabel="Community" />

      <LinearGradient
        pointerEvents="none"
        colors={['#ffffff', '#ffffff', 'rgba(255,255,255,0)']}
        locations={[0, 0.45, 1]}
        style={styles.topFade}
      />

      <View style={[styles.top, { paddingTop: insets.top + theme.spacing.sm }]}>
        {storage ? (
          <View style={styles.langRow}>
            <LanguageSwitcher storage={storage} />
          </View>
        ) : null}

        <BrandLogo {...(logo ? { logo } : {})} size={110} />

        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.key} style={styles.feature}>
              <View style={[styles.featureIcon, { backgroundColor: `${f.tint}14` }]}>
                <Ionicons name={f.icon} size={22} color={f.tint} />
              </View>
              <Text style={styles.featureLabel}>{t(f.key)}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.card, { paddingBottom: Math.max(insets.bottom, theme.spacing.md) + theme.spacing.sm }]}>
        <Pressable
          onPress={onLogin}
          accessibilityRole="button"
          accessibilityLabel={t('common.login')}
          accessibilityHint="Go to the sign-in screen"
          style={({ pressed }) => [styles.loginBtn, pressed ? styles.pressed : null]}
        >
          <Text style={styles.loginText}>{t('common.login')}</Text>
          <View style={styles.loginArrow}>
            <Ionicons name="arrow-forward" size={18} color={theme.color.primaryText} />
          </View>
        </Pressable>

        {onRegister ? (
          <Pressable
            onPress={onRegister}
            accessibilityRole="button"
            accessibilityLabel={t('common.createAccount')}
            accessibilityHint="Go to registration"
            style={({ pressed }) => [styles.registerBtn, pressed ? styles.pressed : null]}
          >
            <Text style={styles.registerText}>{t('common.createAccount')}</Text>
          </Pressable>
        ) : null}

        <Text style={styles.footer}>{t('common.manageConnectLiveBetter')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.surface },

  heroFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: '100%' },
  topFade: { position: 'absolute', left: 0, right: 0, top: 0, height: '58%' },
  top: { backgroundColor: 'transparent', paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg, gap: theme.spacing.lg },
  langRow: { alignSelf: 'flex-end' },
  features: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch' },
  feature: { flex: 1, alignItems: 'center', gap: theme.spacing.xs },
  featureIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  featureLabel: { fontSize: theme.fontSize.caption, color: theme.color.text, fontWeight: '600', textAlign: 'center', lineHeight: 15 },

  card: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, gap: theme.spacing.sm,
    backgroundColor: theme.color.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    ...theme.shadow.card,
  },
  loginBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    minHeight: 54, borderRadius: theme.radius.lg, backgroundColor: theme.color.primary,
    paddingHorizontal: theme.spacing.lg,
  },
  loginText: { color: theme.color.primaryText, fontSize: theme.fontSize.body, fontWeight: '800' },
  loginArrow: { position: 'absolute', right: theme.spacing.lg, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  registerBtn: {
    alignItems: 'center', justifyContent: 'center',
    minHeight: 54, borderRadius: theme.radius.lg, borderWidth: 1.5, borderColor: theme.color.primary,
    backgroundColor: theme.color.surface,
  },
  registerText: { color: theme.color.primary, fontSize: theme.fontSize.body, fontWeight: '800' },
  pressed: { opacity: 0.85 },
  footer: { textAlign: 'center', fontSize: theme.fontSize.caption, color: theme.color.mutedText, marginTop: theme.spacing.xs },
});
