import type { BrowserContext } from '@playwright/test';

/**
 * Marketing campaign modals must never interrupt functional UI specs.
 *
 * The DeepSeek V4 Flash home modal is a one-shot surface keyed on localStorage;
 * once its fixed window opens, every fresh browser profile trips it on the
 * first home render, stealing focus and burying the elements a spec is about
 * to interact with. Pre-seeding the dismissal keeps specs deterministic both
 * inside and outside the campaign window.
 *
 * Keys must stay in sync with the SEEN_KEY in
 * `apps/web/src/components/DeepSeekV4FlashCampaign.tsx` (built from
 * `DEEPSEEK_V4_FLASH_CAMPAIGN.id`). Add one entry per campaign.
 *
 * This helper is shared by:
 * - the Playwright suite `context` fixture (worker-owned pages)
 * - `createCollabCluster` (which allocates its own BrowserContexts and
 *   therefore never sees the suite fixture)
 */
export const CAMPAIGN_DISMISSAL_STORAGE: Record<string, string> = {
  // Finished 8/6-8/13 free week.
  'open-design:campaign-seen:deepseek-v4-flash-unlimited-2026': '1',
  // Live 8/13-8/27 two-model window. Frequency control is keyed on the campaign
  // id, so a new campaign needs its own entry here — otherwise its modal opens
  // over every spec on the first home render, exactly what this file prevents.
  'open-design:campaign-seen:deepseek-v4-dual-unlimited-2026': '1',
  // Live 8/20-9/3 Go plan launch window.
  'open-design:campaign-seen:go-plan-launch-2026': '1',
};

export async function seedCampaignDismissals(context: BrowserContext): Promise<void> {
  await context.addInitScript((entries: Record<string, string>) => {
    try {
      for (const [key, value] of Object.entries(entries)) {
        window.localStorage.setItem(key, value);
      }
    } catch {
      // Storage may be unavailable in exotic contexts; the campaign modal
      // fails closed in that case, so specs stay uninterrupted either way.
    }
  }, CAMPAIGN_DISMISSAL_STORAGE);
}
