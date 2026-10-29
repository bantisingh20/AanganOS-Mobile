import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from './BottomSheet';
import { theme } from '@/theme';
import { SUPPORTED_LANGUAGES, setLanguage, type LanguageCode } from '@/i18n';
import type { SecureStorage } from '@/services/storage/tokenStore';

export interface LanguageSwitcherProps {
  /** Persistence so the choice survives relaunch. */
  storage: SecureStorage;
  /** 'light' (default) for dark text on a light surface; 'onDark' for white text over a colored header. */
  tone?: 'light' | 'onDark';
}

export function LanguageSwitcher({ storage, tone = 'light' }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = (i18n.language as LanguageCode) || 'en';
  const active = SUPPORTED_LANGUAGES.find((l) => l.code === current) ?? SUPPORTED_LANGUAGES[0]!;
  const onDark = tone === 'onDark';

  const choose = (code: LanguageCode) => {
    void setLanguage(storage, code);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Language: ${active.label}`}
        style={({ pressed }) => [
          styles.pill,
          onDark ? styles.pillOnDark : styles.pillLight,
          pressed ? styles.pressed : null,
        ]}
      >
        <Ionicons name="language" size={14} color={onDark ? theme.color.primaryText : theme.color.primary} />
        <Text style={[styles.pillText, { color: onDark ? theme.color.primaryText : theme.color.text }]}>
          {active.native}
        </Text>
        <Ionicons name="chevron-down" size={14} color={onDark ? theme.color.primaryText : theme.color.mutedText} />
      </Pressable>

      <BottomSheet visible={open} title={t('language.title')} onClose={() => setOpen(false)}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.list}>
            {SUPPORTED_LANGUAGES.map((l) => {
              const selected = l.code === current;
              return (
                <Pressable
                  key={l.code}
                  onPress={() => choose(l.code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [styles.row, selected ? styles.rowSelected : null, pressed ? styles.pressed : null]}
                >
                  <View style={styles.rowText}>
                    <Text style={styles.rowNative}>{l.native}</Text>
                    <Text style={styles.rowLabel}>{l.label}</Text>
                  </View>
                  {selected ? <Ionicons name="checkmark-circle" size={22} color={theme.color.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.pill, borderWidth: 1 },
  pillLight: { backgroundColor: theme.color.surface, borderColor: theme.color.border },
  pillOnDark: { backgroundColor: theme.color.onHeroSoft, borderColor: 'rgba(255,255,255,0.3)' },
  pillText: { fontSize: theme.fontSize.label, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  list: { gap: theme.spacing.sm, paddingBottom: theme.spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.md,
    borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md,
  },
  rowSelected: { borderColor: theme.color.primary, backgroundColor: theme.color.accentSoft },
  rowText: { gap: 2 },
  rowNative: { fontSize: theme.fontSize.body, fontWeight: '700', color: theme.color.text },
  rowLabel: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
});
