import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
import { useSafeInsets } from '@/utils/safeInsets';
import { subscribeToasts, type ToastMessage, type ToastTone } from '@/utils/toastBus';

const DEFAULT_DURATION = 3500;

const TONE: Record<ToastTone, { bg: string; icon: keyof typeof Ionicons.glyphMap; accent: string }> = {
  success: { bg: '#0f3d2e', icon: 'checkmark-circle', accent: '#34d399' },
  error: { bg: '#44181b', icon: 'alert-circle', accent: '#f87171' },
  info: { bg: theme.color.hero, icon: 'information-circle', accent: theme.color.info },
};

/**
 * In-app toast host — a modern replacement for RN's native `Alert`. Mount once near the app root
 * (inside the SafeAreaProvider). It subscribes to the module {@link subscribeToasts} bus, so the
 * existing `showSuccessAlert` / `showErrorAlert` helpers (and `useAsyncAction`) surface a styled,
 * auto-dismissing toast instead of a native dialog — no per-call-site change needed. Toasts stack
 * below the notch and can be tapped to dismiss early.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const insets = useSafeInsets();

  useEffect(() => {
    return subscribeToasts((toast) => {
      setToasts((prev) => {
        // Dedupe: if an identical toast (same tone + message) is already visible, refresh it in
        // place (swap its id so its timer/animation restarts) instead of stacking a duplicate — so
        // mashing the same button shows ONE toast, not N.
        const duplicate = prev.find((t) => t.tone === toast.tone && t.message === toast.message && t.title === toast.title);
        if (duplicate) {
          return prev.map((t) => (t === duplicate ? toast : t));
        }
        return [...prev, toast].slice(-3); // keep at most 3 distinct stacked
      });
    });
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <View style={styles.root}>
      {children}
      <View pointerEvents="box-none" style={[styles.host, { top: insets.top + theme.spacing.sm }]}>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </View>
    </View>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastMessage; onDismiss: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  const tone = TONE[toast.tone];

  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8, tension: 80 }).start();
    const timer = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(onDismiss);
    }, toast.durationMs ?? DEFAULT_DURATION);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] });

  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY }] }}>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="alert"
        accessibilityLabel={`${toast.title ? toast.title + '. ' : ''}${toast.message}`}
        accessibilityHint="Tap to dismiss"
        style={[styles.card, { backgroundColor: tone.bg }]}
      >
        <View style={[styles.iconWrap, { backgroundColor: `${tone.accent}2e` }]}>
          <Ionicons name={tone.icon} size={20} color={tone.accent} />
        </View>
        <View style={styles.textCol}>
          {toast.title ? <Text style={styles.title}>{toast.title}</Text> : null}
          <Text style={styles.message}>{toast.message}</Text>
        </View>
        <Ionicons name="close" size={18} color="rgba(255,255,255,0.6)" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  host: {
    position: 'absolute',
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    gap: theme.spacing.sm,
    zIndex: 1000,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    ...theme.shadow.hero,
  },
  iconWrap: { width: 36, height: 36, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  textCol: { flex: 1 },
  title: { color: theme.color.primaryText, fontSize: theme.fontSize.label, fontWeight: '800', marginBottom: 1 },
  message: { color: 'rgba(255,255,255,0.92)', fontSize: theme.fontSize.label, lineHeight: 19 },
});
