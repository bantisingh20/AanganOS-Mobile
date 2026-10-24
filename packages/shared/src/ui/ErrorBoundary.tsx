import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from './theme';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Top-level safety net. If any screen throws during render (e.g. a bad response shape when the
 * backend is down or returns unexpected data), React would otherwise unmount the whole tree and
 * leave a BLANK/BLACK screen. This boundary catches that and shows a friendly recovery screen with
 * a Retry button instead — the user is never stranded on a black screen.
 *
 * It only catches render/lifecycle errors; async request failures are already handled by the API
 * client + friendly form errors. Retry simply re-mounts the children (clears the error state).
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown): void {
    // Dev aid: surface the real error to logcat/console for diagnosis. The user only sees the
    // friendly fallback below. No secrets are rendered.
    // eslint-disable-next-line no-console
    console.error('[UI-CRASH]', error);
  }

  private reset = () => this.setState({ hasError: false });

  override render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <View style={styles.root} accessibilityLabel="Something interrupted the app">
        <View style={styles.badge}>
          <Ionicons name="cloud-offline-outline" size={36} color={theme.color.primary} />
        </View>
        <Text style={styles.title}>Something interrupted the app</Text>
        <Text style={styles.body}>
          We hit a snag loading this screen. This can happen if the connection dropped. Please try
          again.
        </Text>
        <Pressable
          onPress={this.reset}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
        >
          <Ionicons name="refresh" size={18} color={theme.color.primaryText} />
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.color.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  badge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: theme.color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  title: { fontSize: theme.fontSize.title, fontWeight: '800', color: theme.color.text, textAlign: 'center' },
  body: {
    fontSize: theme.fontSize.body,
    color: theme.color.mutedText,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.color.primary,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    marginTop: theme.spacing.sm,
    ...theme.shadow.soft,
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: theme.color.primaryText, fontSize: theme.fontSize.body, fontWeight: '700' },
});
