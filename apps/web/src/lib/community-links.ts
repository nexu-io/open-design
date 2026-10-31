import type { Locale } from '../i18n/types';

export const COMMUNITY_FEISHU_URL =
  'https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=a38j32fc-756c-4d02-846b-53356fee12a7';
export const COMMUNITY_DISCORD_URL = 'https://discord.gg/mHAjSMV6gz';

const FEISHU_COMMUNITY = { platform: 'feishu', href: COMMUNITY_FEISHU_URL } as const;
const DISCORD_COMMUNITY = { platform: 'discord', href: COMMUNITY_DISCORD_URL } as const;

/** Community entry points follow the active UI language, including live changes. */
export function communityForLocale(locale: Locale) {
  return locale === 'zh-CN' || locale === 'zh-TW' ? FEISHU_COMMUNITY : DISCORD_COMMUNITY;
}
