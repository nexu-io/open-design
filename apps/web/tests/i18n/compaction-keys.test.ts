import { describe, expect, it } from 'vitest';
import { LOCALES, type Dict, type Locale } from '../../src/i18n/types';

const COMPACTION_KEYS = [
  'chat.compactBoundary',
  'chat.compactDone',
  'chat.compactFailed',
  'chat.compactProgress',
  'chat.compactSlash',
  'chat.compactUnavailableReason',
] as const;

async function loadDict(locale: Locale): Promise<Dict> {
  const module = await import(`../../src/i18n/locales/${locale}.ts`);
  const dict = Object.values(module).find((value): value is Dict => {
    return Boolean(value) && typeof value === 'object';
  });
  if (!dict) {
    throw new Error(`No dictionary export found for locale ${locale}`);
  }
  return dict;
}

describe('compaction i18n keys (#5991)', () => {
  it('is declared with non-empty text in every locale', async () => {
    for (const locale of LOCALES) {
      const dict = await loadDict(locale);
      for (const key of COMPACTION_KEYS) {
        const value = dict[key];
        expect(typeof value, `${locale}.${key}`).toBe('string');
        expect((value as string).trim().length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps zh-CN and zh-TW localized instead of falling back to English', async () => {
    const zhCN = await loadDict('zh-CN');
    const zhTW = await loadDict('zh-TW');
    expect(zhCN['chat.compactBoundary']).toBe('以上对话已压缩为摘要');
    expect(zhCN['chat.compactDone']).toBe('对话已压缩');
    expect(zhCN['chat.compactUnavailableReason']).toBe('压缩仅支持 API 或 Antigravity 会话');
    expect(zhTW['chat.compactBoundary']).toBe('以上對話已壓縮為摘要');
    expect(zhTW['chat.compactUnavailableReason']).toBe('壓縮僅支援 API 或 Antigravity 會話');
  });

  it('uses the canonical English copy in en', async () => {
    const en = await loadDict('en');
    expect(en['chat.compactBoundary']).toBe('Earlier conversation compacted into a summary');
    expect(en['chat.compactSlash']).toBe('Compact earlier messages into a checkpoint summary');
  });
});