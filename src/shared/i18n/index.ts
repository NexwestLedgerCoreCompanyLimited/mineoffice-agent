import en from './en.json';
import th from './th.json';

export type TranslationKey = keyof typeof en;

/**
 * To add a language: copy en.json to <code>.json, translate the values, then add it here.
 * Anything left untranslated falls back to English, so a partial translation is fine.
 */
export const LANGUAGES: { code: string; name: string; strings: Partial<Record<TranslationKey, string>> }[] = [
  { code: 'en', name: 'English', strings: en },
  { code: 'th', name: 'ไทย', strings: th }
];

let current = 'en';

export function setLanguage(code: string) {
  if (LANGUAGES.some(language => language.code === code)) current = code;
}

export function getLanguage(): string {
  return current;
}

export function format(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const strings = LANGUAGES.find(language => language.code === current)?.strings;
  return format(strings?.[key] ?? en[key] ?? key, params);
}

/** For keys built from data, such as a role id. Unknown ids come back unchanged. */
export function tDynamic(key: string, params?: Record<string, string | number>): string {
  return key in en ? t(key as TranslationKey, params) : key;
}

/** Only what the public status page needs, in every language, for its script to choose from. */
export function viewerDictionaries(): Record<string, Record<string, string>> {
  const wanted = (key: string) => /^(viewer|event|task|role\.\w+\.name)/.test(key);
  const result: Record<string, Record<string, string>> = {};
  for (const language of LANGUAGES) {
    const merged: Record<string, string> = { ...en, ...language.strings };
    result[language.code] = Object.fromEntries(Object.entries(merged).filter(([key]) => wanted(key)));
  }
  return result;
}
