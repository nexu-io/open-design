// @vitest-environment node


import { afterAll,beforeAll,describe,expect,test } from 'vitest';

import { createDesktopHarness,waitFor } from '../../lib/desktop/desktop-test-helpers.ts';


import { clickDesktopAccentSwatch,clickDesktopExecutionModeTab,clickDesktopProtocolTab,clickDesktopSettingsFooterButton,openDesktopSettingsSection,readDesktopAboutSnapshot,readDesktopAppearanceSectionSnapshot,readDesktopAppearanceSnapshot,readDesktopArtifactOpenSnapshot,readDesktopConnectorsSnapshot,readDesktopLocalCliSnapshot,readDesktopMediaSnapshot,readDesktopSettingsSnapshot,seedDesktopConfig } from './lib/index.js';

const desktopMacDescribe = process.platform === 'darwin' && process.env.OD_DESKTOP_SMOKE === '1' ? describe : describe.skip;

desktopMacDescribe('mac desktop settings smoke', () => {
  const desktop = createDesktopHarness('mac-settings-smoke');

  beforeAll(async () => {
    await desktop.start();
  }, 75_000);

  afterAll(async () => {
    await desktop.stop();
  }, 30_000);

  test('opens the current API configuration from the desktop shell', async () => {
    await seedDesktopConfig(desktop, {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
      apiProtocol: 'anthropic',
      apiProviderBaseUrl: 'https://api.anthropic.com',
      agentId: null,
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      theme: 'system',
    }, 'model');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Execution mode');

    await waitFor(async () => {
      const snapshot = await readDesktopSettingsSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(true);
      expect(snapshot.heading).toBe('Execution mode');
      expect(snapshot.selectedProtocol).toBe('Anthropic API');
      expect(snapshot.quickFillProvider).toBe('Anthropic (Claude)');
      expect(snapshot.baseUrl).toBe('https://api.anthropic.com');
      expect(snapshot.model).toBe('claude-sonnet-4-5');
    });
  }, 45_000);

  test('keeps legacy provider tracking coherent when switching API protocols', async () => {
    await seedDesktopConfig(desktop, {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      agentId: null,
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
    }, 'baseUrl');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Execution mode');

    await waitFor(async () => {
      const snapshot = await readDesktopSettingsSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(true);
      expect(snapshot.selectedProtocol).toBe('OpenAI API');
      expect(snapshot.quickFillProvider).toBe('DeepSeek — OpenAI');
      expect(snapshot.baseUrl).toBe('https://api.deepseek.com');
    });

    await clickDesktopProtocolTab(desktop, 'Anthropic');

    await waitFor(async () => {
      const snapshot = await readDesktopSettingsSnapshot(desktop);
      expect(snapshot.selectedProtocol).toBe('Anthropic API');
      expect(snapshot.quickFillProvider).toBe('DeepSeek — Anthropic');
      expect(snapshot.baseUrl).toBe('https://api.deepseek.com/anthropic');
      expect(snapshot.model).toBe('deepseek-v4-flash');
    });
  }, 45_000);

  // #5517 removed the theme segmented control from Settings, so the packaged
  // "preview then save" appearance loop is now driven by the accent swatches —
  // the only appearance control the section still owns. The invariants under
  // test are the same ones the theme leg used to prove: the edit previews
  // immediately on the live document, and it survives the dialog closing via
  // Save. The seeded `theme` is a LEGACY dark value: the theme setting is gone
  // and the app ships light-only, so the packaged runtime must coerce it to
  // light on read rather than carry it into the document.
  test('previews and saves the desktop appearance preference', async () => {
    await seedDesktopConfig(desktop, {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
      apiProtocol: 'anthropic',
      apiProviderBaseUrl: 'https://api.anthropic.com',
      agentId: null,
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      theme: 'dark',
    }, 'theme');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Appearance');
    await clickDesktopAccentSwatch(desktop, '#87ea5c');

    await waitFor(async () => {
      const snapshot = await readDesktopAppearanceSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(true);
      // Live preview lands on the document before anything is saved.
      expect(snapshot.documentAccent).toBe('#87ea5c');
      // The seeded legacy `dark` never reaches the document, and the coerced
      // value is written back so the dark preference stops existing on disk.
      expect(snapshot.documentTheme).toBe('light');
      expect(snapshot.savedTheme).toBe('light');
    });

    await clickDesktopSettingsFooterButton(desktop, 'primary');

    await waitFor(async () => {
      const snapshot = await readDesktopAppearanceSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(false);
      expect(snapshot.documentAccent).toBe('#87ea5c');
      expect(snapshot.savedAccent).toBe('#87ea5c');
      expect(snapshot.savedTheme).toBe('light');
    });
  }, 45_000);

  test('opens Local CLI settings and exposes Codex path fields from the desktop shell', async () => {
    await seedDesktopConfig(desktop, {
      mode: 'daemon',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProtocol: 'openai',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
      agentId: 'codex',
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      agentCliEnv: {
        codex: {
          CODEX_HOME: '~/.codex-team',
          CODEX_BIN: '~/bin/codex-next',
        },
      },
      theme: 'system',
    }, 'agentId');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Execution mode');
    await clickDesktopExecutionModeTab(desktop, 'Local CLI');

    await waitFor(async () => {
      const snapshot = await readDesktopLocalCliSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(true);
      expect(snapshot.heading).toBe('Execution mode');
      expect(snapshot.localCliTabSelected).toBe(true);
      expect(snapshot.selectedAgent).toBe('Codex CLI');
      expect(snapshot.codexHome).toBe('~/.codex-team');
      expect(snapshot.codexExecutablePath).toBe('~/bin/codex-next');
    });
  }, 45_000);

  test('switches between BYOK and Local CLI without losing the saved field previews', async () => {
    await seedDesktopConfig(desktop, {
      mode: 'daemon',
      apiKey: 'sk-test',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      apiProtocol: 'openai',
      apiProviderBaseUrl: 'https://api.deepseek.com',
      agentId: 'codex',
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      agentCliEnv: {
        codex: {
          CODEX_HOME: '~/.codex-switch',
          CODEX_BIN: '~/bin/codex-switch',
        },
      },
      theme: 'system',
    }, 'baseUrl');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Execution mode');

    await waitFor(async () => {
      const snapshot = await readDesktopSettingsSnapshot(desktop);
      expect(snapshot.selectedProtocol).toBe('OpenAI API');
      expect(snapshot.quickFillProvider).toBe('DeepSeek — OpenAI');
      expect(snapshot.baseUrl).toBe('https://api.deepseek.com');
      expect(snapshot.model).toBe('deepseek-v4-flash');
    });

    await clickDesktopExecutionModeTab(desktop, 'Local CLI');

    await waitFor(async () => {
      const snapshot = await readDesktopLocalCliSnapshot(desktop);
      expect(snapshot.localCliTabSelected).toBe(true);
      expect(snapshot.selectedAgent).toBe('Codex CLI');
      expect(snapshot.codexHome).toBe('~/.codex-switch');
      expect(snapshot.codexExecutablePath).toBe('~/bin/codex-switch');
    });

    await clickDesktopExecutionModeTab(desktop, 'BYOK');

    await waitFor(async () => {
      const snapshot = await readDesktopSettingsSnapshot(desktop);
      expect(snapshot.selectedProtocol).toBe('OpenAI API');
      expect(snapshot.quickFillProvider).toBe('DeepSeek — OpenAI');
      expect(snapshot.baseUrl).toBe('https://api.deepseek.com');
      expect(snapshot.model).toBe('deepseek-v4-flash');
    });
  }, 45_000);

  test('opens the Connectors section from the desktop shell and shows the catalog surface', async () => {
    await seedDesktopConfig(desktop, {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProtocol: 'openai',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
      agentId: null,
      skillId: null,
      designSystemId: null,
      composio: { apiKeyConfigured: true },
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      theme: 'system',
    }, 'model');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Connectors');

    await waitFor(async () => {
      const snapshot = await readDesktopConnectorsSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(true);
      expect(snapshot.heading).toBe('Connectors');
      expect(snapshot.sectionTitle).toBe('Connectors');
      expect(snapshot.apiKeyLabelVisible).toBe(true);
      expect(snapshot.gateVisible || snapshot.gridVisible).toBe(true);
    });
  }, 45_000);

  test('opens and closes a connector detail drawer from the desktop shell', async () => {
    await seedDesktopConfig(desktop, {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProtocol: 'openai',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
      agentId: null,
      skillId: null,
      designSystemId: null,
      composio: { apiKeyConfigured: true },
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      theme: 'system',
    }, 'model');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Connectors');

    await waitFor(async () => {
      const snapshot = await readDesktopConnectorsSnapshot(desktop);
      expect(snapshot.gridVisible).toBe(true);
    });

    const opened = await desktop.eval<boolean>(`
      (() => {
        const card = document.querySelector('.connector-card');
        if (!(card instanceof HTMLElement)) return false;
        card.click();
        return true;
      })()
    `);
    expect(opened).toBe(true);

    await waitFor(async () => {
      const snapshot = await readDesktopConnectorsSnapshot(desktop);
      expect(snapshot.drawerVisible).toBe(true);
      expect(snapshot.drawerTitle).toBeTruthy();
    });

    const closed = await desktop.eval<boolean>(`
      (() => {
        const closeButton = document.querySelector('[data-testid="connector-drawer-close"]');
        if (!(closeButton instanceof HTMLElement)) return false;
        closeButton.click();
        return true;
      })()
    `);
    expect(closed).toBe(true);

    await waitFor(async () => {
      const snapshot = await readDesktopConnectorsSnapshot(desktop);
      expect(snapshot.drawerVisible).toBe(false);
      expect(snapshot.gridVisible).toBe(true);
    });
  }, 45_000);

  test('keeps the desktop workspace stable when the artifact Open link is clicked', async () => {
    await seedDesktopConfig(desktop, {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProtocol: 'openai',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
      agentId: null,
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      theme: 'system',
    }, 'model');

    const seeded = await desktop.eval<{ projectId: string }>(`
      (async () => {
        const projectId = 'desktop-open-smoke-' + Date.now().toString(36);
        const projectResp = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: projectId,
            name: 'Desktop artifact open smoke',
          }),
        });
        if (!projectResp.ok) {
          throw new Error('failed to create project: ' + projectResp.status);
        }

        const fileResp = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'desktop-open.html',
            content: '<!doctype html><html><body><main><h1>Desktop Open Smoke</h1></main></body></html>',
            artifactManifest: {
              version: 1,
              kind: 'html',
              title: 'Desktop Open Smoke',
              entry: 'desktop-open.html',
              renderer: 'html',
              exports: ['html'],
            },
          }),
        });
        if (!fileResp.ok) {
          throw new Error('failed to seed project file: ' + fileResp.status);
        }

        window.__odDesktopOpenHref = null;
        window.__odDesktopOpenClickCount = 0;
        if (!window.__odDesktopOpenCaptureInstalled) {
          document.addEventListener('click', (event) => {
            const target = event.target instanceof Element ? event.target.closest('a') : null;
            if (!(target instanceof HTMLAnchorElement)) return;
            if (target.textContent?.trim() !== 'Open') return;
            window.__odDesktopOpenHref = target.getAttribute('href');
            window.__odDesktopOpenClickCount += 1;
            event.preventDefault();
          }, true);
          window.__odDesktopOpenCaptureInstalled = true;
        }

        window.location.assign('/projects/' + encodeURIComponent(projectId) + '/files/desktop-open.html');
        return { projectId };
      })()
    `);

    await waitFor(async () => {
      const snapshot = await readDesktopArtifactOpenSnapshot(desktop);
      expect(snapshot.fileWorkspaceVisible).toBe(true);
      expect(snapshot.selectedTab).toBe('desktop-open.html');
      expect(snapshot.artifactPreviewVisible).toBe(true);
      expect(snapshot.openHref).toBe('/api/projects/' + seeded.projectId + '/raw/desktop-open.html?v=0&r=0');
      expect(snapshot.openTarget).toBe('_blank');
      expect(snapshot.openRel).toContain('noreferrer');
    });

    const clicked = await desktop.eval<boolean>(`
      (() => {
        const link = Array.from(document.querySelectorAll('a'))
          .find((node) => node.textContent?.trim() === 'Open');
        if (!(link instanceof HTMLAnchorElement)) return false;
        link.click();
        return true;
      })()
    `);
    expect(clicked).toBe(true);

    await waitFor(async () => {
      const snapshot = await readDesktopArtifactOpenSnapshot(desktop);
      expect(snapshot.fileWorkspaceVisible).toBe(true);
      expect(snapshot.selectedTab).toBe('desktop-open.html');
      expect(snapshot.artifactPreviewVisible).toBe(true);
      expect(snapshot.openHref).toBe('/api/projects/' + seeded.projectId + '/raw/desktop-open.html?v=0&r=0');
    });

    const clickCapture = await desktop.eval<{ count: number; href: string | null }>(`
      (() => ({
        count: typeof window.__odDesktopOpenClickCount === 'number' ? window.__odDesktopOpenClickCount : 0,
        href: typeof window.__odDesktopOpenHref === 'string' ? window.__odDesktopOpenHref : null,
      }))()
    `);
    expect(clickCapture.count).toBeGreaterThan(0);
    expect(clickCapture.href).toBe('/api/projects/' + seeded.projectId + '/raw/desktop-open.html?v=0&r=0');
  }, 45_000);

  test('opens the Media providers section from the desktop shell and shows provider controls', async () => {
    await seedDesktopConfig(desktop, {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProtocol: 'openai',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
      agentId: null,
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      theme: 'system',
    }, 'model');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Media providers');

    await waitFor(async () => {
      const snapshot = await readDesktopMediaSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(true);
      expect(snapshot.heading).toBe('Media providers');
      expect(snapshot.sectionTitle).toBe('Media providers');
      expect(snapshot.providerCardCount).toBeGreaterThan(0);
      expect(snapshot.reloadVisible).toBe(true);
    });
  }, 45_000);

  test('opens the About section from the desktop shell and renders version details or the offline placeholder', async () => {
    await seedDesktopConfig(desktop, {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProtocol: 'openai',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
      agentId: null,
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      theme: 'system',
    }, 'model');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'About');

    await waitFor(async () => {
      const snapshot = await readDesktopAboutSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(true);
      expect(snapshot.heading).toBe('About');
      expect(snapshot.sectionTitle).toBe('About');
      expect(snapshot.aboutListVisible || snapshot.versionUnavailableVisible).toBe(true);
    });
  }, 45_000);

  // #5517 (product confirmed 2026-07-20) removed the 系统/浅色/深色 segmented
  // control from Appearance; the theme now moves only through the account
  // menu's 切换主题 row. The point of this test is unchanged — the packaged
  // desktop shell can reach the Appearance section and render its controls —
  // so it now asserts on the accent swatches, the section's surviving control,
  // and guards that the theme segmented control has not come back.
  test('opens the Appearance section from the desktop shell and shows the accent controls', async () => {
    await seedDesktopConfig(desktop, {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProtocol: 'openai',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
      agentId: null,
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      theme: 'system',
    }, 'theme');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Appearance');

    await waitFor(async () => {
      const snapshot = await readDesktopAppearanceSectionSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(true);
      expect(snapshot.heading).toBe('Appearance');
      expect(snapshot.sectionTitle).toBe('Appearance');
      expect(snapshot.accentSwatchesVisible).toBe(true);
      expect(snapshot.defaultAccentVisible).toBe(true);
      expect(snapshot.themeSegControlVisible).toBe(false);
    });
  }, 45_000);
});
