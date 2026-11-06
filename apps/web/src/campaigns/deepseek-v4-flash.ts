/**
 * DeepSeek V4 unlimited-access campaign — identity, window, and pure helpers.
 *
 * Now covers TWO models. The free week that ran 8/6–8/13 offered V4 Flash
 * alone; the two-week window that starts the instant that one ends offers V4
 * Pro alongside it, on one shared window that opens and closes for both models
 * at once. The module keeps its `…V4Flash` names so this stays a content change
 * rather than a rename across 28 i18n keys × 19 locales; the names are due for
 * a cleanup pass once the campaign is off.
 *
 * User-visible copy lives in i18n (`campaign.deepseekV4Flash.*`). Keep this
 * module free of locale strings so workbench surfaces follow the active UI
 * language (19 locales under apps/web/src/i18n/locales).
 */
export const DEEPSEEK_V4_FLASH_CAMPAIGN = {
  id: 'deepseek-v4-dual-unlimited-2026',
  /**
   * The model a paid user is switched to when they accept the campaign. Pro is
   * the headline benefit, so it is the one 「立即使用」 lands on.
   */
  modelId: 'deepseek-v4-pro',
  /** Both campaign models, in the order product presents them: Pro then Flash. */
  modelIds: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  window: {
    startAt: '2026-08-13T20:00:00+08:00',
    endAtExclusive: '2026-08-27T20:00:00+08:00',
  },
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

function formatHms(remainingMs: number): { days: number; hms: string } {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const hms = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return { days, hms };
}

/**
 * Format countdown using the active UI locale. Callers pass `t` from `useT()`
 * so day unit / "ended" copy stay localized.
 *
 * `t` is intentionally contravariant-friendly (`string` key accepted via cast
 * at the call site through DictKey-typed useT): only the two countdown keys
 * below are ever requested.
 */
export function formatDeepSeekV4FlashCampaignCountdown(
  now: number,
  t: (
    key:
      | 'campaign.deepseekV4Flash.countdownRemaining'
      | 'campaign.deepseekV4Flash.countdownEnded',
    vars?: Record<string, string | number>,
  ) => string,
): string {
  const startAt = Date.parse(DEEPSEEK_V4_FLASH_CAMPAIGN.window.startAt);
  const endAtExclusive = Date.parse(DEEPSEEK_V4_FLASH_CAMPAIGN.window.endAtExclusive);
  // The surrounding UI already labels this value as the campaign countdown.
  // Keep the value itself free of "until start" prose.
  if (now < startAt) {
    const { days, hms } = formatHms(startAt - now);
    return t('campaign.deepseekV4Flash.countdownRemaining', { days, hms });
  }
  if (now < endAtExclusive) {
    const { days, hms } = formatHms(endAtExclusive - now);
    return t('campaign.deepseekV4Flash.countdownRemaining', { days, hms });
  }
  return t('campaign.deepseekV4Flash.countdownEnded');
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
  const normalized = modelId?.trim().toLowerCase();
  if (!normalized) return false;
  return DEEPSEEK_V4_FLASH_CAMPAIGN.modelIds.some((id) => id === normalized);
}
