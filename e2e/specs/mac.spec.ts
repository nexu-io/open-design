// @vitest-environment node

import { execFile } from 'node:child_process';
import { access, mkdir, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createPackagedSmokeReport } from '@/vitest/packaged-report';
import { createDesktopHarness, STORAGE_KEY, waitFor } from '../lib/desktop/desktop-test-helpers.ts';

const execFileAsync = promisify(execFile);
const e2eRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(e2eRoot);
const toolsPackDir = resolveFromWorkspace(process.env.OD_PACKAGED_E2E_TOOLS_PACK_DIR ?? '.tmp/tools-pack');
const namespace = process.env.OD_PACKAGED_E2E_NAMESPACE ?? 'release-beta';
const pnpmCommand = process.env.OD_E2E_PNPM_COMMAND ?? 'pnpm';
const screenshotPath = join(toolsPackDir, 'screenshots', `${namespace}.png`);

const outputNamespaceRoot = join(toolsPackDir, 'out', 'mac', 'namespaces', namespace);
const runtimeNamespaceRoot = join(toolsPackDir, 'runtime', 'mac', 'namespaces', namespace);
const healthExpression = `
  (async () => {
    const response = await fetch('/api/health');
    return {
      health: await response.json(),
      href: location.href,
      status: response.status,
      title: document.title,
    };
  })()
`;

type DesktopStatus = {
  state?: string;
  title?: string | null;
  url?: string | null;
  windowVisible?: boolean;
};

type MacInstallResult = {
  detached: boolean;
  dmgPath: string;
  installedAppPath: string;
  mountPoint: string;
  namespace: string;
};

type MacStartResult = {
  appPath: string;
  executablePath: string;
  logPath: string;
  namespace: string;
  pid: number;
  source: string;
  status: DesktopStatus | null;
};

type MacStopResult = {
  namespace: string;
  remainingPids: number[];
  status: string;
};

type MacUninstallResult = {
  installedAppPath: string;
  namespace: string;
  removed: boolean;
  stop: MacStopResult;
};

type MacInspectResult = {
  eval?: {
    error?: string;
    ok: boolean;
    value?: unknown;
  };
  screenshot?: {
    path: string;
  };
  status: DesktopStatus | null;
};

type LogsResult = {
  logs: Record<string, { lines: string[]; logPath: string }>;
  namespace: string;
};

type HealthEvalValue = {
  health: {
    ok?: unknown;
    service?: unknown;
    version?: unknown;
  };
  href: string;
  status: number;
  title: string;
};

const shouldRunPackagedMacSmoke = process.platform === 'darwin' && process.env.OD_PACKAGED_E2E_MAC === '1';
const macDescribe = shouldRunPackagedMacSmoke ? describe : describe.skip;
const shouldRunDesktopMacSmoke = process.platform === 'darwin' && process.env.OD_DESKTOP_SMOKE === '1';
const desktopMacDescribe = shouldRunDesktopMacSmoke ? describe : describe.skip;

