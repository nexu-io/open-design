/**
 * 报错卡兜底文案不许再指向「查看详情」。
 *
 * 这句话原来写的是「原始报错收在下面的『查看详情』里」。那个折叠已经从卡上
 * 下线(用户 2026-08-27),文案再这么写就是**把用户支去看一个不存在的东西**。
 *
 * 这条测试扫**全部 19 个 locale**,不是只测 en —— 文案回归最常见的形状就是
 * 「英文改了、其他 18 个语言还留着旧指路」。
 */
import { describe, expect, it } from 'vitest';

import { LOCALES, type Dict, type Locale } from '../../src/i18n/types';

async function loadDict(locale: Locale): Promise<Dict> {
  const module = await import(`../../src/i18n/locales/${locale}.ts`);
  const dict = Object.values(module).find((value): value is Dict => {
    return Boolean(value) && typeof value === 'object';
  });
  if (!dict) throw new Error(`No dictionary export found for locale ${locale}`);
  return dict;
}

/**
 * 每个语言自己那句「查看详情」。取自这条文案被改之前的原文,所以命中就说明
 * 那半句还在。不是机翻,是逐字对照旧值。
 */
const DETAILS_POINTER: Record<Locale, string[]> = {
  ar: ['عرض التفاصيل'],
  de: ['Details anzeigen'],
  en: ['View details', 'view details'],
  'es-ES': ['Ver detalles'],
  fa: ['مشاهده جزئیات'],
  fr: ['Voir les détails'],
  hu: ['Részletek megtekintése'],
  id: ['Lihat detail'],
  it: ['Vedi dettagli'],
  ja: ['詳細を表示'],
  ko: ['자세히 보기'],
  pl: ['Zobacz szczegóły'],
  'pt-BR': ['Ver detalhes'],
  ru: ['Подробности', 'подробности'],
  th: ['ดูรายละเอียด'],
  tr: ['Ayrıntıları gör'],
  uk: ['Докладніше', 'докладніше'],
  'zh-CN': ['查看详情', '详情'],
  'zh-TW': ['查看詳情', '詳情'],
};

/**
 * 正向对照:文案还得**留着**「把日志发给我们」那半句 —— 〔导出日志〕按钮还在,
 * 这句话现在指的是一个真实存在的按钮。少了这条,把整句删空也会绿。
 */
const LOGS_WORD: Record<Locale, string> = {
  ar: 'السجلات',
  de: 'Logs',
  en: 'logs',
  'es-ES': 'registros',
  fa: 'گزارش‌ها',
  fr: 'journaux',
  hu: 'naplókat',
  id: 'log',
  it: 'log',
  ja: 'ログ',
  ko: '로그',
  pl: 'logi',
  'pt-BR': 'logs',
  ru: 'логи',
  th: 'บันทึก',
  tr: 'günlükleri',
  uk: 'журнали',
  'zh-CN': '日志',
  'zh-TW': '日誌',
};

/**
 * 结构判据,和语言无关:被引号括起来的那一段,从来只有一个用途 —— 报出一个
 * 控件的名字。控件没了,引号里那位也就没得可引。
 */
const QUOTE_CHARS = ['“', '”', '«', '»', '「', '」', '„', '‟', '‘', '’', '〈', '〉'];

describe('chat.runError.fallbackMessage 不再指向已下线的「查看详情」', () => {
  it('19 个 locale 都注册在案(别让新语言从这条扫描里漏出去)', () => {
    expect(LOCALES).toHaveLength(19);
    for (const locale of LOCALES) {
      expect(DETAILS_POINTER[locale], `missing pointer list for ${locale}`).toBeTruthy();
      expect(LOGS_WORD[locale], `missing logs word for ${locale}`).toBeTruthy();
    }
  });

  for (const locale of LOCALES) {
    it(`${locale}:不提「查看详情」,但仍然说得清「把日志发给我们」`, async () => {
      const dict = await loadDict(locale);
      const message = dict['chat.runError.fallbackMessage'];

      expect(typeof message).toBe('string');
      expect(message.trim().length).toBeGreaterThan(0);

      for (const pointer of DETAILS_POINTER[locale]) {
        expect(message, `${locale} still points at the removed control`).not.toContain(pointer);
      }
      for (const quote of QUOTE_CHARS) {
        expect(message, `${locale} still quotes a control name`).not.toContain(quote);
      }

      // 正向对照。
      expect(message, `${locale} lost the "send us the logs" half`).toContain(LOGS_WORD[locale]);
    });
  }
});
