import { expect, test } from '@/playwright/suite';
import type { Page, Route } from '@playwright/test';
import { openSettingsDialog } from '../lib/playwright/amr.js';

const STORAGE_KEY = 'open-design:config';

type DesignSystemFixture = {
  id: string;
  title: string;
  category: string;
  summary: string;
  surface: 'web' | 'image' | 'video' | 'audio';
  swatches?: string[];
  source?: 'library' | 'user';
  isEditable?: boolean;
};

type SkillFixture = {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  mode: 'prototype' | 'deck' | 'image';
  surface?: string;
  platform: string;
  scenario: string;
  previewType: string;
  designSystemRequired: boolean;
  defaultFor: string[];
  upstream: null;
  featured: null;
  fidelity: null;
  speakerNotes: null;
  animations: null;
  hasBody: boolean;
  examplePrompt: string;
  source?: string;
  category?: string;
};

function baseConfig(): Record<string, unknown> {
  return {
    mode: 'daemon',
    apiKey: '',
    apiProtocol: 'anthropic',
    apiVersion: '',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    apiProviderBaseUrl: 'https://api.anthropic.com',
    agentId: 'codex',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: {},
    agentCliEnv: {},
  };
}

async function seedSettingsBase(page: Page, override?: Record<string, unknown>) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: { ...baseConfig(), ...override } },
  );
}

async function waitForLoadingToClear(page: Page) {
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0, { timeout: 15_000 });
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
}

async function routeBootstrapApis(
  page: Page,
  systems: DesignSystemFixture[],
  options?: {
    skills?: SkillFixture[];
    importLocal?: (route: Route) => Promise<void>;
    patchSystem?: (route: Route) => Promise<void>;
  },
) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname;

    if (path === '/api/health') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      return;
    }
    if (path === '/api/agents') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          agents: [
            {
              id: 'codex',
              name: 'Codex CLI',
              bin: 'codex',
              available: true,
              version: '0.130.0',
              models: [{ id: 'default', label: 'Default' }],
            },
          ],
        }),
      });
      return;
    }
    if (path === '/api/editors') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"editors":[]}' });
      return;
    }
    if (path === '/api/app-config') {
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ config: baseConfig() }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      return;
    }
    if (path === '/api/connectors/composio/config') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"configured":false,"apiKeyTail":""}',
      });
      return;
    }
    if (path === '/api/media/config') {
      if (method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{"providers":{}}' });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      return;
    }
    if (path === '/api/skills') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ skills: options?.skills ?? [] }),
      });
      return;
    }
    if (path === '/api/design-systems' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ designSystems: systems }),
      });
      return;
    }
    if (path === '/api/design-systems/import/local' && method === 'POST') {
      if (options?.importLocal) {
        await options.importLocal(route);
        return;
      }
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"missing importLocal mock"}' });
      return;
    }
    if (/^\/api\/design-systems\/[^/]+$/.test(path) && method === 'PATCH') {
      if (options?.patchSystem) {
        await options.patchSystem(route);
        return;
      }
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"missing patchSystem mock"}' });
      return;
    }
    if (/^\/api\/design-systems\/[^/]+$/.test(path) && method === 'GET') {
      const id = decodeURIComponent(path.split('/').at(-1) ?? '');
      const system = systems.find((entry) => entry.id === id) ?? systems[0];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          designSystem: {
            ...system,
            body: `# ${system?.title ?? id}`,
          },
        }),
      });
      return;
    }
    if (path === '/api/projects') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"projects":[]}' });
      return;
    }
    if (path === '/api/templates') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"templates":[]}' });
      return;
    }
    if (path === '/api/prompt-templates') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"promptTemplates":[]}' });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

async function openDesignSystemsSettings(page: Page) {
  await gotoEntryHome(page);
  const dialog = await openSettingsDialog(page);
  await dialog.getByRole('button', { name: /Design systems|设计系统|設計系統/i }).click();
  await expect(dialog.getByRole('heading', { name: /Design systems|设计系统|設計系統/i })).toBeVisible();
  return dialog;
}