macDescribe('packaged mac runtime smoke', () => {
  let installedAppPath: string | null = null;
  let started = false;

  test('installs, starts, inspects, stops, and uninstalls the built mac artifact', async () => {
    const report = await createPackagedSmokeReport('mac');
    let passed = false;
    try {
      const install = await runToolsPackJson<MacInstallResult>('install');
      installedAppPath = install.installedAppPath;

      expect(install.namespace).toBe(namespace);
      expect(install.detached).toBe(true);
      expectPathInside(install.dmgPath, join(outputNamespaceRoot, 'dmg'));
      expectPathInside(install.installedAppPath, join(outputNamespaceRoot, 'install', 'Applications'));

      const start = await runToolsPackJson<MacStartResult>('start');
      started = true;

      expect(start.namespace).toBe(namespace);
      expect(start.source).toBe('installed');
      expect(start.appPath).toBe(install.installedAppPath);
      expectPathInside(start.logPath, join(runtimeNamespaceRoot, 'logs', 'desktop'));
      expect(start.pid).toBeGreaterThan(0);
      // `tools-pack mac start` performs a best-effort status probe before
      // returning, but GitHub's macOS runners can take longer than that probe
      // window to make the packaged desktop IPC-ready. Keep validating a
      // non-null immediate status when available, then use the longer health
      // polling below as the authoritative startup check.
      if (start.status != null) {
        expect(start.status.state).toBe('running');
      }

      const inspect = await waitForHealthyDesktop();
      expect(inspect.status?.state).toBe('running');
      expect(inspect.status?.url).toMatch(/^(od:\/\/app\/|http:\/\/127\.0\.0\.1:\d+\/)/);

      const value = assertHealthEvalValue(inspect.eval?.value);
      expect(value.href).toMatch(/^(od:\/\/app\/|http:\/\/127\.0\.0\.1:\d+\/)/);
      expect(value.status).toBe(200);
      expect(value.health.ok).toBe(true);
      expect(value.health.version).toEqual(expect.any(String));

      await mkdir(dirname(screenshotPath), { recursive: true });
      const screenshot = await runToolsPackJson<MacInspectResult>('inspect', ['--path', screenshotPath]);
      expect(screenshot.screenshot?.path).toBe(screenshotPath);
      expect(await fileSizeBytes(screenshotPath)).toBeGreaterThan(0);
      await report.saveScreenshot(screenshotPath);

      const logs = await runToolsPackJson<LogsResult>('logs');
      assertLogPathsAndContent(logs);

      const stop = await runToolsPackJson<MacStopResult>('stop');
      started = false;
      expect(stop.namespace).toBe(namespace);
      expect(stop.status).not.toBe('partial');
      expect(stop.remainingPids).toEqual([]);

      const uninstall = await runToolsPackJson<MacUninstallResult>('uninstall');
      installedAppPath = null;
      expect(uninstall.namespace).toBe(namespace);
      expect(uninstall.installedAppPath).toBe(install.installedAppPath);
      expect(uninstall.removed).toBe(true);
      expect(await pathExists(install.installedAppPath)).toBe(false);
      await report.saveSummary({
        health: value,
        install: {
          detached: install.detached,
          dmgPath: install.dmgPath,
          installedAppPath: install.installedAppPath,
          mountPoint: install.mountPoint,
        },
        logs: summarizeLogs(logs),
        namespace,
        screenshot: report.screenshotRelpath,
        start: {
          appPath: start.appPath,
          executablePath: start.executablePath,
          logPath: start.logPath,
          pid: start.pid,
          source: start.source,
          status: start.status,
        },
        stop,
        uninstall,
      });
      passed = true;
    } finally {
      if (!passed) {
        await printPackagedLogs().catch((error: unknown) => {
          console.error('failed to read packaged mac logs after failure', error);
        });
      }

      if (started || installedAppPath != null) {
        await runToolsPackJson<MacUninstallResult>('uninstall').catch((error: unknown) => {
          console.error('failed to uninstall packaged mac app during cleanup', error);
        });
        started = false;
        installedAppPath = null;
      }
    }
  }, 180_000);
});

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
      model: 'deepseek-chat',
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
      expect(snapshot.model).toBe('deepseek-chat');
    });
  }, 45_000);

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
      theme: 'system',
    }, 'theme');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Appearance');
    await clickDesktopSegmentButton(desktop, 'Dark');

    await waitFor(async () => {
      const snapshot = await readDesktopAppearanceSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(true);
      expect(snapshot.activeTheme).toBe('Dark');
      expect(snapshot.documentTheme).toBe('dark');
      expect(snapshot.savedTheme).toBe('system');
    });

    await clickDesktopSettingsFooterButton(desktop, 'primary');

    await waitFor(async () => {
      const snapshot = await readDesktopAppearanceSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(false);
      expect(snapshot.documentTheme).toBe('dark');
      expect(snapshot.savedTheme).toBe('dark');
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
      model: 'deepseek-chat',
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
      expect(snapshot.model).toBe('deepseek-chat');
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
      expect(snapshot.model).toBe('deepseek-chat');
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

  test('opens the Orbit section from the desktop shell and renders its primary surface', async () => {
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
      orbit: {
        enabled: false,
        time: '09:00',
        templateSkillId: 'orbit-general',
      },
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      theme: 'system',
    }, 'model');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Orbit');

    await waitFor(async () => {
      const snapshot = await readDesktopOrbitSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(true);
      expect(snapshot.heading).toBe('Orbit');
      expect(snapshot.sectionTitle).toBe('Orbit');
      expect(snapshot.runButtonVisible).toBe(true);
      expect(snapshot.gateVisible || snapshot.automationCardVisible).toBe(true);
    });
  }, 45_000);

  test('renders the Orbit Open artifact link as a desktop new-tab link when a live artifact target exists', async () => {
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
      orbit: {
        enabled: false,
        time: '09:00',
        templateSkillId: 'orbit-general',
      },
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      theme: 'system',
    }, 'model');

    await desktop.eval(`
      (() => {
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
          const url = typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
          if (url === '/api/orbit/status') {
            return new Response(JSON.stringify({
              running: false,
              nextRunAt: null,
              lastRun: {
                completedAt: '2026-05-06T10:00:00.000Z',
                trigger: 'manual',
                templateSkillId: 'orbit-general',
                connectorsChecked: 5,
                connectorsSucceeded: 3,
                connectorsSkipped: 2,
                connectorsFailed: 0,
                markdown: 'General latest summary',
                artifactId: 'artifact-123',
                artifactProjectId: 'project-456',
              },
              lastRunsByTemplate: {
                'orbit-general': {
                  completedAt: '2026-05-06T10:00:00.000Z',
                  trigger: 'manual',
                  templateSkillId: 'orbit-general',
                  connectorsChecked: 5,
                  connectorsSucceeded: 3,
                  connectorsSkipped: 2,
                  connectorsFailed: 0,
                  markdown: 'General latest summary',
                  artifactId: 'artifact-123',
                  artifactProjectId: 'project-456',
                },
              },
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return originalFetch(input, init);
        };
        return true;
      })()
    `);

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Orbit');

    await waitFor(async () => {
      const snapshot = await readDesktopOrbitSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(true);
      expect(snapshot.heading).toBe('Orbit');
      expect(snapshot.sectionTitle).toBe('Orbit');
      expect(snapshot.openArtifactHref).toBe('/api/live-artifacts/artifact-123/preview?projectId=project-456');
      expect(snapshot.openArtifactTarget).toBe('_blank');
      expect(snapshot.openArtifactRel).toContain('noreferrer');
    });
  }, 45_000);

  test('clicking the Orbit Open artifact link keeps the desktop settings dialog stable', async () => {
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
      orbit: {
        enabled: false,
        time: '09:00',
        templateSkillId: 'orbit-general',
      },
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      theme: 'system',
    }, 'model');

    await desktop.eval(`
      (() => {
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
          const url = typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
          if (url === '/api/orbit/status') {
            return new Response(JSON.stringify({
              running: false,
              nextRunAt: null,
              lastRun: {
                completedAt: '2026-05-06T10:00:00.000Z',
                trigger: 'manual',
                templateSkillId: 'orbit-general',
                connectorsChecked: 5,
                connectorsSucceeded: 3,
                connectorsSkipped: 2,
                connectorsFailed: 0,
                markdown: 'General latest summary',
                artifactId: 'artifact-123',
                artifactProjectId: 'project-456',
              },
              lastRunsByTemplate: {
                'orbit-general': {
                  completedAt: '2026-05-06T10:00:00.000Z',
                  trigger: 'manual',
                  templateSkillId: 'orbit-general',
                  connectorsChecked: 5,
                  connectorsSucceeded: 3,
                  connectorsSkipped: 2,
                  connectorsFailed: 0,
                  markdown: 'General latest summary',
                  artifactId: 'artifact-123',
                  artifactProjectId: 'project-456',
                },
              },
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return originalFetch(input, init);
        };
        window.__odLastOpenArtifactHref = null;
        window.__odOpenArtifactClickCount = 0;
        if (!window.__odOpenArtifactClickCaptureInstalled) {
          document.addEventListener('click', (event) => {
            const target = event.target instanceof Element ? event.target.closest('a') : null;
            if (!(target instanceof HTMLAnchorElement)) return;
            if (target.textContent?.trim() !== 'Open artifact') return;
            window.__odLastOpenArtifactHref = target.getAttribute('href');
            window.__odOpenArtifactClickCount += 1;
            event.preventDefault();
          }, true);
          window.__odOpenArtifactClickCaptureInstalled = true;
        }
        return true;
      })()
    `);

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Orbit');

    await waitFor(async () => {
      const snapshot = await readDesktopOrbitSnapshot(desktop);
      expect(snapshot.openArtifactHref).toBe('/api/live-artifacts/artifact-123/preview?projectId=project-456');
    });

    const clicked = await desktop.eval<boolean>(`
      (() => {
        const link = Array.from(document.querySelectorAll('a'))
          .find((node) => node.textContent?.trim() === 'Open artifact');
        if (!(link instanceof HTMLAnchorElement)) return false;
        link.click();
        return true;
      })()
    `);
    expect(clicked).toBe(true);

    await waitFor(async () => {
      const snapshot = await readDesktopOrbitSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(true);
      expect(snapshot.heading).toBe('Orbit');
      expect(snapshot.sectionTitle).toBe('Orbit');
      expect(snapshot.openArtifactHref).toBe('/api/live-artifacts/artifact-123/preview?projectId=project-456');
    });

    const clickCapture = await desktop.eval<{ count: number; href: string | null }>(`
      (() => ({
        count: typeof window.__odOpenArtifactClickCount === 'number' ? window.__odOpenArtifactClickCount : 0,
        href: typeof window.__odLastOpenArtifactHref === 'string' ? window.__odLastOpenArtifactHref : null,
      }))()
    `);
    expect(clickCapture.count).toBeGreaterThan(0);
    expect(clickCapture.href).toBe('/api/live-artifacts/artifact-123/preview?projectId=project-456');
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

  test('routes the Orbit gate CTA to the Connectors section inside the desktop shell', async () => {
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
      composio: { apiKeyConfigured: false },
      orbit: {
        enabled: false,
        time: '09:00',
        templateSkillId: 'orbit-general',
      },
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      theme: 'system',
    }, 'model');

    await desktop.openSettings();
    await openDesktopSettingsSection(desktop, 'Orbit');

    await waitFor(async () => {
      const snapshot = await readDesktopOrbitSnapshot(desktop);
      expect(snapshot.gateVisible).toBe(true);
    });

    const clicked = await desktop.eval<boolean>(`
      (() => {
        const action = document.querySelector('[data-testid="orbit-config-gate-action"]');
        if (!(action instanceof HTMLElement)) return false;
        action.click();
        return true;
      })()
    `);
    expect(clicked).toBe(true);

    await waitFor(async () => {
      const snapshot = await readDesktopConnectorsSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(true);
      expect(snapshot.heading).toBe('Connectors');
      expect(snapshot.sectionTitle).toBe('Connectors');
      expect(snapshot.apiKeyLabelVisible).toBe(true);
    });
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

  test('opens the Appearance section from the desktop shell and shows theme controls', async () => {
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
      expect(snapshot.systemVisible).toBe(true);
      expect(snapshot.lightVisible).toBe(true);
      expect(snapshot.darkVisible).toBe(true);
    });
  }, 45_000);
});

