import { describe, expect, it } from 'vitest';

import {
  WHATS_NEW_LAST_SEEN_STORAGE_KEY,
  localizedWhatsNewContent,
  markWhatsNewSeen,
  readLastSeenWhatsNewVersion,
  resolveWhatsNewPrompt,
} from '../../src/lib/whats-new';
import type { WhatsNewContent } from '../../src/types';

const CONTENT: WhatsNewContent = {
  title: 'Design system sync',
  body: 'Import, edit and sync design systems.',
  linkUrl: 'https://example.com/blog',
  locales: {
    'zh-CN': { title: '设计系统同步', body: '导入、编辑并同步设计系统。' },
  },
};

function info(overrides: Partial<{ version: string; channel: string; content: WhatsNewContent | null }> = {}) {
  return { version: '0.13.0', channel: 'stable', content: CONTENT, ...overrides };
}

describe('resolveWhatsNewPrompt', () => {
  it('records a silent baseline on a fresh profile instead of prompting', () => {
    expect(resolveWhatsNewPrompt(info(), null)).toBe('baseline');
  });

  it('shows once after a version change and stays quiet on the same version', () => {
    expect(resolveWhatsNewPrompt(info(), '0.12.1')).toBe('show');
    expect(resolveWhatsNewPrompt(info(), '0.13.0')).toBe('none');
  });

  it('shows the generic fallback on release channels even without feed content', () => {
    expect(resolveWhatsNewPrompt(info({ content: null }), '0.12.1')).toBe('show');
  });

  it('never spends the prompt on the daemon version fallback 0.0.0', () => {
    expect(resolveWhatsNewPrompt(info({ version: '0.0.0' }), '0.12.1')).toBe('none');
  });

  it('re-baselines development builds silently unless the feed carries highlights', () => {
    expect(resolveWhatsNewPrompt(info({ channel: 'development', content: null }), '0.12.1')).toBe('baseline');
    expect(resolveWhatsNewPrompt(info({ channel: 'development' }), '0.12.1')).toBe('show');
  });
});

describe('last-seen storage helpers', () => {
  it('round-trips through the storage key and swallows storage failures', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    expect(readLastSeenWhatsNewVersion(storage)).toBeNull();
    markWhatsNewSeen('0.13.0', storage);
    expect(store.get(WHATS_NEW_LAST_SEEN_STORAGE_KEY)).toBe('0.13.0');
    expect(readLastSeenWhatsNewVersion(storage)).toBe('0.13.0');

    const throwing = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    };
    expect(readLastSeenWhatsNewVersion(throwing)).toBeNull();
    expect(() => markWhatsNewSeen('0.13.0', throwing)).not.toThrow();
  });
});

describe('localizedWhatsNewContent', () => {
  it('overlays locale overrides and keeps base fields for gaps', () => {
    const zh = localizedWhatsNewContent(CONTENT, 'zh-CN');
    expect(zh.title).toBe('设计系统同步');
    expect(zh.linkUrl).toBe('https://example.com/blog');
  });

  it('falls back to the base copy for unknown locales', () => {
    const fr = localizedWhatsNewContent(CONTENT, 'fr');
    expect(fr.title).toBe(CONTENT.title);
    expect(fr.body).toBe(CONTENT.body);
  });

  it('matches the bare language when the exact locale is missing', () => {
    const content: WhatsNewContent = { ...CONTENT, locales: { zh: { title: '通用中文' } } };
    expect(localizedWhatsNewContent(content, 'zh-TW').title).toBe('通用中文');
  });
});
