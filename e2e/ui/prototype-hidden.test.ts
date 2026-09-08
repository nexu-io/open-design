import { readFileSync } from 'node:fs';

import { expect, test } from '@/playwright/suite';

const layout = readFileSync(new URL(
  '../../plugins/_official/scenarios/od-next-strategy/assets/task-profiles/prototype/layout.css',
  import.meta.url,
), 'utf8');

test('[P1] prototype hidden states stay out of layout until activated', async ({ page }) => {
  await page.setContent(`<!doctype html><style>${layout}
    .empty { display: flex; gap: 8px; }
    .notice { display: grid !important; }
  </style>
  <div class="od-row" id="inactive" hidden><button>Inactive action</button></div>
  <div class="empty" id="empty" hidden="false">No matching results</div>
  <div class="notice" id="notice" hidden>Submission complete</div>
  <div id="inline" hidden style="display:flex">Inactive preview</div>
  <button id="toggle" onclick="inactive.hidden=!inactive.hidden">Toggle region</button>`);

  for (const id of ['inactive', 'empty', 'notice', 'inline']) {
    await expect(page.locator(`#${id}`)).toHaveCSS('display', 'none');
  }
  await expect(page.getByRole('button', { name: 'Inactive action' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Toggle region' }).click();
  await expect(page.locator('#inactive')).toHaveCSS('display', 'flex');
  await expect(page.getByRole('button', { name: 'Inactive action' })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle region' }).click();
  await expect(page.locator('#inactive')).toHaveCSS('display', 'none');
});

test('[P1] prototype layout preserves until-found and active product styles', async ({ page }) => {
  await page.setContent(`<!doctype html><style>${layout}
    .od-row { display: grid; }
  </style>
  <div class="od-row" id="active">Active content</div>
  <div id="findable" hidden="until-found">Searchable content</div>
  <div id="findable-upper" hidden="UNTIL-FOUND">Searchable content</div>`);

  await expect(page.locator('#active')).toHaveCSS('display', 'grid');
  for (const id of ['findable', 'findable-upper']) {
    await expect(page.locator(`#${id}`)).not.toHaveCSS('display', 'none');
    await expect(page.locator(`#${id}`)).toHaveCSS('content-visibility', 'hidden');
  }
});
