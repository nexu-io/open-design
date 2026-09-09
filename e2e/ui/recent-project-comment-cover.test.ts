import { expect, test } from '@/playwright/suite';
import { configureVisualPage, gotoVisualHome } from '@/playwright/visual';
import { T } from '@/timeouts';

const PROJECT_ID = 'visual-comment-slide-deck';
const PROJECT_NAME = 'Comment-safe sales deck';
const UPDATED_AT = 1_700_000_050_000;
const DECK_HTML = `<!doctype html>
<html>
  <head>
    <style>
      /* Put authored content inside <section class="slide"> bodies. */
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      .deck-shell { position: fixed; inset: 0; overflow: hidden; }
      .deck-stage { position: relative; width: 1280px; height: 720px; }
      .slide { position: absolute; inset: 0; display: none; }
      .slide.active { display: grid; place-items: center; background: rgb(21, 73, 117); }
    </style>
  </head>
  <body>
    <div class="deck-shell">
      <div class="deck-stage">
        <section class="slide s-title active"><h1>Real comment-safe cover</h1></section>
        <section class="slide s-details"><h2>Details</h2></section>
      </div>
    </div>
  </body>
</html>`;

test('[P1] ignores slide tag examples in comments when rendering a recent cover', async ({ page }) => {
  test.setTimeout(T.xlong);
  await configureVisualPage(page, { projects: [] });
  await page.route('**/api/projects', async (route) => {
    await route.fulfill({
      json: {
        projects: [{
          id: PROJECT_ID,
          name: PROJECT_NAME,
          skillId: null,
          designSystemId: null,
          createdAt: 1_700_000_000_000,
          updatedAt: UPDATED_AT,
          metadata: { kind: 'deck' },
          status: { label: 'Ready', tone: 'success' },
        }],
      },
    });
  });
  await page.route(`**/api/projects/${PROJECT_ID}/files`, async (route) => {
    await route.fulfill({
      json: {
        files: [{
          name: 'index.html',
          path: 'index.html',
          type: 'file',
          size: DECK_HTML.length,
          mtime: UPDATED_AT,
          kind: 'html',
          mime: 'text/html; charset=utf-8',
          artifactKind: 'deck',
          artifactManifest: {
            version: 1,
            kind: 'deck',
            title: PROJECT_NAME,
            entry: 'index.html',
            renderer: 'html',
            status: 'complete',
            exports: ['html', 'pdf'],
            primary: true,
            createdAt: '2026-08-28T00:00:00.000Z',
            updatedAt: '2026-08-28T00:00:00.000Z',
          },
        }],
      },
    });
  });
  await page.route(`**/api/projects/${PROJECT_ID}/raw/index.html**`, async (route) => {
    await route.fulfill({ contentType: 'text/html; charset=utf-8', body: DECK_HTML });
  });

  await gotoVisualHome(page);
  const card = page.locator(`.recent-projects__card[data-project-id="${PROJECT_ID}"]`);
  await expect(card.getByText(PROJECT_NAME, { exact: true })).toBeVisible({ timeout: T.medium });
  const frame = card.locator('.recent-projects__deck-iframe').contentFrame();
  const title = frame.getByRole('heading', { name: 'Real comment-safe cover' });
  await expect(title).toBeVisible({ timeout: T.medium });
  await expect.poll(async () => title.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.right > 0
      && rect.bottom > 0
      && rect.left < window.innerWidth
      && rect.top < window.innerHeight;
  })).toBe(true);
  await expect(frame.locator('[data-od-cover-slide]')).toHaveCSS(
    'background-color',
    'rgb(21, 73, 117)',
  );
});
