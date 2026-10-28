import React from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from './theme';

export interface BrandLogoProps {
  logo?: ImageSourcePropType;
  size?: number;
  nameSize?: number;
  showTagline?: boolean;
  taglineSize?: number;
}

export function BrandLogo({
  logo,
  size = 96,
  nameSize = theme.fontSize.display,
  showTagline = true,
  taglineSize = theme.fontSize.label,
}: BrandLogoProps) {
  const { t } = useTranslation();
  const fallbackSize = Math.round(size * 0.84);
  return (
    <View style={styles.brand}>
      {logo ? (
        <Image source={logo} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel="AanganOS" />
      ) : (
        <View style={[styles.logoFallback, { width: fallbackSize, height: fallbackSize }]}>
          <Ionicons name="home" size={Math.round(fallbackSize * 0.42)} color={theme.color.primary} />
        </View>
      )}
      <Text style={[styles.name, { fontSize: nameSize }]}>
        <Text style={styles.nameDark}>Aangan</Text>
        <Text style={styles.nameGreen}>OS</Text>
      </Text>
      {showTagline ? <Text style={[styles.tagline, { fontSize: taglineSize }]}>{t('common.tagline')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', gap: theme.spacing.xs },
  logoFallback: {
    borderRadius: theme.radius.xl,
    backgroundColor: theme.color.accentSoft, alignItems: 'center', justifyContent: 'center',
  },
  name: { fontWeight: '800', letterSpacing: -0.5 },
  nameDark: { color: theme.color.hero },
  nameGreen: { color: theme.color.primary },
  tagline: { color: theme.color.mutedText, fontWeight: '600' },
});