async function runToolsPackJson<T>(action: string, extraArgs: string[] = []): Promise<T> {
  const args = [
    'exec',
    'tools-pack',
    'mac',
    action,
    '--dir',
    toolsPackDir,
    '--namespace',
    namespace,
    '--json',
    ...extraArgs,
  ];
  const result = await execFileAsync(pnpmCommand, args, {
    cwd: workspaceRoot,
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  }).catch((error: unknown) => {
    if (isExecError(error)) {
      throw new Error(
        [
          `tools-pack mac ${action} failed`,
          `stdout:\n${error.stdout}`,
          `stderr:\n${error.stderr}`,
        ].join('\n'),
      );
    }
    throw error;
  });

  try {
    return JSON.parse(result.stdout) as T;
  } catch (error) {
    throw new Error(`tools-pack mac ${action} did not print JSON: ${String(error)}\n${result.stdout}`);
  }
}

type DesktopHarness = ReturnType<typeof createDesktopHarness>;

type DesktopSettingsSnapshot = {
  baseUrl: string | null;
  dialogOpen: boolean;
  heading: string | null;
  model: string | null;
  quickFillProvider: string | null;
  selectedProtocol: string | null;
};

type DesktopLocalCliSnapshot = {
  codexExecutablePath: string | null;
  codexHome: string | null;
  dialogOpen: boolean;
  heading: string | null;
  localCliTabSelected: boolean;
  selectedAgent: string | null;
};

