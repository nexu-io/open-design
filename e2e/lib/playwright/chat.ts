import type { Locator, Page } from '@playwright/test';

export function runErrorCard(page: Page): Locator {
  return page.locator('[data-user-action-card="run-recovery"]').last();
}
