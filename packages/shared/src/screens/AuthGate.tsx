import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AuthNavigator } from './AuthNavigator';
import { useAuth } from '../auth/AuthContext';
import { theme } from '../ui/theme';
import type { AuthService } from '../auth/authService';
import type { ResourceClients } from '../resources';

export interface AuthGateProps {
  /** App name for headers, e.g. "Resident" / "Guard". */
  appTitle: string;
  auth: AuthService;
  /** Resource clients to enable anonymous self-registration in the auth flow. Omit to disable it. */
  resources?: ResourceClients;
  /** The authenticated app (e.g. the app's home placeholder). Shown only when signed in. */
  children: React.ReactNode;
}

/**
 * The authenticated/unauthenticated switch (session routing). Reads {@link useAuth}:
 *  - `restoring`  → a spinner while we decide if a persisted session can be re-established,
 *  - `unauthenticated` → the {@link AuthNavigator} (login/forgot/reset),
 *  - `authenticated`   → the app's own screens (`children`).
 * A 401 that can't be refreshed, or a logout, clears the store and flips this back to the auth
 * flow automatically (the API client clears the session; logout updates the context). Must be
 * rendered inside an {@link AuthProvider}.
 */
export function AuthGate({ appTitle, auth, resources, children }: AuthGateProps) {
  const { status } = useAuth();

  if (status === 'restoring') {
    return (
      <View
        style={styles.center}
        accessibilityRole="progressbar"
        accessibilityLabel="Restoring your session"
      >
        <ActivityIndicator color={theme.color.primary} />
      </View>
    );
  }

  if (status === 'unauthenticated') {
    return <AuthNavigator appTitle={appTitle} auth={auth} {...(resources ? { resources } : {})} />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.background,
  },
});
