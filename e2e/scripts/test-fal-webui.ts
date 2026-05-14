/**
 * Ad-hoc Playwright script: test fal image generation through the live web UI.
 * Run with: cd e2e && pnpm exec tsx scripts/test-fal-webui.ts
 */
import { chromium } from '@playwright/test';

const WEB_URL = 'http://127.0.0.1:17573';
const EXISTING_PROTOTYPE_PROJECT_ID = '59cf06da-5395-4d17-96b4-1094908859fb';
const PROMPT =
  'I would like for you to create an image of a lady riding a horse. ' +
  'The background is Ireland and the weather is dramatic. ' +
  'Use fal to do it. Best model they have.';
const TIMEOUT_MS = 180_000;

async function run() {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const ctx = await browser.newContext({ baseURL: WEB_URL });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);

  console.log('Opening web UI...');
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'scripts/fal-webui-01-homepage.png' });
  console.log('Homepage loaded. URL:', page.url());

  // Dismiss onboarding if present
  const onboarding = page.locator('[data-testid="onboarding-complete"], [data-testid="skip-onboarding"]');
  if (await onboarding.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await onboarding.first().click();
    await page.waitForLoadState('networkidle');
  }

  // Create a PROTOTYPE project — this is the case the user hit
  // (media request inside a non-image project)
  console.log('Creating prototype project via API...');
  const projectId = `fal-prototype-test-${Date.now()}`;
  const createResp = await ctx.request.post(`${WEB_URL}/api/projects`, {
    data: {
      id: projectId,
      name: 'fal-prototype-test',
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: { kind: 'prototype' },
    },
  });
  if (!createResp.ok()) {
    throw new Error(`Project creation failed: ${createResp.status()} ${await createResp.text()}`);
  }
  console.log(`Prototype project created: ${projectId}`);

  // Navigate to the project
  await page.goto(`/projects/${projectId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'scripts/fal-webui-02-project.png' });
  console.log('Project page URL:', page.url());
  console.log('Page title:', await page.title());

  // Log visible test IDs for debugging
  const testIds = await page.locator('[data-testid]').evaluateAll(
    (els) => [...new Set(els.map((e) => e.getAttribute('data-testid')))].slice(0, 20),
  );
  console.log('Visible data-testid elements:', testIds);

  // Try to find any chat input
  const chatInput = page.locator('[data-testid="chat-composer-input"], textarea, [contenteditable="true"]').first();
  const inputVisible = await chatInput.isVisible({ timeout: 5_000 }).catch(() => false);

  if (!inputVisible) {
    console.log('No chat input found. Checking for new-project panel...');
    await page.screenshot({ path: 'scripts/fal-webui-03-no-input.png' });

    // Try clicking to create from the homepage if redirected
    const newProjectTab = page.locator('[data-testid="new-project-tab-image"]');
    if (await newProjectTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      console.log('Found image project tab, clicking...');
      await newProjectTab.click();
      const nameInput = page.locator('[data-testid="new-project-name"]');
      await nameInput.fill('fal-webui-test');
      await page.locator('[data-testid="create-project"]').click();
      await page.waitForURL(/\/projects\//);
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'scripts/fal-webui-04-new-project.png' });
    }
  }

  // Wait for chat composer
  const composerInput = page.locator('[data-testid="chat-composer-input"]');
  await composerInput.waitFor({ timeout: 20_000 });
  console.log('Chat input found, sending prompt...');
  await page.screenshot({ path: 'scripts/fal-webui-05-ready.png' });

  // Send the prompt
  await composerInput.click();
  await composerInput.fill(PROMPT);

  const runResponseP = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/runs' && r.request().method() === 'POST',
    { timeout: 10_000 },
  );
  await page.locator('[data-testid="chat-send"]').click();
  const runResp = await runResponseP;
  const { runId } = (await runResp.json()) as { runId: string };
  console.log(`Run started: ${runId}`);
  await page.screenshot({ path: 'scripts/fal-webui-06-running.png' });

  // Poll for completion
  console.log('Waiting for run to complete...');
  const start = Date.now();
  let finalStatus = '';
  page.setDefaultTimeout(TIMEOUT_MS);
  while (Date.now() - start < TIMEOUT_MS) {
    await page.waitForTimeout(4_000);
    const statusResp = await ctx.request.get(`${WEB_URL}/api/runs/${runId}`);
    if (!statusResp.ok()) continue;
    const body = (await statusResp.json()) as { status: string };
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  [${elapsed}s] status=${body.status}`);
    if (body.status === 'succeeded' || body.status === 'failed' || body.status === 'error') {
      finalStatus = body.status;
      break;
    }
    // Screenshot every 20s while running
    if (Math.floor((Date.now() - start) / 20_000) > Math.floor((Date.now() - start - 4_000) / 20_000)) {
      await page.screenshot({ path: `scripts/fal-webui-running-${elapsed}s.png` });
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nRun finished: status=${finalStatus} in ${elapsed}s`);
  await page.screenshot({ path: 'scripts/fal-webui-07-result.png' });

  // Check generated files
  const projectForFiles = currentProjectId(page) || projectId;
  const filesResp = await ctx.request.get(`${WEB_URL}/api/projects/${projectForFiles}/files`);
  if (filesResp.ok()) {
    const { files } = (await filesResp.json()) as { files: Array<{ name: string; size: number }> };
    const imageFiles = files.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f.name));
    if (imageFiles.length > 0) {
      console.log('\nGenerated image files:');
      for (const f of imageFiles) console.log(`  ${f.name} (${(f.size / 1024).toFixed(0)} KB)`);
    } else {
      console.log('\nNo image files. All files:', files.map((f) => f.name).join(', ') || '(none)');
    }
  }

  await browser.close();
  console.log('\nDone. Screenshots saved to e2e/scripts/fal-webui-*.png');
}

function currentProjectId(page: { url(): string }): string | null {
  try {
    const [, , id] = new URL(page.url()).pathname.split('/');
    return id || null;
  } catch { return null; }
}

run().catch((err) => { console.error(err); process.exit(1); });
