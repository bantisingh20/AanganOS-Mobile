import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
import { useSafeInsets } from '@/utils/safeInsets';

/** The three primary tabs of the authenticated shell. */
export type TabKey = 'home' | 'services' | 'profile';

interface TabDef {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
}

const TABS: readonly TabDef[] = [
  { key: 'home', label: 'Home', icon: 'home-outline', iconActive: 'home' },
  { key: 'services', label: 'Services', icon: 'grid-outline', iconActive: 'grid' },
  { key: 'profile', label: 'Profile', icon: 'person-outline', iconActive: 'person' },
];

export interface BottomTabBarProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

/**
 * Bottom tab navigation (Home · Services · Profile). Pure RN + shared {@link theme} tokens so the
 * active colour tracks a global theme change. Each tab is an accessible ≥44pt button announcing its
 * selected state.
 */
export function BottomTabBar({ active, onChange }: BottomTabBarProps) {
  const insets = useSafeInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(theme.spacing.sm, insets.bottom) }]} accessibilityRole="tablist">
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        const color = isActive ? theme.color.primary : theme.color.mutedText;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: isActive }}
          >
            <View style={[styles.iconWrap, isActive ? styles.iconWrapActive : null]}>
              <Ionicons name={isActive ? tab.iconActive : tab.icon} size={22} color={color} />
            </View>
            <Text style={[styles.label, { color, fontWeight: isActive ? '700' : '500' }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: theme.color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.color.border,
    paddingTop: theme.spacing.xs,
  },
  tab: {
    flex: 1,
    minHeight: theme.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 2,
  },
  iconWrap: {
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
  },
  iconWrapActive: {
    backgroundColor: theme.color.accentSoft,
  },
  label: { fontSize: 11 },
});
