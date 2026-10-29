import React, { type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, ErrorBoundary, ToastProvider } from '@';
import type { AppCore } from '../core';

/**
 * Composes the app-wide provider tree in one place (session, toasts, error boundary, safe-area).
 * Mount order: SafeAreaProvider → ErrorBoundary → ToastProvider → AuthProvider.
 */
export function AppProviders({ core, children }: { core: AppCore; children: ReactNode }) {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ToastProvider>
          <AuthProvider auth={core.auth} tokenStore={core.tokenStore} onAuthenticated={core.onAuthenticated}>
            {children}
          </AuthProvider>
        </ToastProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
