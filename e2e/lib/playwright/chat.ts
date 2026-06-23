import type { Locator, Page } from '@playwright/test';

export function runErrorCard(page: Page): Locator {
  return page.locator('.run-error').last();
}