test.describe('Settings design systems flows', () => {
  test('[P1] disabled skills and design systems are filtered from entry creation surfaces after Settings changes', async ({ page }) => {
    await seedSettingsBase(page);
    const systems: DesignSystemFixture[] = [
      {
        id: 'agentic',
        title: 'Agentic',
        category: 'Productivity & SaaS',
        summary: 'Default agentic design system.',
        surface: 'web',
        swatches: ['#111827', '#22c55e'],
      },
      {
        id: 'airbnb',
        title: 'Airbnb',
        category: 'Consumer',
        summary: 'Travel marketplace design language.',
        surface: 'web',
        swatches: ['#ff385c', '#ffffff'],
      },
    ];
    const skills: SkillFixture[] = [
      {
        id: 'enabled-entry-skill',
        name: 'Enabled Entry Skill',
        description: 'Visible from entry pickers.',
        triggers: [],
        mode: 'prototype',
        surface: 'web',
        platform: 'desktop',
        scenario: 'qa',
        previewType: 'html',
        designSystemRequired: true,
        defaultFor: [],
        upstream: null,
        featured: null,
        fidelity: null,
        speakerNotes: null,
        animations: null,
        hasBody: true,
        examplePrompt: '',
        source: 'builtin',
        category: 'Marketing',
      },
      {
        id: 'disabled-entry-skill',
        name: 'Disabled Entry Skill',
        description: 'Hidden after the Settings toggle is off.',
        triggers: [],
        mode: 'prototype',
        surface: 'web',
        platform: 'desktop',
        scenario: 'qa',
        previewType: 'html',
        designSystemRequired: true,
        defaultFor: [],
        upstream: null,
        featured: null,
        fidelity: null,
        speakerNotes: null,
        animations: null,
        hasBody: true,
        examplePrompt: '',
        source: 'builtin',
        category: 'Marketing',
      },
    ];

    await routeBootstrapApis(page, systems, { skills });

    const dialog = await openDesignSystemsSettings(page);
    await dialog.getByRole('button', { name: /Skills|技能/i }).click();
    await expect(dialog.getByTestId('skill-row-disabled-entry-skill')).toBeVisible();
    await dialog
      .getByTestId('skill-row-disabled-entry-skill')
      .getByRole('checkbox', { name: /Toggle|切换|切換/i })
      .evaluate((node: HTMLInputElement) => node.click());
    await expect(dialog.getByText('All changes saved')).toBeVisible();

    await dialog.getByRole('button', { name: /Design systems|设计系统|設計系統/i }).click();
    await expect(dialog.locator('.library-ds-card', { hasText: 'Airbnb' })).toBeVisible();
    await dialog
      .locator('.library-ds-card', { hasText: 'Airbnb' })
      .getByRole('checkbox', { name: /Show in home gallery/i })
      .evaluate((node: HTMLInputElement) => node.click());
    await expect(dialog.getByText('All changes saved')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toHaveCount(0);

    const input = page.getByTestId('home-hero-input');
    await input.click();
    await input.fill('@entry');
    const skillPicker = page.getByTestId('home-hero-plugin-picker');
    await expect(skillPicker).toBeVisible();
    await skillPicker.getByRole('tab', { name: /Skills/i }).click();
    await expect(skillPicker.getByRole('option', { name: /Enabled Entry Skill/i })).toBeVisible();
    await expect(skillPicker.getByRole('option', { name: /Disabled Entry Skill/i })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.getByTestId('home-hero-design-system-trigger').click();
    const homePicker = page.getByTestId('project-ds-picker-popover');
    await expect(homePicker.getByTestId('project-ds-picker-option-agentic')).toBeVisible();
    await expect(homePicker.getByTestId('project-ds-picker-option-airbnb')).toHaveCount(0);
  });

  test('[P1] imports a local design system and makes it visible immediately', async ({ page }) => {
    await seedSettingsBase(page);
    const systems: DesignSystemFixture[] = [];
    const importedSystem: DesignSystemFixture = {
      id: 'acme-core',
      title: 'Acme Core',
      category: 'Productivity & SaaS',
      summary: 'Imported Acme product design system.',
      surface: 'web',
      swatches: ['#111827', '#4f46e5'],
      source: 'user',
      isEditable: true,
    };

    await routeBootstrapApis(page, systems, {
      importLocal: async (route) => {
        systems.push(importedSystem);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ designSystem: importedSystem }),
        });
      },
    });

    const dialog = await openDesignSystemsSettings(page);
    await dialog.getByRole('button', { name: /Add design system|添加设计系统|新增設計系統/i }).click();
    await dialog.getByPlaceholder('/path/to/project').fill('/tmp/acme-design-system');
    await dialog.getByRole('button', { name: /Import from project|从项目导入|從專案匯入/i }).click();

    await expect(dialog.getByText('Imported Acme Core')).toBeVisible();
    await dialog.getByRole('button', { name: /View imported design system|查看导入的设计系统|查看匯入的設計系統/i }).click();
    await expect(dialog.locator('.library-ds-title-text', { hasText: 'Acme Core' })).toBeVisible();
    await expect(dialog.getByText('Imported Acme product design system.')).toBeVisible();
  });

  test('[P1] renames an editable design system and keeps the new title after reopening settings', async ({ page }) => {
    await seedSettingsBase(page);
    const systems: DesignSystemFixture[] = [
      {
        id: 'brand-kit',
        title: 'Brand Kit',
        category: 'Productivity & SaaS',
        summary: 'Editable internal brand rules.',
        surface: 'web',
        source: 'user',
        isEditable: true,
      },
    ];

    await routeBootstrapApis(page, systems, {
      patchSystem: async (route) => {
        const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1) ?? '');
        const body = route.request().postDataJSON() as { title?: string };
        const system = systems.find((entry) => entry.id === id)!;
        if (body.title) system.title = body.title;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ designSystem: { ...system, body: `# ${system.title}` } }),
        });
      },
    });

    let dialog = await openDesignSystemsSettings(page);
    await dialog.getByRole('button', { name: 'Rename Brand Kit', exact: true }).click();
    const renameModal = dialog.locator('.modal.modal-rename');
    await expect(renameModal).toBeVisible();
    await renameModal.getByRole('textbox', { name: /Rename|重命名/i }).fill('Brand Kit 2026');
    await renameModal.getByRole('button', { name: /Save|保存/i }).click();

    await expect(dialog.getByText('Brand Kit 2026')).toBeVisible();
    await expect(dialog.getByText('Brand Kit', { exact: true })).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    dialog = await openDesignSystemsSettings(page);
    await expect(dialog.getByText('Brand Kit 2026')).toBeVisible();
    await expect(dialog.getByText('Brand Kit', { exact: true })).toHaveCount(0);
  });

  test('[P1] shows an inline error when importing a broken local design system package', async ({ page }) => {
    await seedSettingsBase(page);
    const systems: DesignSystemFixture[] = [];

    await routeBootstrapApis(page, systems, {
      importLocal: async (route) => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              message: 'Could not read design system package. Expected a valid zip or project directory.',
            },
          }),
        });
      },
    });

    const dialog = await openDesignSystemsSettings(page);
    await dialog.getByRole('button', { name: /Add design system|添加设计系统|新增設計系統/i }).click();
    await dialog.getByPlaceholder('/path/to/project').fill('/tmp/broken-design-system.zip');
    await dialog.getByRole('button', { name: /Import from project|从项目导入|從專案匯入/i }).click();

    await expect(
      dialog.getByText('Could not read design system package. Expected a valid zip or project directory.'),
    ).toBeVisible();
    await expect(dialog.getByText(/^Imported /)).toHaveCount(0);
  });
});
