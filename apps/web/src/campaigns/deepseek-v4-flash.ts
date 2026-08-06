export const DEEPSEEK_V4_FLASH_CAMPAIGN = {
  id: 'deepseek-v4-flash-unlimited-2026',
  modelId: 'deepseek-v4-flash',
  window: {
    startAt: '2026-08-06T00:00:00+08:00',
    endAtExclusive: '2026-08-13T20:00:00+08:00',
    label: '8 月 6 日—8 月 13 日',
  },
  headline: '这次，别省着用。DeepSeek V4 Flash 无限用。',
  description: '落地页、网站、幻灯片、图片，无限做，做到满意',
  badge: '无限使用',
  benefit: 'DeepSeek V4 Flash 无限使用',
  timing: '8 月 6 日至 8 月 13 日，活动期间免费使用',
  ruleSummary: '8 月 6 日至 8 月 13 日，付费用户可在产品内免费使用；大规模盗刷等违规行为将暂停活动权益。',
  audienceDefinition: {
    paid: '付费用户：当前存在有效个人或团队订阅的用户。',
    unpaid: '未付费用户：当前没有有效订阅的用户；曾经充值但没有订阅的用户仍归为未付费用户。',
  },
  paid: {
    eyebrow: '7 天免费开放',
    status: '已解锁 · 8 月 6 日—8 月 13 日',
    cta: '立即使用',
    modelBadge: '无限使用',
  },
  unpaid: {
    eyebrow: '付费用户免费开放',
    status: '升级后可用 · 截止 8 月 13 日',
    cta: '升级套餐，立即使用',
    modelBadge: '升级可用',
    tooltip: '活动窗口内订阅付费套餐后可用，统一于 8 月 13 日结束。',
  },
  // Reserved for the backend usage-limit signal; no trigger wired yet.
  restricted: {
    modelBadge: '已暂停',
    tooltip: '检测到异常的大规模使用，本活动权益已暂停；如有疑问请联系支持。',
  },
  boundary: '套餐内的无限制模型额度与免费生成次数，仅可通过Open Design使用；无法在MCP/CLI/API及其他场景使用。解释权归官方所有。',
} as const;

export type DeepSeekV4FlashCampaignAudience = 'paid' | 'unpaid' | 'unknown';

export function isDeepSeekV4FlashCampaignWindowOpen(now: number): boolean {
  const startAt = Date.parse(DEEPSEEK_V4_FLASH_CAMPAIGN.window.startAt);
  const endAtExclusive = Date.parse(DEEPSEEK_V4_FLASH_CAMPAIGN.window.endAtExclusive);
  return now >= startAt && now < endAtExclusive;
}

/**
 * Campaign visibility has exactly one input: the real launch window. The
 * former URL review backdoors (campaign / audience / usage overrides) were
 * removed by product decision — reviewing the campaign now happens by
 * temporarily overriding the `window.startAt` constant, never through URL
 * parameters.
 */
export function isDeepSeekV4FlashCampaignVisible(now: number): boolean {
  return isDeepSeekV4FlashCampaignWindowOpen(now);
}

export function deepSeekV4FlashCampaignNextBoundary(now: number): number | null {
  const startAt = Date.parse(DEEPSEEK_V4_FLASH_CAMPAIGN.window.startAt);
  const endAtExclusive = Date.parse(DEEPSEEK_V4_FLASH_CAMPAIGN.window.endAtExclusive);
  if (now < startAt) return startAt;
  if (now < endAtExclusive) return endAtExclusive;
  return null;
}

function formatCampaignRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}天 ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatDeepSeekV4FlashCampaignCountdown(now: number): string {
  const startAt = Date.parse(DEEPSEEK_V4_FLASH_CAMPAIGN.window.startAt);
  const endAtExclusive = Date.parse(DEEPSEEK_V4_FLASH_CAMPAIGN.window.endAtExclusive);
  // The surrounding UI already labels this value as “活动倒计时”. Keep the
  // value itself neutral so a pre-launch render never exposes a confusing
  // state such as “距开始 X 天”.
  if (now < startAt) return formatCampaignRemaining(startAt - now);
  if (now < endAtExclusive) return formatCampaignRemaining(endAtExclusive - now);
  return '活动已结束';
}

export function resolveDeepSeekV4FlashCampaignAudience(input: {
  plan: string | null | undefined;
  loggedIn: boolean | null | undefined;
  now?: number;
}): DeepSeekV4FlashCampaignAudience {
  if (!isDeepSeekV4FlashCampaignVisible(input.now ?? Date.now())) return 'unknown';

  // Campaign audience is determined ONLY by the current subscription tier.
  // Wallet balance, historical top-ups, and previous recharges are deliberately
  // not inputs: a user who has funded the wallet but has no active subscription
  // must receive the unpaid (upgrade) modal.
  const plan = input.plan?.trim().toLowerCase() ?? '';
  if (plan === 'free' || input.loggedIn === false) return 'unpaid';
  if (plan) return 'paid';
  // A missing tier while billing/context is loading is unknown, not unpaid.
  // EntryShell passes a positive `free` tier once the backend confirms that the
  // logged-in workspace has no subscription, preventing a paid-user flash.
  return 'unknown';
}

export function isDeepSeekV4FlashCampaignModel(modelId: string | null | undefined): boolean {
  return modelId?.trim().toLowerCase() === DEEPSEEK_V4_FLASH_CAMPAIGN.modelId;
}