type DesktopAppearanceSnapshot = {
  activeTheme: string | null;
  dialogOpen: boolean;
  documentTheme: string | null;
  savedTheme: string | null;
};

type DesktopConnectorsSnapshot = {
  apiKeyLabelVisible: boolean;
  dialogOpen: boolean;
  drawerTitle: string | null;
  drawerVisible: boolean;
  gateVisible: boolean;
  gridVisible: boolean;
  heading: string | null;
  sectionTitle: string | null;
};

type DesktopOrbitSnapshot = {
  automationCardVisible: boolean;
  dialogOpen: boolean;
  gateVisible: boolean;
  heading: string | null;
  openArtifactHref: string | null;
  openArtifactRel: string | null;
  openArtifactTarget: string | null;
  runButtonVisible: boolean;
  sectionTitle: string | null;
};

type DesktopMediaSnapshot = {
  dialogOpen: boolean;
  heading: string | null;
  providerCardCount: number;
  reloadVisible: boolean;
  sectionTitle: string | null;
};

type DesktopAboutSnapshot = {
  aboutListVisible: boolean;
  dialogOpen: boolean;
  heading: string | null;
  sectionTitle: string | null;
  versionUnavailableVisible: boolean;
};

type DesktopAppearanceSectionSnapshot = {
  darkVisible: boolean;
  dialogOpen: boolean;
  heading: string | null;
  lightVisible: boolean;
  sectionTitle: string | null;
  systemVisible: boolean;
};

