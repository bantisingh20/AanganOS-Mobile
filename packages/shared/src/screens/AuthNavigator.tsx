import React, { useEffect, useState } from 'react';
import { BackHandler, type ImageSourcePropType } from 'react-native';
import { WelcomeScreen } from './WelcomeScreen';
import { LoginScreen } from './LoginScreen';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';
import { RegisterScreen } from '../features/resident/RegisterScreen';
import { FormBanner } from '../ui/FormBanner';
import type { AuthService } from '../auth/authService';
import type { SecureStorage } from '../auth/tokenStore';
import type { ResourceClients } from '../resources';

const WELCOME_SEEN_KEY = 'aanganos.welcomeSeen';

export interface AuthNavigatorProps {
  appTitle: string;
  auth: AuthService;
  resources?: ResourceClients;
  storage?: SecureStorage;
  welcomeLogo?: ImageSourcePropType;
  welcomeHero?: ImageSourcePropType;
}

type AuthRoute = 'welcome' | 'login' | 'forgot' | 'register';

export function AuthNavigator({ appTitle, auth, resources, storage, welcomeLogo, welcomeHero }: AuthNavigatorProps) {
  const [route, setRoute] = useState<AuthRoute>(storage ? 'welcome' : 'login');
  const [loginNotice, setLoginNotice] = useState('');
  const [registerEnabled, setRegisterEnabled] = useState(true);

  useEffect(() => {
    if (!storage) return;
    let active = true;
    storage.getItem(WELCOME_SEEN_KEY)
      .then((seen) => { if (active && seen) setRoute('login'); })
      .catch(() => { if (active) setRoute('login'); });
    return () => { active = false; };
  }, [storage]);

  const leaveWelcome = (to: 'login' | 'register') => {
    storage?.setItem(WELCOME_SEEN_KEY, '1').catch(() => undefined);
    setRoute(to);
  };

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
    setRoute('login');
  };

  useEffect(() => {
    if (route === 'login' || route === 'welcome') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goLogin();
      return true;
    });
    return () => sub.remove();
  }, [route]);

  switch (route) {
    case 'welcome':
      return (
        <WelcomeScreen
          {...(welcomeLogo ? { logo: welcomeLogo } : {})}
          {...(welcomeHero ? { hero: welcomeHero } : {})}
          {...(storage ? { storage } : {})}
          onLogin={() => leaveWelcome('login')}
          {...(registerEnabled && resources ? { onRegister: () => leaveWelcome('register') } : {})}
        />
      );
    case 'register':
      return resources ? (
        <RegisterScreen resources={resources} onBack={() => goLogin()} {...(welcomeLogo ? { logo: welcomeLogo } : {})} />
      ) : (
        <LoginScreen appTitle={appTitle} onForgotPassword={() => setRoute('forgot')} {...(welcomeLogo ? { logo: welcomeLogo } : {})} />
      );
    case 'forgot':
      return (
        <ForgotPasswordScreen
          auth={auth}
          {...(welcomeLogo ? { logo: welcomeLogo } : {})}
          onBackToLogin={() => goLogin()}
          onDone={() => goLogin()}
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
          {...(welcomeLogo ? { logo: welcomeLogo } : {})}
          {...(storage ? { storage } : {})}
          {...(registerEnabled && resources ? { onRegister: () => { setLoginNotice(''); setRoute('register'); } } : {})}
          {...(loginNotice
            ? { headerSlot: <FormBanner message={loginNotice} tone="success" testID="login-notice" /> }
            : {})}
        />
      );
  }
}
