import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources, SUPPORTED_LANGUAGES, type LanguageCode } from './resources';
import type { SecureStorage } from '@/services/storage/tokenStore';

export { SUPPORTED_LANGUAGES, type LanguageCode } from './resources';

const LANGUAGE_KEY = 'aanganos.language';

let initialized = false;

/** Initialize i18next once (idempotent). Safe to call at module load. */
export function initI18n(): typeof i18n {
  if (initialized) return i18n;
  initialized = true;
  void i18n.use(initReactI18next).init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return i18n;
}

function isSupported(code: string | null | undefined): code is LanguageCode {
  return !!code && SUPPORTED_LANGUAGES.some((l) => l.code === code);
}

/** Load the persisted language (if any) and apply it. Call once at app start after {@link initI18n}. */
export async function restoreLanguage(storage: SecureStorage): Promise<void> {
  initI18n();
  try {
    const saved = await storage.getItem(LANGUAGE_KEY);
    if (isSupported(saved)) {
      await i18n.changeLanguage(saved);
    }
  } catch {
    /* fall back to default language */
  }
}

/** Change the active language and persist it. */
export async function setLanguage(storage: SecureStorage, code: LanguageCode): Promise<void> {
  initI18n();
  await i18n.changeLanguage(code);
  try {
    await storage.setItem(LANGUAGE_KEY, code);
  } catch {
    /* non-fatal: language still applied in-memory for this session */
  }
}

export { i18n };
