/**
 * 「联系支持」弹窗里的那两行渠道。
 *
 * `SupportDialog` 本身不硬编任何社群地址(渠道由调用方给),所以「产品在用的是哪两条」
 * 得有一个单一出处 —— 否则报错卡、帮助菜单、设置各写一份,改群链接要改三处。
 *
 * 与客户端社群入口共用地址,保持入群邀请一致。
 */
import type { SupportChannel } from './SupportDialog';
import { DiscordIcon, FeishuIcon } from './support-brand-icons';
import type { Dict } from '../../i18n/types';

import {
  COMMUNITY_DISCORD_URL as SUPPORT_DISCORD_URL,
  COMMUNITY_FEISHU_URL as SUPPORT_FEISHU_URL,
} from '../../lib/community-links';

export { SUPPORT_DISCORD_URL, SUPPORT_FEISHU_URL };

export function supportChannels(
  t: (key: keyof Dict) => string,
): SupportChannel[] {
  return [
    {
      id: 'feishu',
      name: t('chat.support.channel.feishu'),
      href: SUPPORT_FEISHU_URL,
      icon: <FeishuIcon />,
    },
    {
      id: 'discord',
      name: t('chat.support.channel.discord'),
      href: SUPPORT_DISCORD_URL,
      icon: <DiscordIcon />,
    },
  ];
}
