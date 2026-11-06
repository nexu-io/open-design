import { describe, expect, it } from 'vitest';
import { LOCALES } from '../../src/i18n/types';
import { communityForLocale } from '../../src/lib/community-links';

describe('community destinations', () => {
  it.each(LOCALES)('routes the %s UI to its community', (locale) => {
    const entry = communityForLocale(locale);
    if (locale === 'zh-CN' || locale === 'zh-TW') {
      expect(entry).toEqual({
        platform: 'feishu',
        href: 'https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=a38j32fc-756c-4d02-846b-53356fee12a7',
      });
    } else {
      expect(entry).toEqual({ platform: 'discord', href: 'https://discord.gg/mHAjSMV6gz' });
    }
  });
});