type DesktopArtifactOpenSnapshot = {
  artifactPreviewVisible: boolean;
  fileWorkspaceVisible: boolean;
  openHref: string | null;
  openRel: string | null;
  openTarget: string | null;
  selectedTab: string | null;
};

async function seedDesktopConfig(
  desktop: DesktopHarness,
  config: Record<string, unknown>,
  stableField: string,
): Promise<void> {
  await desktop.seedConfigAndReload(config, stableField);
}

async function openDesktopSettingsSection(
  desktop: DesktopHarness,
  label: string,
): Promise<void> {
  const clicked = await desktop.eval<boolean>(`
    (() => {
      const section = Array.from(document.querySelectorAll('[role="dialog"] button'))
        .find((node) => node.textContent?.includes(${JSON.stringify(label)}));
      if (!(section instanceof HTMLElement)) return false;
      section.click();
      return true;
    })()
  `);
  expect(clicked).toBe(true);
}

async function clickDesktopProtocolTab(
  desktop: DesktopHarness,
  label: 'Anthropic' | 'OpenAI',
): Promise<void> {
  const clicked = await desktop.eval<boolean>(`
    (() => {
      const protocolTabs = Array.from(document.querySelectorAll('[role="tablist"]'))
        .find((node) => node.getAttribute('aria-label') === 'API protocol');
      const tab = Array.from(protocolTabs?.querySelectorAll('[role="tab"]') ?? [])
        .find((node) => node.textContent?.trim() === ${JSON.stringify(label)});
      if (!(tab instanceof HTMLElement)) return false;
      tab.click();
      return true;
    })()
  `);
  expect(clicked).toBe(true);
}

async function clickDesktopExecutionModeTab(
  desktop: DesktopHarness,
  label: 'BYOK' | 'Local CLI',
): Promise<void> {
  const clicked = await desktop.eval<boolean>(`
    (() => {
      const modeTabs = Array.from(document.querySelectorAll('[role="tablist"]'))
        .find((node) => {
          const labels = Array.from(node.querySelectorAll('[role="tab"]'))
            .map((tab) => tab.textContent?.trim() ?? '');
          return labels.some((text) => text.startsWith('BYOK')) &&
            labels.some((text) => text.startsWith('Local CLI'));
        });
      const tab = Array.from(modeTabs?.querySelectorAll('[role="tab"]') ?? [])
        .find((node) => node.textContent?.trim().startsWith(${JSON.stringify(label)}));
      if (!(tab instanceof HTMLElement)) return false;
      tab.click();
      return true;
    })()
  `);
  expect(clicked).toBe(true);
}

