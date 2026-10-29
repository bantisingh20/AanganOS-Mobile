/**
 * Public barrel for the app's shared core (single-project `@` / `@/*` alias).
 *
 * - constants: env-driven AppConfig (no hardcoded URL/secret)
 * - types: the response envelope + domain payload types (mirror the backend contract)
 * - store: session + toast context providers
 * - services: the envelope-aware ApiClient + resource clients + secure storage + push
 * - components: reusable UI primitives + layout chrome
 * - navigation: RootNavigator (session switch) + AuthNavigator + MainTabNavigator + navStack
 * - features: domain screens (residents, visitors, maintenance, complaints, notices, notifications, profile, parcels)
 */
export * from './constants';
export * from './types';
export * from './store';
export * from './services/api';
export * from './services/resources';
export * from './services/storage';
export * from './services/notifications';
export * from './auth';
export * from './hooks';
export * from './utils';
export * from './theme';
export * from './components/ui';
export * from './components/layout';
export * from './navigation';
export * from './features';
export * from './i18n';
