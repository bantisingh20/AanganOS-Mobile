import React, { useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import {
  AuthGate,
  HomeNavigator,
  expoSecureStorage,
  hasAdminRole,
  initI18n,
  restoreLanguage,
  useAuth,
  useMediaPermissions,
} from '@';
import { AppProviders } from './providers/AppProviders';
import { createAppCore } from './core';
import type { AppCore } from './core';

const welcomeStorage = expoSecureStorage(SecureStore);
const appLogo = require('../../assets/icon.png');
initI18n();
void restoreLanguage(welcomeStorage);

/**
 * App shell. Builds the shared core once, wraps the app in {@link AppProviders} (session + toasts +
 * error boundary), and uses {@link AuthGate} to switch between the auth flow and the authenticated
 * home. Device registration (OneSignal) runs via `onAuthenticated` after a successful login.
 */
export default function App() {
  const core = useMemo(() => createAppCore(), []);
  useMediaPermissions();
  return (
    <AppProviders core={core}>
      <StatusBar style="light" />
      <AuthGate appTitle="Resident" auth={core.auth} resources={core.resources} storage={welcomeStorage} welcomeLogo={appLogo}>
        <ResidentHome core={core} />
      </AuthGate>
    </AppProviders>
  );
}

function ResidentHome({ core }: { core: AppCore }) {
  const { roles } = useAuth();
  const isAdmin = useMemo(() => hasAdminRole(roles), [roles]);
  return <HomeNavigator resources={core.resources} app="resident" isAdmin={isAdmin} appTitle="Resident" logo={appLogo} />;
}
