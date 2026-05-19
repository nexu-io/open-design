import type { Locale } from './types';

export function zhCN(locale: Locale, english: string, simplifiedChinese: string): string {
  return locale === 'zh-CN' ? simplifiedChinese : english;
}
