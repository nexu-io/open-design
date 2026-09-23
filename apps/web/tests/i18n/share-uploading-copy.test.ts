import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const directory = resolve(__dirname, '../../src/i18n/locales');
const locales = readdirSync(directory).filter(name => name.endsWith('.ts'));
const key = 'fileViewer.uploadingFile';

describe('S2 uploading label translations', () => {
  it('covers all 19 shipped locales', () => { expect(locales).toHaveLength(19); });
  it.each(locales)('%s distinguishes upload progress from creating a link', async locale => {
    const module = await import(/* @vite-ignore */ resolve(directory, locale));
    const dict = Object.values(module).find(value => value && typeof value === 'object' && key in value);
    expect(dict).toHaveProperty([key], expect.stringMatching(/\S/));
    if (locale === 'en.ts') expect(dict).toHaveProperty([key], 'Uploading');
    if (locale === 'zh-CN.ts') expect(dict).toHaveProperty([key], '上传中');
    if (locale === 'zh-TW.ts') expect(dict).toHaveProperty([key], '上傳中');
  });
});
