import React, { useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  AuthGate,
  AuthProvider,
  ErrorBoundary,
  HomeNavigator,
  ToastProvider,
  hasAdminRole,
  useAuth,
  useMediaPermissions,
} from '@communityos/shared';
import { createAppCore } from './src/core';
import type { AppCore } from './src/core';

/**
 * Resident/Owner app shell. Builds the shared core once, wraps the app in the shared
 * {@link AuthProvider} (session state), and uses {@link AuthGate} to switch between the shared auth
 * flow (login/forgot/reset) and this app's authenticated home. Device registration (OneSignal)
 * runs via `onAuthenticated` after a successful login.
 */
export default function App() {
  const core = useMemo(() => createAppCore(), []);
  // Ask for camera + photo-library access once on launch (no-op until the dev client is rebuilt
  // with expo-image-picker).
  useMediaPermissions();
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ToastProvider>
          <AuthProvider
            auth={core.auth}
            tokenStore={core.tokenStore}
            onAuthenticated={core.onAuthenticated}
          >
            <StatusBar style="light" />
            <AuthGate appTitle="Resident" auth={core.auth} resources={core.resources}>
              <ResidentHome core={core} />
            </AuthGate>
          </AuthProvider>
        </ToastProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

/**
 * The authenticated resident home (Task 14.1): the shared {@link HomeNavigator} routes to the
 * resident self-view (my household + communication preferences) and — when the signed-in roles
 * look like an admin/management role — the Phase 2 management lists (communities, units, residents,
 * verification queue). The server still enforces real authorization on every call; the role
 * heuristic only decides what to offer in the menu.
 */
function ResidentHome({ core }: { core: AppCore }) {
  const { roles } = useAuth();
  const isAdmin = useMemo(() => hasAdminRole(roles), [roles]);
  return <HomeNavigator resources={core.resources} app="resident" isAdmin={isAdmin} appTitle="Resident" />;
}
