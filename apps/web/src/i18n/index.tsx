'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { de } from './locales/de';
import { en } from './locales/en';
import { esES } from './locales/es-ES';
import { fa } from './locales/fa';
import { ar } from './locales/ar';
import { ja } from './locales/ja';
import { ko } from './locales/ko';
import { ptBR } from './locales/pt-BR';
import { ru } from './locales/ru';
import { zhCN } from './locales/zh-CN';
import { zhTW } from './locales/zh-TW';
import { pl } from './locales/pl';
import { hu } from './locales/hu';
import { LOCALES, type Dict, type Locale } from './types';

export { LOCALES, LOCALE_LABEL } from './types';
export type { Locale } from './types';

type DictKey = keyof Dict;

const DICTS: Record<Locale, Dict> = {
  'en': en,
  'de': de,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'pt-BR': ptBR,
  'es-ES': esES,
  'ru': ru,
  'fa': fa,
  'ar': ar,
  'ja': ja,
  'ko': ko,
  'pl': pl,
  'hu': hu,
};

const LS_KEY = 'open-design:locale';

// First-run default is English. We honor an explicit user pick saved to
// localStorage but never auto-detect from `navigator.language`, so the
// initial experience is consistent and predictable.
function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = window.localStorage.getItem(LS_KEY);
    if (stored && (LOCALES as string[]).includes(stored)) {
      return stored as Locale;
    }
  } catch {
    /* ignore */
  }
  return 'en';
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

interface ProviderProps {
  initial?: Locale;
  children: ReactNode;
}

const RTL_LOCALES: Locale[] = ['ar', 'fa'];

export function I18nProvider({ initial, children }: ProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => initial ?? detectInitialLocale());

  // Keep <html lang="…" dir="…"> in sync so screen readers and CSS hooks
  // pick the right language token and direction without each component
  // having to set it itself.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const dir = RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
      document.documentElement.setAttribute('lang', locale);
      document.documentElement.setAttribute('dir', dir);
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LS_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: DictKey, vars?: Record<string, string | number>): string => {
      const dict = DICTS[locale] ?? en;
      const raw = dict[key] ?? en[key] ?? key;
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (_, name: string) => {
        const v = vars[name];
        return v == null ? `{${name}}` : String(v);
      });
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Fall back to a stand-alone English translator when no provider is
    // mounted (e.g. an isolated test). This keeps the API safe to call
    // without requiring every callsite to wrap in a provider.
    return {
      locale: 'en',
      setLocale: () => { },
      t: (key, vars) => {
        const raw = en[key] ?? key;
        if (!vars) return raw;
        return raw.replace(/\{(\w+)\}/g, (_, n: string) => {
          const v = vars[n];
          return v == null ? `{${n}}` : String(v);
        });
      },
    };
  }
  return ctx;
}

// Convenience for components that only need the translator function.
export function useT(): I18nContextValue['t'] {
  return useI18n().t;
}
