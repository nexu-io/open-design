/**
 * 「联系支持」弹窗里的那两行渠道。
 *
 * `SupportDialog` 本身不硬编任何社群地址(渠道由调用方给),所以「产品在用的是哪两条」
 * 得有一个单一出处 —— 否则报错卡、帮助菜单、设置各写一份,改群链接要改三处。
 *
 * 两条地址都取自仓库里已有的出处,不是新编的:
 *   飞书中文社区 —— `README.md` / `docs/i18n/README.zh-CN.md` 顶部那条 applink
 *   Discord     —— `EntryHelpMenu` / `EntryNavRail` / `AssistantMessage` 都在用的同一条邀请链接
 */
import type { SupportChannel } from './SupportDialog';
import { DiscordIcon, FeishuIcon } from './support-brand-icons';
import type { Dict } from '../../i18n/types';

/** 与 `EntryHelpMenu.tsx` / `EntryNavRail.tsx` 同一条邀请链接。 */
export const SUPPORT_DISCORD_URL = 'https://discord.gg/mHAjSMV6gz';
/** README 顶部那条飞书中文社区 applink。 */
export const SUPPORT_FEISHU_URL =
  'https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=c06v4df1-9676-4672-8c77-7a30eab76154';

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
