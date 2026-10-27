import React, { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import { LoginScreen } from './LoginScreen';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';
import { VerifyOtpScreen } from './VerifyOtpScreen';
import { ResetPasswordScreen } from './ResetPasswordScreen';
import { RegisterScreen } from '../features/resident/RegisterScreen';
import { FormBanner } from '../ui/FormBanner';
import type { AuthService } from '../auth/authService';
import type { ResourceClients } from '../resources';

export interface AuthNavigatorProps {
  /** App name shown in headers, e.g. "Resident" / "Guard". */
  appTitle: string;
  /** The shared auth service (forgot/reset are called directly; login goes through the context). */
  auth: AuthService;
  /** Resource clients for anonymous onboarding (self-register). Omit to disable registration. */
  resources?: ResourceClients;
}

/** Which anonymous auth screen is showing. */
type AuthRoute = 'login' | 'forgot' | 'verify' | 'reset' | 'register';

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
export function AuthNavigator({ appTitle, auth, resources }: AuthNavigatorProps) {
  const [route, setRoute] = useState<AuthRoute>('login');
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [loginNotice, setLoginNotice] = useState('');
  const [registerEnabled, setRegisterEnabled] = useState(false);

  useEffect(() => {
    if (!resources) return;
    let active = true;
    resources.onboarding
      .getConfig()
      .then((cfg) => {
        if (active) setRegisterEnabled(cfg.selfRegistrationEnabled);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [resources]);

  const goLogin = (notice = '') => {
    setLoginNotice(notice);
    setResetCode('');
    setRoute('login');
  };

  useEffect(() => {
    if (route === 'login') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goLogin();
      return true;
    });
    return () => sub.remove();
  }, [route]);

  switch (route) {
    case 'register':
      return resources ? (
        <RegisterScreen resources={resources} onBack={() => goLogin()} />
      ) : (
        <LoginScreen appTitle={appTitle} onForgotPassword={() => setRoute('forgot')} />
      );
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
          {...(registerEnabled && resources ? { onRegister: () => { setLoginNotice(''); setRoute('register'); } } : {})}
          {...(loginNotice
            ? { headerSlot: <FormBanner message={loginNotice} tone="success" testID="login-notice" /> }
            : {})}
        />
      );
  }
}
