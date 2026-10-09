/**
 * OPEND-2849 · 产品文档《Open Design 报错文案｜精简版》S26a / S31b 定稿落地。
 *
 * - S26a 导出失败:标题「导出失败」+ 正文「本次导出未完成，请重新尝试。」,
 *   与 S26c(评论保存失败)同形:Title + Description 两个键。
 * - S31b 检查更新失败:标题「检查更新失败」不带句号,正文逐字。
 *
 * 判据扫全部 19 个 locale:标题行不得以句末标点结尾、新键不得在非英文语言里
 * 留英文占位、被拆掉的旧键 `fileViewer.exportFailed` 不得残留。
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

function lookup(dict: Dict, key: string): string | undefined {
  return (dict as unknown as Record<string, string | undefined>)[key];
}

// Sentence-final punctuation across the 19 locales (Latin, CJK, Arabic/Persian,
// Thai has none). A title line must not end with any of these.
const SENTENCE_END = /[.。．!！?？؟]\s*$/u;

describe('OPEND-2849 product copy (zh-CN is the source of truth)', () => {
  it('S26a export failure uses the product title and body verbatim', async () => {
    const zh = await loadDict('zh-CN');
    expect(lookup(zh, 'fileViewer.exportFailedTitle')).toBe('导出失败');
    expect(lookup(zh, 'fileViewer.exportFailedDescription')).toBe('本次导出未完成，请重新尝试。');
  });

  it('S31b update-check failure has an unpunctuated title line and the verbatim body', async () => {
    const zh = await loadDict('zh-CN');
    const [title, body, ...rest] = (lookup(zh, 'updater.dialogCheckFailed') ?? '').split('\n');
    expect(title).toBe('检查更新失败');
    expect(body).toBe('暂时无法获取版本信息，请检查网络连接后重试。');
    expect(rest).toEqual([]);
  });
});

describe.each(LOCALES)('OPEND-2849 locale %s', (locale) => {
  it('defines the S26a title/body pair and drops the single-line export key', async () => {
    const dict = await loadDict(locale);
    const title = lookup(dict, 'fileViewer.exportFailedTitle');
    const body = lookup(dict, 'fileViewer.exportFailedDescription');
    expect(title?.trim()).toBeTruthy();
    expect(body?.trim()).toBeTruthy();
    expect(title).not.toMatch(SENTENCE_END);
    expect(lookup(dict, 'fileViewer.exportFailed')).toBeUndefined();
    if (locale !== 'en') {
      const en = await loadDict('en');
      expect(title).not.toBe(lookup(en, 'fileViewer.exportFailedTitle'));
      expect(body).not.toBe(lookup(en, 'fileViewer.exportFailedDescription'));
    }
  });

  it('keeps the update-check failure as title line + body line without a title full stop', async () => {
    const dict = await loadDict(locale);
    const lines = (lookup(dict, 'updater.dialogCheckFailed') ?? '').split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]?.trim()).toBeTruthy();
    expect(lines[0]).not.toMatch(SENTENCE_END);
    expect(lines[1]?.trim()).toBeTruthy();
  });
});
