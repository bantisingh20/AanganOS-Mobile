import React, { useState } from 'react';
import { LoginScreen } from './LoginScreen';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';
import { VerifyOtpScreen } from './VerifyOtpScreen';
import { ResetPasswordScreen } from './ResetPasswordScreen';
import { FormBanner } from '../ui/FormBanner';
import type { AuthService } from '../auth/authService';

export interface AuthNavigatorProps {
  /** App name shown in headers, e.g. "Resident" / "Guard". */
  appTitle: string;
  /** The shared auth service (forgot/reset are called directly; login goes through the context). */
  auth: AuthService;
}

/** Which anonymous auth screen is showing. */
type AuthRoute = 'login' | 'forgot' | 'verify' | 'reset';

/**
 * Minimal state-based navigator for the pre-auth flow (login → forgot → verify → reset → login).
 * We deliberately avoid a navigation library here (ponytail: keep it simple) — a single `useState`
 * route switch plus two carried values (identifier, code) is the smallest correct thing. The
 * authenticated app lives behind {@link AuthGate}; this component only renders while unauthenticated.
 *
 * The OTP flow is three steps: (1) enter email/phone + send OTP, (2) enter + verify the OTP,
 * (3) set the new password. NOTE: the backend has no standalone verify-OTP endpoint — the code is
 * validated server-side only at the final reset call. So step 2 validates the code's FORMAT and
 * carries it to step 3, where `resetPassword(identifier, code, newPassword)` does the real check.
 */
export function AuthNavigator({ appTitle, auth }: AuthNavigatorProps) {
  const [route, setRoute] = useState<AuthRoute>('login');
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [loginNotice, setLoginNotice] = useState('');

  const goLogin = (notice = '') => {
    setLoginNotice(notice);
    setResetCode('');
    setRoute('login');
  };

  switch (route) {
    case 'forgot':
      return (
        <ForgotPasswordScreen
          auth={auth}
          onCodeRequested={(identifier) => {
            setResetIdentifier(identifier);
            setRoute('verify');
          }}
          onBackToLogin={() => goLogin()}
        />
      );
    case 'verify':
      return (
        <VerifyOtpScreen
          auth={auth}
          identifier={resetIdentifier}
          onVerified={(code) => {
            setResetCode(code);
            setRoute('reset');
          }}
          onBackToLogin={() => goLogin()}
        />
      );
    case 'reset':
      return (
        <ResetPasswordScreen
          auth={auth}
          initialIdentifier={resetIdentifier}
          verifiedCode={resetCode}
          onResetComplete={(message) => goLogin(message)}
          onBackToLogin={() => goLogin()}
        />
      );
    case 'login':
    default:
      return (
        <LoginScreen
          appTitle={appTitle}
          onForgotPassword={() => {
            setLoginNotice('');
            setRoute('forgot');
          }}
          // The login screen owns its own error banner; the success notice (e.g. post-reset) is
          // rendered above it via a small wrapper so the two don't collide.
          {...(loginNotice
            ? { headerSlot: <FormBanner message={loginNotice} tone="success" testID="login-notice" /> }
            : {})}
        />
      );
  }
}
