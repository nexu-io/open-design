export const DEEPSEEK_V4_PRO_CAMPAIGN = {
  id: 'deepseek-v4-pro-unlimited-2026',
  modelId: 'deepseek-v4-pro',
  modelIds: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  window: {
    startAt: '2026-08-13T20:00:00+08:00',
    endAtExclusive: '2026-08-27T20:00:00+08:00',
    label: '8 月 13 日—8 月 27 日',
  },
  headline: '这次，顶级智能无限用。',
  description: '落地页、网站、幻灯片、图片，无限做，做到满意',
  badge: '无限使用',
  benefit: 'DeepSeek V4 Pro 与 V4 Flash 无限使用',
  timing: '8 月 13 日至 8 月 27 日，活动期间免费使用',
  ruleSummary: '8 月 13 日至 8 月 27 日，付费用户可在产品内免费使用；大规模盗刷等违规行为将暂停活动权益。',
  audienceDefinition: {
    paid: '付费用户：当前存在有效个人或团队订阅的用户。',
    unpaid: '未付费用户：当前没有有效订阅的用户；曾经充值但没有订阅的用户仍归为未付费用户。',
  },
  paid: {
    eyebrow: '两周免费开放',
    status: '已解锁',
    cta: '立即使用',
    modelBadge: '无限使用',
  },
  unpaid: {
    eyebrow: '付费用户免费开放',
    status: '升级后可用',
    cta: '升级套餐，立即使用',
    modelBadge: '升级可用',
    tooltip: '活动窗口内订阅付费套餐后可用，统一于 8 月 27 日结束。',
  },
  restricted: {
    modelBadge: '已暂停',
    tooltip: '检测到异常的大规模使用，本活动权益已暂停；如有疑问请联系支持。',
  },
  boundary: '套餐内的无限制模型额度与免费生成次数，仅可通过Open Design使用；无法在MCP/CLI/API及其他场景使用。部分模型高峰期需要排队。解释权归官方所有。',
} as const;

export const DEEPSEEK_V4_PRO_CAMPAIGN_REVIEW_PARAM = 'deepseek-v4-pro';
export const DEEPSEEK_V4_PRO_CAMPAIGN_AUDIENCE_PARAM = 'campaignAudience';

export type DeepSeekV4ProCampaignAudience = 'paid' | 'unpaid' | 'unknown';

export function isDeepSeekV4ProCampaignWindowOpen(now: number): boolean {
  const startAt = Date.parse(DEEPSEEK_V4_PRO_CAMPAIGN.window.startAt);
  const endAtExclusive = Date.parse(DEEPSEEK_V4_PRO_CAMPAIGN.window.endAtExclusive);
  return now >= startAt && now < endAtExclusive;
}

export function isDeepSeekV4ProCampaignReview(
  search: string | null | undefined,
): boolean {
  if (!search) return false;
  const params = new URLSearchParams(search);
  return params.get('campaign') === DEEPSEEK_V4_PRO_CAMPAIGN_REVIEW_PARAM
    || deepSeekV4ProCampaignAudienceOverride(search) !== null;
}

export function isDeepSeekV4ProCampaignVisible(input: {
  now: number;
  search?: string | null;
}): boolean {
  return isDeepSeekV4ProCampaignReview(input.search)
    || isDeepSeekV4ProCampaignWindowOpen(input.now);
}

export function deepSeekV4ProCampaignNextBoundary(now: number): number | null {
  const startAt = Date.parse(DEEPSEEK_V4_PRO_CAMPAIGN.window.startAt);
  const endAtExclusive = Date.parse(DEEPSEEK_V4_PRO_CAMPAIGN.window.endAtExclusive);
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

export function formatDeepSeekV4ProCampaignMockRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}天 ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatDeepSeekV4ProCampaignCountdown(now: number): string {
  const startAt = Date.parse(DEEPSEEK_V4_PRO_CAMPAIGN.window.startAt);
  const endAtExclusive = Date.parse(DEEPSEEK_V4_PRO_CAMPAIGN.window.endAtExclusive);
  // The surrounding UI already labels this value as “活动倒计时”. Keep the
  // value itself neutral so the review fixture never exposes a confusing
  // pre-launch state such as “距开始 X 天”.
  if (now < startAt) return formatCampaignRemaining(startAt - now);
  if (now < endAtExclusive) return formatCampaignRemaining(endAtExclusive - now);
  return '活动已结束';
}

export function deepSeekV4ProCampaignAudienceOverride(
  search: string | null | undefined,
): Exclude<DeepSeekV4ProCampaignAudience, 'unknown'> | null {
  if (!search) return null;
  const value = new URLSearchParams(search).get(
    DEEPSEEK_V4_PRO_CAMPAIGN_AUDIENCE_PARAM,
  );
  return value === 'paid' || value === 'unpaid' ? value : null;
}

export function resolveDeepSeekV4ProCampaignAudience(input: {
  plan: string | null | undefined;
  loggedIn: boolean | null | undefined;
  search?: string | null;
  now?: number;
}): DeepSeekV4ProCampaignAudience {
  if (!isDeepSeekV4ProCampaignVisible({
    now: input.now ?? Date.now(),
    search: input.search,
  })) return 'unknown';

  const override = deepSeekV4ProCampaignAudienceOverride(input.search);
  if (override) return override;

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

export function isDeepSeekV4ProCampaignModel(modelId: string | null | undefined): boolean {
  const normalized = modelId?.trim().toLowerCase();
  return normalized != null && DEEPSEEK_V4_PRO_CAMPAIGN.modelIds.includes(normalized as 'deepseek-v4-flash' | 'deepseek-v4-pro');
}
