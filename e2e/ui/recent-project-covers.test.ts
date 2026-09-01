import { expect, test } from '@/playwright/suite';
import {
  configureVisualPage,
  gotoVisualHome,
  type VisualProject,
  waitForVisualProjects,
} from '@/playwright/visual';
import { fixedStageDeckFixtureHtml } from '@/playwright/resources';
import { T } from '@/timeouts';

const PROJECT_ID = 'visual-fixed-stage-deck';
const PROJECT: VisualProject = {
  id: PROJECT_ID,
  name: 'Fixed-stage sales deck',
  skillId: null,
  designSystemId: null,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_050_000,
  metadata: { kind: 'deck' },
  status: { value: 'succeeded' },
};

test('[P1] renders a nested fixed-stage deck cover inside Recent projects', async ({ page }) => {
  test.setTimeout(T.xlong);
  const deckHtml = fixedStageDeckFixtureHtml();
  await configureVisualPage(page, { projects: [PROJECT] });
  await page.route(`**/api/projects/${PROJECT_ID}/files`, async (route) => {
    await route.fulfill({
      json: {
        files: [{
          name: 'index.html',
          path: 'index.html',
          type: 'file',
          size: deckHtml.length,
          mtime: PROJECT.updatedAt,
          kind: 'html',
          mime: 'text/html; charset=utf-8',
          artifactKind: 'deck',
          artifactManifest: {
            version: 1,
            kind: 'deck',
            title: PROJECT.name,
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
    await route.fulfill({ contentType: 'text/html; charset=utf-8', body: deckHtml });
  });

  await gotoVisualHome(page);
  await waitForVisualProjects(page, [PROJECT]);

  const card = page.locator(`.recent-projects__card[data-project-id="${PROJECT_ID}"]`);
  const frame = card.locator('.recent-projects__deck-iframe').contentFrame();
  const title = frame.getByRole('heading', { name: 'A visible first slide' });
  await expect(title).toBeVisible({ timeout: T.medium });
  await expect(title).toHaveCSS('opacity', '1');
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