async function clickDesktopSegmentButton(
  desktop: DesktopHarness,
  label: string,
): Promise<void> {
  const clicked = await desktop.eval<boolean>(`
    (() => {
      const button = Array.from(document.querySelectorAll('[role="dialog"] button'))
        .find((node) => node.textContent?.trim() === ${JSON.stringify(label)});
      if (!(button instanceof HTMLElement)) return false;
      button.click();
      return true;
    })()
  `);
  expect(clicked).toBe(true);
}

async function clickDesktopSettingsFooterButton(
  desktop: DesktopHarness,
  className: 'ghost' | 'primary',
): Promise<void> {
  const clicked = await desktop.eval<boolean>(`
    (() => {
      const footerButton = document.querySelector('.modal-foot button.${className}');
      if (!(footerButton instanceof HTMLElement)) return false;
      footerButton.click();
      return true;
    })()
  `);
  expect(clicked).toBe(true);
}

async function readDesktopSettingsSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopSettingsSnapshot> {
  return await desktop.eval<DesktopSettingsSnapshot>(`
    (() => {
      const labelFields = Array.from(document.querySelectorAll('[role="dialog"] label.field'));
      const getField = (label) => {
        const field = labelFields.find((node) =>
          node.querySelector('.field-label')?.textContent?.trim() === label,
        );
        if (!field) return null;
        const control = field.querySelector('input, select, textarea');
        if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) {
          return null;
        }
        if (control instanceof HTMLSelectElement) {
          return control.selectedOptions.item(0)?.textContent?.trim() ?? control.value;
        }
        return control.value;
      };
      const activeProtocol = Array.from(document.querySelectorAll('[role="tablist"][aria-label="API protocol"] [role="tab"]'))
        .find((node) => node.getAttribute('aria-selected') === 'true');
      const protocolText = activeProtocol?.textContent?.trim() ?? null;

      return {
        baseUrl: getField('Base URL'),
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? null,
        model: getField('Model'),
        quickFillProvider: getField('Quick fill provider'),
        selectedProtocol: protocolText === 'OpenAI' || protocolText === 'Anthropic'
          ? protocolText + ' API'
          : protocolText,
      };
    })()
  `);
}

async function readDesktopAppearanceSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopAppearanceSnapshot> {
  return await desktop.eval<DesktopAppearanceSnapshot>(`
    (() => {
      const raw = window.localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
      const config = raw ? JSON.parse(raw) : {};
      const activeButton = Array.from(document.querySelectorAll('[role="dialog"] button[aria-pressed="true"]'))
        .find((node) => ['Light', 'Dark', 'System'].includes(node.textContent?.trim() ?? ''));

      return {
        activeTheme: activeButton?.textContent?.trim() ?? null,
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        documentTheme: document.documentElement.getAttribute('data-theme'),
        savedTheme: typeof config.theme === 'string' ? config.theme : null,
      };
    })()
  `);
}

async function readDesktopConnectorsSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopConnectorsSnapshot> {
  return await desktop.eval<DesktopConnectorsSnapshot>(`
    (() => {
      const fieldLabels = Array.from(document.querySelectorAll('[role="dialog"] .field-label'))
        .map((node) => node.textContent?.trim() ?? '');
      const sectionTitle = document.querySelector('.settings-section-connectors .section-head h3')
        ?.textContent?.trim() ?? null;
      const drawerTitle = document.querySelector('[data-testid="connector-drawer"] h2')
        ?.textContent?.trim() ?? null;
      return {
        apiKeyLabelVisible: fieldLabels.includes('Composio API Key'),
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        drawerTitle,
        drawerVisible: Boolean(document.querySelector('[data-testid="connector-drawer"]')),
        gateVisible: Boolean(document.querySelector('[data-testid="connector-gate"]')),
        gridVisible: Boolean(document.querySelector('[data-testid="connector-grid-wrap"]')),
        heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? null,
        sectionTitle,
      };
    })()
  `);
}

