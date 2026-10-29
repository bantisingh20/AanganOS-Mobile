import React, { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';
import { useSafeInsets } from '@/utils/safeInsets';

export interface BottomSheetProps {
  visible: boolean;
  /** Title shown in the sheet header; omit for no header text (the close button still shows). */
  title?: string;
  onClose: () => void;
  /** Scrollable body — a `ScrollView` of form fields OR a `FlatList`/list. Bounded + lifted for you. */
  children: React.ReactNode;
  /** Optional pinned footer (e.g. the submit `AppButton`) — stays visible above the keyboard. */
  footer?: React.ReactNode;
  /** Max fraction of the screen the sheet body may use before the keyboard is subtracted. Default 0.8. */
  maxHeightFraction?: number;
}

/**
 * THE shared bottom-sheet for the whole app — a slide-up `Modal` that is keyboard-safe EVERYWHERE.
 *
 * <p><b>Why this exists.</b> On Android a RN `Modal` renders in its own window that does NOT inherit
 * the activity's `adjustResize`, so a `KeyboardAvoidingView` inside a Modal can't see the keyboard
 * and the focused field gets hidden behind it. Every sheet in the app previously copy-pasted the same
 * fix (track the keyboard height, lift the whole sheet by it, bound an inner scroll). That duplication
 * drifted and some sheets (e.g. the unit search dropdown) were missed, so their search field hid under
 * the keyboard. This component owns the fix ONCE: track keyboard height, lift the sheet by it
 * (`marginBottom`), bound the body to a real pixel height (never a % — unreliable inside an Android
 * Modal) shrunk by the keyboard, and pin the footer below the body. Use this for ALL bottom sheets;
 * do not hand-roll the keyboard dance again (steering: reuse, don't re-solve the same problem).</p>
 *
 * <p>The caller supplies the scrollable body (a `ScrollView` of fields with
 * `keyboardShouldPersistTaps="handled"`, or a `FlatList`) and an optional pinned `footer`.</p>
 */
export function BottomSheet({ visible, title, onClose, children, footer, maxHeightFraction = 0.8 }: BottomSheetProps) {
  const insets = useSafeInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [windowHeight, setWindowHeight] = useState(() => Dimensions.get('window').height);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates?.height ?? 0));
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Track rotation / split-screen so the bounded body height stays correct.
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setWindowHeight(window.height));
    return () => sub.remove();
  }, []);

  // Reset the tracked keyboard height when the sheet closes so a stale lift never persists.
  useEffect(() => { if (!visible) setKeyboardHeight(0); }, [visible]);

  // A concrete pixel cap for the body — a % maxHeight is unreliable inside an Android Modal window
  // (no definite parent height to resolve against), which caused collapse/clipping. Shrink by the
  // keyboard so the body scrolls instead of pushing the pinned footer off-screen.
  const bodyMaxHeight = Math.max(160, windowHeight * maxHeightFraction - keyboardHeight);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} accessibilityLabel="Close" onPress={onClose}>
        {/* Lift the WHOLE sheet above the keyboard so every field AND the pinned footer stay visible. */}
        <View style={[styles.sheetWrap, { marginBottom: keyboardHeight }]}>
          <Pressable
            style={[styles.sheet, { paddingBottom: keyboardHeight > 0 ? theme.spacing.lg : insets.bottom + theme.spacing.lg }]}
            onPress={() => {}}
          >
            <View style={styles.grabber} />
            <View style={styles.header}>
              <Text style={styles.title} numberOfLines={1}>{title ?? ''}</Text>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
                <Ionicons name="close" size={22} color={theme.color.mutedText} />
              </Pressable>
            </View>

            <View style={[styles.body, { maxHeight: bodyMaxHeight }]}>{children}</View>

            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheetWrap: { width: '100%' },
  sheet: {
    backgroundColor: theme.color.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.color.border, marginBottom: theme.spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.xs },
  title: { flex: 1, fontSize: theme.fontSize.title, fontWeight: '800', color: theme.color.text },
  body: { flexShrink: 1 },
  footer: { marginTop: theme.spacing.sm },
});
