import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const directory = resolve(__dirname, '../../src/i18n/locales');
const locales = readdirSync(directory).filter(name => name.endsWith('.ts'));
const key = 'fileViewer.workspaceVisibilityTitle';
describe('S1-T/S4-T scope title translations', () => {
  it('covers all 19 locales', () => { expect(locales).toHaveLength(19); });
  it.each(locales)('%s supplies a scope title', async locale => {
    const module = await import(/* @vite-ignore */ resolve(directory, locale));
    const dict = Object.values(module).find(value => value && typeof value === 'object' && key in value);
    expect(dict).toHaveProperty([key], expect.stringMatching(/\S/));
    if (locale === 'en.ts') expect(dict).toHaveProperty([key], 'Visibility in workspace');
    if (locale === 'zh-CN.ts') expect(dict).toHaveProperty([key], '工作区内可见范围');
    if (locale === 'zh-TW.ts') expect(dict).toHaveProperty([key], '工作區內可見範圍');
  });
});
