import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const STORAGE_KEY = 'open-design:config';
const VISUAL_STYLE_ID = 'od-visual-stability-style';

const VISUAL_CONFIG = {
  mode: 'daemon',
  apiKey: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  agentId: 'mock',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  agentModels: {},
  privacyDecisionAt: 1,
  telemetry: { metrics: false, content: false, artifactManifest: false },
} as const;

const MOCK_AGENT = {
  id: 'mock',
  name: 'Mock Agent',
  bin: 'mock-agent',
  available: true,
  version: 'test',
  models: [{ id: 'default', label: 'Default' }],
} as const;

export async function configureVisualPage(page: Page): Promise<void> {
  await page.addInitScript(([key, config]) => {
    window.localStorage.setItem(key, JSON.stringify(config));
  }, [STORAGE_KEY, VISUAL_CONFIG] as const);

  await page.route('**/api/app-config', async (route) => {
    await fulfillGet(route, { config: VISUAL_CONFIG });
  });

  await page.route('**/api/agents', async (route) => {
    await fulfillGet(route, { agents: [MOCK_AGENT] });
  });

  await page.addInitScript(([styleId]) => {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
      }
    `;
    document.head.appendChild(style);
  }, [VISUAL_STYLE_ID] as const);
}

export async function waitForVisualReady(page: Page): Promise<void> {
  await page.getByText('Loading Open Design…').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

export async function gotoVisualHome(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForVisualReady(page);
}

export async function captureVisual(page: Page, name: string): Promise<string> {
  const outputDir = path.resolve(process.env.OD_VISUAL_OUTPUT_DIR || 'ui/reports/visual-screenshots');
  const safeName = sanitizeVisualName(name);
  const outputPath = path.join(outputDir, `${safeName}.png`);
  await mkdir(outputDir, { recursive: true });
  await page.screenshot({ path: outputPath, animations: 'disabled', caret: 'hide' });
  return outputPath;
}

function sanitizeVisualName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'visual';
}

async function fulfillGet(route: Route, json: unknown): Promise<void> {
  if (route.request().method() !== 'GET') {
    await route.continue();
    return;
  }

  await route.fulfill({ json });
}
