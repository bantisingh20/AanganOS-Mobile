import { en } from './en';
import { hi } from './hi';
import { gu } from './gu';
import { mr } from './mr';

export { SUPPORTED_LANGUAGES, type LanguageCode, type Translation } from './translation';

export const resources = {
  en: { translation: en },
  hi: { translation: hi },
  gu: { translation: gu },
  mr: { translation: mr },
};