async function readDesktopOrbitSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopOrbitSnapshot> {
  return await desktop.eval<DesktopOrbitSnapshot>(`
    (() => {
      const sectionTitle = document.querySelector('.orbit-section .orbit-hero-title')
        ?.textContent?.trim() ?? null;
      const openArtifactLink = Array.from(document.querySelectorAll('a'))
        .find((node) => node.textContent?.trim() === 'Open artifact');
      return {
        automationCardVisible: Boolean(document.querySelector('[data-testid="orbit-automation-card"]')),
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        gateVisible: Boolean(document.querySelector('[data-testid="orbit-config-gate"]')),
        heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? null,
        openArtifactHref: openArtifactLink?.getAttribute('href') ?? null,
        openArtifactRel: openArtifactLink?.getAttribute('rel') ?? null,
        openArtifactTarget: openArtifactLink?.getAttribute('target') ?? null,
        runButtonVisible: Boolean(Array.from(document.querySelectorAll('button'))
          .find((node) => node.textContent?.trim() === 'Run it now')),
        sectionTitle,
      };
    })()
  `);
}

async function readDesktopMediaSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopMediaSnapshot> {
  return await desktop.eval<DesktopMediaSnapshot>(`
    (() => {
      const sectionTitle = document.querySelector('.settings-section .section-head h3')
        ?.textContent?.trim() ?? null;
      return {
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? null,
        providerCardCount: document.querySelectorAll('.settings-provider-card').length,
        reloadVisible: Boolean(Array.from(document.querySelectorAll('button'))
          .find((node) => node.textContent?.trim() === 'Reload from daemon')),
        sectionTitle,
      };
    })()
  `);
}

async function readDesktopAboutSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopAboutSnapshot> {
  return await desktop.eval<DesktopAboutSnapshot>(`
    (() => {
      const sectionTitle = document.querySelector('.settings-section .section-head h3')
        ?.textContent?.trim() ?? null;
      const emptyCards = Array.from(document.querySelectorAll('.settings-section .empty-card'))
        .map((node) => node.textContent?.trim() ?? '');
      return {
        aboutListVisible: Boolean(document.querySelector('.settings-about-list')),
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? null,
        sectionTitle,
        versionUnavailableVisible: emptyCards.includes('Version details are unavailable while the daemon is offline.'),
      };
    })()
  `);
}

async function readDesktopAppearanceSectionSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopAppearanceSectionSnapshot> {
  return await desktop.eval<DesktopAppearanceSectionSnapshot>(`
    (() => {
      const sectionTitle = document.querySelector('.settings-section .section-head h3')
        ?.textContent?.trim() ?? null;
      const labels = Array.from(document.querySelectorAll('.seg-control .seg-title'))
        .map((node) => node.textContent?.trim() ?? '');
      return {
        darkVisible: labels.includes('Dark'),
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? null,
        lightVisible: labels.includes('Light'),
        sectionTitle,
        systemVisible: labels.includes('System'),
      };
    })()
  `);
}

async function readDesktopArtifactOpenSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopArtifactOpenSnapshot> {
  return await desktop.eval<DesktopArtifactOpenSnapshot>(`
    (() => {
      const openLink = Array.from(document.querySelectorAll('a'))
        .find((node) => node.textContent?.trim() === 'Open');
      const activeTab = Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"]'))
        .map((node) => node.textContent?.trim())
        .find((value) => typeof value === 'string') ?? null;
      return {
        artifactPreviewVisible: Boolean(document.querySelector('[data-testid="artifact-preview-frame"]')),
        fileWorkspaceVisible: Boolean(document.querySelector('[data-testid="file-workspace"]')),
        openHref: openLink?.getAttribute('href') ?? null,
        openRel: openLink?.getAttribute('rel') ?? null,
        openTarget: openLink?.getAttribute('target') ?? null,
        selectedTab: activeTab,
      };
    })()
  `);
}

