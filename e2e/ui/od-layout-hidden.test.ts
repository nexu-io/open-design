import { readFile } from 'node:fs/promises';
import { expect, test } from '@/playwright/suite';

test('[P2] prototype layout preserves hidden form feedback and authored overrides', async ({ page }) => {
  const css = await readFile(new URL('../../plugins/_official/scenarios/od-next-strategy/assets/task-profiles/prototype/layout.css', import.meta.url), 'utf8');
  await page.setContent(`<!doctype html><html><head><style>${css}</style>
    <style>
      .feedback { display: flex; }
      .text-button { display: inline-flex; }
      .authored[hidden] { display: block; }
    </style></head><body>
    <form novalidate>
      <div class="od-field">
        <label for="name">Name</label><input id="name">
        <p id="error" class="feedback" hidden>Please enter your name.</p>
      </div>
      <button>Register</button><p id="success" class="od-stack feedback" hidden>Registered.</p>
    </form>
    <div id="searchable" class="od-field" hidden="until-found">Searchable content</div>
    <div id="authored" class="od-stack authored" hidden>Authored override</div>
    <button id="clear" class="text-button" hidden>Clear filters</button>
    <script>
      document.querySelector('form').addEventListener('submit', (event) => {
        event.preventDefault();
        const valid = Boolean(document.querySelector('#name').value.trim());
        document.querySelector('#error').hidden = valid;
        document.querySelector('#success').hidden = !valid;
      });
    </script></body></html>`);

  const error = page.locator('#error');
  const success = page.locator('#success');
  await expect(error).toBeHidden();
  await expect(success).toBeHidden();
  await expect(page.getByRole('button', { name: 'Clear filters' })).toBeHidden();
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(error).toBeVisible();
  await expect(success).toBeHidden();
  await page.getByLabel('Name', { exact: true }).fill('Acceptance user');
  await page.getByLabel('Name', { exact: true }).press('Enter');
  await expect(error).toBeHidden();
  await expect(success).toBeVisible();
  await expect(page.locator('#searchable')).toHaveCSS('display', 'grid');
  await expect(page.locator('#searchable')).toHaveCSS('content-visibility', 'hidden');
  await expect(page.locator('#authored')).toBeVisible();
  await page.locator('#clear').evaluate((button: HTMLButtonElement) => { button.hidden = false; });
  await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible();
  await page.locator('#clear').evaluate((button: HTMLButtonElement) => { button.hidden = true; });
  await expect(page.getByRole('button', { name: 'Clear filters' })).toBeHidden();
});
