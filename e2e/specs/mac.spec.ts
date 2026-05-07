// @vitest-environment node

import { execFile } from 'node:child_process';
import { access, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createDesktopHarness, STORAGE_KEY, waitFor } from '../lib/desktop/desktop-test-helpers.ts';

const execFileAsync = promisify(execFile);
const e2eRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(e2eRoot);
const toolsPackDir = resolveFromWorkspace(process.env.OD_PACKAGED_E2E_TOOLS_PACK_DIR ?? '.tmp/tools-pack');
const namespace = process.env.OD_PACKAGED_E2E_NAMESPACE ?? 'release-beta';
const pnpmCommand = process.env.OD_E2E_PNPM_COMMAND ?? 'pnpm';
const screenshotPath = resolveFromWorkspace(
  process.env.OD_PACKAGED_E2E_SCREENSHOT_PATH ?? join(toolsPackDir, 'screenshots', `${namespace}.png`),
);

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
      expect(start.status).not.toBeNull();
      expect(start.status?.state).toBe('running');

      const inspect = await waitForHealthyDesktop();
      expect(inspect.status?.state).toBe('running');
      expect(inspect.status?.url).toMatch(/^(od:\/\/app\/|http:\/\/127\.0\.0\.1:\d+\/)/);

      const value = assertHealthEvalValue(inspect.eval?.value);
      expect(value.href).toMatch(/^(od:\/\/app\/|http:\/\/127\.0\.0\.1:\d+\/)/);
      expect(value.status).toBe(200);
      expect(value.health.ok).toBe(true);
      expect(value.health.version).toEqual(expect.any(String));

      const screenshot = await runToolsPackJson<MacInspectResult>('inspect', ['--path', screenshotPath]);
      expect(screenshot.screenshot?.path).toBe(screenshotPath);
      expect(await fileSizeBytes(screenshotPath)).toBeGreaterThan(0);

      assertLogPathsAndContent(await runToolsPackJson<LogsResult>('logs'));

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
    await openDesktopSettingsSection(desktop, 'Configure execution mode');

    await waitFor(async () => {
      const snapshot = await readDesktopSettingsSnapshot(desktop);
      expect(snapshot.dialogOpen).toBe(true);
      expect(snapshot.heading).toBe('Execution & model');
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
    await openDesktopSettingsSection(desktop, 'Configure execution mode');

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

type DesktopAppearanceSnapshot = {
  activeTheme: string | null;
  dialogOpen: boolean;
  documentTheme: string | null;
  savedTheme: string | null;
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
