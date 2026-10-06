/**
 * OPEND-2841 / OPEND-2843 · 非英文界面的首页仍显示英文残留：工作目录按钮与弹层
 * （`homeWorkingDir.*`）、类型 Chip 的名称 / 说明 / 下一步文案（`homeHero.chip.*`）
 * 以及账户菜单里的升级 / 用量 / 主题 / 语言 / 添加账户 / 退出登录（六个 `entry.*`）。
 *
 * 本规格只覆盖首页可见子集，只改值不改键。三类判定：
 *   1. 值不得与 en 逐字相同（专有名 HyperFrames / WebGL 与该语言里本就同形的词除外）；
 *   2. 非拉丁文字的语言，值里必须出现该语言自己的文字（拦住 ko 里那种
 *      "Select working directory" 式的换词英文）；
 *   3. 工单点名的 ko / ja 两个样本钉死具体译文。
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

const WORKING_DIR_KEYS = [
  'homeWorkingDir.trigger',
  'homeWorkingDir.triggerShort',
  'homeWorkingDir.pick',
  'homeWorkingDir.replace',
  'homeWorkingDir.recent',
  'homeWorkingDir.clear',
  'homeWorkingDir.hint',
  'homeWorkingDir.missing',
  'homeWorkingDir.applyFailed',
] as const;

const CHIP_IDS = [
  'prototype', 'webClone', 'wireframe', 'mobile', 'deck', 'document', 'image', 'video', 'audio',
] as const;
const CHIP_KEYS = [
  ...CHIP_IDS.map((id) => `homeHero.chip.${id}` as const),
  ...CHIP_IDS.map((id) => `homeHero.chip.${id}Desc` as const),
  ...CHIP_IDS.map((id) => `homeHero.chip.${id}Next` as const),
  'homeHero.chip.hyperframesDesc',
  'homeHero.chip.liveArtifactDesc',
  'homeHero.chip.createBrandKitDesc',
] as const;

const ACCOUNT_MENU_KEYS = [
  'entry.creditsUpgrade',
  'entry.creditsUsage',
  'entry.accountToggleTheme',
  'entry.accountSwitchLanguage',
  'entry.accountAddAccount',
  'entry.accountSignOut',
] as const;

const TARGET_KEYS = [...WORKING_DIR_KEYS, ...CHIP_KEYS, ...ACCOUNT_MENU_KEYS] as const;
type TargetKey = (typeof TARGET_KEYS)[number];

/** 该语言里与英文同形的词，以该 locale 已有译法为准（如 de `settings.amrUpgrade` = "Upgrade"）。 */
const SAME_WORD: Partial<Record<Locale, readonly TargetKey[]>> = {
  de: ['homeHero.chip.video', 'homeHero.chip.audio', 'homeHero.chip.wireframe', 'entry.creditsUpgrade'],
  'es-ES': ['homeHero.chip.audio', 'homeHero.chip.wireframe'],
  fr: ['homeHero.chip.prototype', 'homeHero.chip.image', 'homeHero.chip.audio', 'homeHero.chip.document'],
  id: ['homeHero.chip.video', 'homeHero.chip.audio', 'homeHero.chip.wireframe'],
  it: ['homeHero.chip.video', 'homeHero.chip.audio', 'homeHero.chip.wireframe'],
  'pt-BR': ['homeHero.chip.wireframe'],
  tr: ['homeHero.chip.video'],
};

/** 非拉丁文字：值里至少要出现一个该文字的字符。 */
const NATIVE_SCRIPT: Partial<Record<Locale, RegExp>> = {
  ar: /\p{Script=Arabic}/u,
  fa: /\p{Script=Arabic}/u,
  ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
  ko: /\p{Script=Hangul}/u,
  ru: /\p{Script=Cyrillic}/u,
  uk: /\p{Script=Cyrillic}/u,
  th: /\p{Script=Thai}/u,
  'zh-CN': /\p{Script=Han}/u,
  'zh-TW': /\p{Script=Han}/u,
};

const NON_ENGLISH = LOCALES.filter((locale) => locale !== 'en');

describe('OPEND-2841 / OPEND-2843 · home-visible strings are translated', () => {
  it.each(NON_ENGLISH)('%s: no target key still carries the English source value', async (locale) => {
    const en = await loadDict('en');
    const dict = await loadDict(locale);
    const allowed = new Set<TargetKey>(SAME_WORD[locale] ?? []);
    const leftovers = TARGET_KEYS.filter((key) => !allowed.has(key) && dict[key] === en[key]);
    expect(leftovers).toEqual([]);
  }, 30_000);

  it.each(NON_ENGLISH)('%s: no target key carries a stale English string copied across locales', async (locale) => {
    const dict = await loadDict(locale);
    // The pre-fix value that every locale file shared; it never equalled en.ts
    // ("Working directory"), so an en-equality check alone let it through.
    expect(dict['homeWorkingDir.trigger']).not.toBe('Select working directory');
  }, 30_000);

  it.each(Object.keys(NATIVE_SCRIPT) as Locale[])('%s: every target value is written in the locale\'s own script', async (locale) => {
    const dict = await loadDict(locale);
    const script = NATIVE_SCRIPT[locale]!;
    const allowed = new Set<TargetKey>(SAME_WORD[locale] ?? []);
    const latinOnly = TARGET_KEYS.filter((key) => !allowed.has(key) && !script.test(dict[key]));
    expect(latinOnly).toEqual([]);
  }, 30_000);

  it('ko / ja show the strings the tickets name instead of "Document" and "Working directory"', async () => {
    const ko = await loadDict('ko');
    const ja = await loadDict('ja');
    expect(ko['homeHero.chip.document']).toBe('문서');
    expect(ja['homeHero.chip.document']).toBe('ドキュメント');
    expect(ko['homeWorkingDir.triggerShort']).toBe('작업 디렉터리');
    expect(ja['homeWorkingDir.triggerShort']).toBe('作業ディレクトリ');
    expect(ko['homeWorkingDir.pick']).toBe('폴더 선택');
    expect(ja['homeWorkingDir.pick']).toBe('フォルダを選択');
  }, 30_000);
});
