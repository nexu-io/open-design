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
  'open-design:campaign-seen:deepseek-v4-flash-unlimited-2026': '1',
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
