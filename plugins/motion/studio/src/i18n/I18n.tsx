import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import zhCN from './zh-CN.json';

export type Locale = 'zh-CN' | 'en';
export type MessageValues = Record<string, string | number>;
export type Translate = (message: string, values?: MessageValues) => string;
export const LOCALE_STORAGE_KEY = 'motion.studio.locale';
const messages: Record<string, string> = zhCN;
const englishByChinese = new Map(Object.entries(messages).map(([en, zh]) => [zh, en]));
const singular: Record<string, string> = {
  '{count} renders': '{count} render', '{count} layers': '{count} layer',
  '{count} effects': '{count} effect', '{count} elements': '{count} element',
  '{count} errors': '{count} error', '{count} warnings': '{count} warning',
  ' and its {count} slides': ' and its {count} slide', '{count} lint findings': '{count} lint finding',
  '{description} ({count} effects)': '{description} ({count} effect)', '{count} files': '{count} file', '{count} tools': '{count} tool', '{count} elements selected': '{count} element selected' };

/** Recover a built-in label's source for stable instrumentation identifiers. */
export const sourceMessage = (message: string) => Object.hasOwn(messages, message) ? message : englishByChinese.get(message) ?? message;

export function translate(locale: Locale, message: string, values: MessageValues = {}): string {
  message = sourceMessage(message);
  let text = locale === 'zh-CN' ? messages[message] ?? message : message;
  if (locale === 'en' && typeof values.count === 'number' && new Intl.PluralRules(locale).select(values.count) === 'one') text = singular[message] ?? text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] === undefined ? match : String(values[key]));
}

export function readLocale(): Locale {
  try { const saved = localStorage.getItem(LOCALE_STORAGE_KEY); if (saved === 'en' || saved === 'zh-CN') return saved; } catch { /* Private browsing can deny storage. */ }
  return 'zh-CN';
}

function languageTools(locale: Locale) {
  return {
    locale,
    t: (message: string, values?: MessageValues) => translate(locale, message, values),
    formatDate: (date: number | Date, options?: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, options).format(date),
    formatNumber: (number: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale, options).format(number),
  };
}

// Standalone upstream components keep English unless a product host provides a locale.
const I18nContext = createContext({ ...languageTools('en'), setLocale: (_locale: Locale) => {} });
export const useI18n = () => useContext(I18nContext);

export function I18nProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, updateLocale] = useState<Locale>(() => initialLocale ?? readLocale());
  const setLocale = useCallback((next: Locale) => {
    updateLocale(next);
    try { localStorage.setItem(LOCALE_STORAGE_KEY, next); } catch { /* Switching still works without persistence. */ }
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    const onStorage = (event: StorageEvent) => {
      if (event.key === LOCALE_STORAGE_KEY) updateLocale(event.newValue === 'en' ? 'en' : 'zh-CN');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [locale]);
  const value = useMemo(() => ({ ...languageTools(locale), setLocale }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
