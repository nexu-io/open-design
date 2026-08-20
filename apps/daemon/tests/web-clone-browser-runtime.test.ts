import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const loaderPath = path.join(
  repoRoot,
  'skills/web-clone/scripts/lib/playwright-loader.mjs',
);
const systemBrowserPath = path.join(
  repoRoot,
  'skills/web-clone/scripts/lib/system-browser.mjs',
);
const skillPath = path.join(repoRoot, 'skills/web-clone/SKILL.md');
const reconPath = path.join(repoRoot, 'skills/web-clone/scripts/recon-site.mjs');

const tempDirs: string[] = [];

function fresh(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'od-web-clone-browser-runtime-'));
  tempDirs.push(root);
  return root;
}

async function importLoader() {
  const url = `${pathToFileURL(loaderPath).href}?test=${Date.now()}-${Math.random()}`;
  return import(url) as Promise<{
    loadPlaywright: () => { chromium?: { source?: string; launch?: (...args: unknown[]) => unknown } };
    findSystemChromiumExecutable: (options: unknown) => string | null;
    launchChromium: (
      chromium: {
        launch: (options: unknown) => Promise<unknown>;
        connectOverDaemon?: (options: unknown) => Promise<unknown>;
      },
      options?: unknown,
    ) => Promise<unknown>;
  }>;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of tempDirs.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

// Website Clone is a primary generation path from both the web UI and `od` CLI.
// Agent subprocesses run inside a sandbox that may not be allowed to spawn Chrome,
// so these tests pin the self-contained adapter and the daemon-owned browser broker.
// A regression here previously made a normal clone spend minutes installing
// Playwright in the user's project before eventually timing out.
describe('Website Clone main-path browser runtime', () => {
  it('loads the daemon-injected browser-control package before local dependencies', async () => {
    const root = fresh();
    const fakePackage = path.join(root, 'playwright-core.cjs');
    writeFileSync(fakePackage, 'module.exports = { chromium: { source: "injected" } };\n');
    vi.stubEnv('OD_PLAYWRIGHT_PACKAGE', fakePackage);

    const { loadPlaywright } = await importLoader();

    expect(loadPlaywright().chromium?.source).toBe('injected');
  });

  it('keeps the staged skill self-contained when no Playwright package exists', async () => {
    const previousCwd = process.cwd();
    const root = fresh();
    vi.stubEnv('OD_PLAYWRIGHT_PACKAGE', '');
    vi.stubEnv('OD_PLAYWRIGHT_PATH', '');
    process.chdir(root);
    try {
      const { loadPlaywright } = await importLoader();
      expect(loadPlaywright().chromium?.launch).toBeTypeOf('function');
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('launches an explicitly selected system browser without downloading one', async () => {
    const root = fresh();
    const browserExecutable = path.join(root, 'chrome');
    writeFileSync(browserExecutable, '#!/bin/sh\nexit 0\n');
    chmodSync(browserExecutable, 0o755);
    const launch = vi.fn().mockResolvedValue({ close: vi.fn() });
    const { launchChromium } = await importLoader();

    await launchChromium(
      { launch },
      {
        discovery: {
          platform: 'linux',
          env: { OD_BROWSER_EXECUTABLE_PATH: browserExecutable, PATH: '' },
          homeDir: root,
        },
      },
    );

    expect(launch).toHaveBeenCalledOnce();
    expect(launch).toHaveBeenCalledWith({
      headless: true,
      executablePath: browserExecutable,
    });
  });

  it('uses the daemon broker before attempting Chrome inside the agent sandbox', async () => {
    vi.stubEnv('OD_DAEMON_URL', 'http://127.0.0.1:7456');
    vi.stubEnv('OD_PROJECT_ID', 'project-1');
    const browser = { close: vi.fn() };
    const connectOverDaemon = vi.fn().mockResolvedValue(browser);
    const launch = vi.fn();
    const { launchChromium } = await importLoader();

    await expect(launchChromium({ launch, connectOverDaemon })).resolves.toBe(browser);
    expect(connectOverDaemon).toHaveBeenCalledWith({
      daemonUrl: 'http://127.0.0.1:7456',
      projectId: 'project-1',
    });
    expect(launch).not.toHaveBeenCalled();
  });

  it('keeps daemon brokering authoritative when source Playwright is visible in CI', async () => {
    vi.stubEnv('OD_DAEMON_URL', 'http://127.0.0.1:7456');
    vi.stubEnv('OD_PROJECT_ID', 'project-ci');
    const browser = { close: vi.fn() };
    const systemBrowser = await import(pathToFileURL(systemBrowserPath).href) as {
      systemChromium: {
        connectOverDaemon: (options: unknown) => Promise<unknown>;
      };
    };
    const connectOverDaemon = vi
      .spyOn(systemBrowser.systemChromium, 'connectOverDaemon')
      .mockResolvedValue(browser);
    const localPlaywrightLaunch = vi.fn();
    const { launchChromium } = await importLoader();

    await expect(launchChromium({ launch: localPlaywrightLaunch })).resolves.toBe(browser);
    expect(connectOverDaemon).toHaveBeenCalledWith({
      daemonUrl: 'http://127.0.0.1:7456',
      projectId: 'project-ci',
    });
    expect(localPlaywrightLaunch).not.toHaveBeenCalled();
  });

  it('keeps full-page screenshots at the requested viewport width with Linux scrollbars', async () => {
    const systemBrowser = await import(pathToFileURL(systemBrowserPath).href) as {
      fullPageScreenshotClip: (
        metrics: { cssContentSize: { height: number; width: number } },
        viewport: { height: number; width: number },
      ) => { height: number; width: number };
    };

    expect(systemBrowser.fullPageScreenshotClip(
      { cssContentSize: { width: 1425, height: 2100 } },
      { width: 1440, height: 900 },
    )).toMatchObject({ width: 1440, height: 2100 });
    expect(systemBrowser.fullPageScreenshotClip(
      { cssContentSize: { width: 1600, height: 700 } },
      { width: 1440, height: 900 },
    )).toMatchObject({ width: 1600, height: 900 });
  });

  it('forbids project-local Playwright installation and documents navigation timeout separately', () => {
    const skill = readFileSync(skillPath, 'utf8');
    const recon = readFileSync(reconPath, 'utf8');

    expect(skill).toContain('基于 Chrome DevTools Protocol 的零依赖控制层');
    expect(skill).toContain('无需启动 Electron 客户端');
    expect(skill).toContain('Agent 沙箱内会通过本地 daemon');
    expect(skill).toContain('禁止在用户项目里执行 `npm install playwright` 或下载 Chromium');
    expect(skill).not.toContain('npm install -D playwright');
    expect(skill).not.toContain('npx playwright install chromium');
    expect(skill).toContain('`--wait` 仅表示页面导航完成后的额外稳定等待');
    expect(recon).toContain('--navigation-timeout 45000');
  });
});