async function readDesktopLocalCliSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopLocalCliSnapshot> {
  return await desktop.eval<DesktopLocalCliSnapshot>(`
    (() => {
      const labelFields = Array.from(document.querySelectorAll('[role="dialog"] label.field'));
      const getField = (label) => {
        const field = labelFields.find((node) =>
          node.querySelector('.field-label')?.textContent?.trim() === label,
        );
        if (!field) return null;
        const control = field.querySelector('input');
        return control instanceof HTMLInputElement ? control.value : null;
      };
      const localCliTab = Array.from(document.querySelectorAll('[role="tab"]'))
        .find((node) => node.textContent?.trim().startsWith('Local CLI'));
      const selectedAgent = Array.from(document.querySelectorAll('.agent-card.active .agent-card-name'))
        .map((node) => node.textContent?.trim())
        .find((value) => typeof value === 'string') ?? null;

      return {
        codexExecutablePath: getField('Codex executable path'),
        codexHome: getField('Codex home'),
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? null,
        localCliTabSelected: localCliTab?.getAttribute('aria-selected') === 'true',
        selectedAgent,
      };
    })()
  `);
}

async function waitForHealthyDesktop(): Promise<MacInspectResult> {
  const timeoutMs = 90_000;
  const startedAt = Date.now();
  let lastResult: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const inspect = await runToolsPackJson<MacInspectResult>('inspect', ['--expr', healthExpression]);
      lastResult = inspect;
      if (inspect.status?.state === 'running' && inspect.eval?.ok === true) {
        const value = asHealthEvalValue(inspect.eval.value);
        if (value?.status === 200 && value.health.ok === true && typeof value.health.version === 'string') {
          return inspect;
        }
      }
    } catch (error) {
      lastResult = error;
    }
    await delay(1000);
  }

  throw new Error(`packaged mac runtime did not become healthy: ${formatUnknown(lastResult)}`);
}

function assertLogPathsAndContent(result: LogsResult): void {
  expect(result.namespace).toBe(namespace);
  for (const app of ['desktop', 'web', 'daemon']) {
    const entry = result.logs[app];
    if (entry == null) {
      throw new Error(`expected ${app} log entry`);
    }
    expectPathInside(entry.logPath, join(runtimeNamespaceRoot, 'logs', app));
  }

  const combined = Object.values(result.logs)
    .flatMap((entry) => entry.lines)
    .join('\n');
  expect(combined).not.toMatch(/ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING/);
  expect(combined).not.toMatch(/packaged runtime failed/i);
}

function summarizeLogs(result: LogsResult): Record<string, { lineCount: number; logPath: string }> {
  return Object.fromEntries(
    Object.entries(result.logs).map(([app, entry]) => [
      app,
      {
        lineCount: entry.lines.length,
        logPath: entry.logPath,
      },
    ]),
  );
}

async function printPackagedLogs(): Promise<void> {
  const result = await runToolsPackJson<LogsResult>('logs');
  for (const [app, entry] of Object.entries(result.logs)) {
    console.error(`[${app}] ${entry.logPath}`);
    console.error(entry.lines.join('\n') || '(no log lines)');
  }
}

function assertHealthEvalValue(value: unknown): HealthEvalValue {
  const normalized = asHealthEvalValue(value);
  if (normalized == null) {
    throw new Error(`unexpected health eval value: ${formatUnknown(value)}`);
  }
  return normalized;
}

function asHealthEvalValue(value: unknown): HealthEvalValue | null {
  if (!isRecord(value)) return null;
  if (typeof value.href !== 'string' || typeof value.status !== 'number' || typeof value.title !== 'string') return null;
  if (!isRecord(value.health)) return null;
  return value as HealthEvalValue;
}

function expectPathInside(filePath: string, expectedRoot: string): void {
  const normalizedPath = resolve(filePath);
  const normalizedRoot = resolve(expectedRoot);
  expect(
    normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${sep}`),
    `${normalizedPath} should be inside ${normalizedRoot}`,
  ).toBe(true);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fileSizeBytes(filePath: string): Promise<number> {
  return (await stat(filePath)).size;
}

function resolveFromWorkspace(filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(workspaceRoot, filePath);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function isExecError(value: unknown): value is { stderr: string; stdout: string } {
  return isRecord(value) && typeof value.stdout === 'string' && typeof value.stderr === 'string';
}

function formatUnknown(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
