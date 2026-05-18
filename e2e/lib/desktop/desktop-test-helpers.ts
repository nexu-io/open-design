import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = resolveRepoRoot(__dirname);
const screenshotDir = path.join(os.tmpdir(), 'open-design-e2e-screenshots');

export const STORAGE_KEY = 'open-design:config';

export type DesktopStatus = {
  pid?: number;
  state: 'idle' | 'running' | 'unknown';
  title?: string | null;
  updatedAt?: string;
  url?: string | null;
  windowVisible?: boolean;
};

type DesktopEvalResult = {
  ok: boolean;
  value?: unknown;
  error?: string;
};

function resolveRepoRoot(startDir: string): string {
  let currentDir = startDir;
  while (true) {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error(`Unable to locate repo root from ${startDir}.`);
    }
    currentDir = parentDir;
  }
}

export function createDesktopHarness(name: string) {
  const namespace = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    namespace,
    async start() {
      await runToolsDev(['start', '--namespace', namespace]);
      await waitFor(async () => {
        const status = await desktopStatus(namespace);
        assert.equal(status.state, 'running');
        assert.equal(status.windowVisible, true);
        assert.ok(status.url);
      }, 60_000);
    },
    async stop() {
      await runToolsDev(['stop', '--namespace', namespace]).catch(() => undefined);
    },
    async screenshot(fileName: string) {
      const outputPath = path.join(screenshotDir, `${fileName}.png`);
      await runToolsDev([
        'inspect',
        'desktop',
        'screenshot',
        '--namespace',
        namespace,
        '--path',
        outputPath,
      ]);
      return outputPath;
    },
    async eval<T = unknown>(expression: string): Promise<T> {
      const result = await runToolsDevJson<DesktopEvalResult>([
        'inspect',
        'desktop',
        'eval',
        '--namespace',
        namespace,
        '--expr',
        expression,
        '--json',
      ]);
      assert.equal(result.ok, true, result.error ?? 'desktop eval failed');
      return result.value as T;
    },
    async seedConfigAndReload(config: Record<string, unknown>, stableField: string) {
      const value = JSON.stringify(config);
      await this.eval(`
        (() => {
          window.localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(value)});
          window.location.reload();
          return true;
        })()
      `);

      await waitFor(async () => {
        const loaded = await this.eval(`
          (() => {
            const raw = window.localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
            return Boolean(raw && JSON.parse(raw)[${JSON.stringify(stableField)}] === ${JSON.stringify(config[stableField])});
          })()
        `);
        assert.equal(loaded, true);
      });
    },
    async openSettings() {
      await waitFor(async () => {
        const ready = await this.eval<boolean>(`
          (() => Boolean(
            document.querySelector('[role="dialog"]') ||
            document.querySelector('button[title="Execution mode"]') ||
            document.querySelector('.settings-icon-btn')
          ))()
        `);
        assert.equal(ready, true);
      });

      const clicked = await this.eval(`
        (() => {
          if (document.querySelector('[role="dialog"]')) return true;
          const homeButton = document.querySelector('button[title="Execution mode"]');
          if (homeButton instanceof HTMLElement) {
            homeButton.click();
            return true;
          }
          const projectButton = document.querySelector('.settings-icon-btn');
          if (projectButton instanceof HTMLElement) {
            projectButton.click();
            return true;
          }
          return false;
        })()
      `);
      assert.equal(clicked, true);

      await waitFor(async () => {
        const dialogOpen = await this.eval<boolean>(`
          (() => {
            const dialog = document.querySelector('[role="dialog"]');
            if (dialog) return true;
            const settingsItem = Array.from(document.querySelectorAll('.avatar-popover .avatar-item'))
              .find((node) => node.textContent?.trim() === 'Settings');
            if (!(settingsItem instanceof HTMLElement)) return false;
            settingsItem.click();
            return Boolean(document.querySelector('[role="dialog"]'));
          })()
        `);
        assert.equal(dialogOpen, true);
      });
    },
  };
}

export async function desktopStatus(namespace: string): Promise<DesktopStatus> {
  return await runToolsDevJson<DesktopStatus>([
    'inspect',
    'desktop',
    'status',
    '--namespace',
    namespace,
    '--json',
  ]);
}

export async function waitFor(
  fn: () => void | Promise<void>,
  timeoutMs = 20_000,
  intervalMs = 250,
): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await fn();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Timed out after ${timeoutMs}ms waiting for condition.`);
}

async function runToolsDev(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('pnpm', ['tools-dev', ...args], {
    cwd: repoRoot,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

async function runToolsDevJson<T>(args: string[]): Promise<T> {
  const stdout = await runToolsDev(args);
  const trimmed = stdout.trim();
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed) as T;
  }
  const jsonStart = stdout.lastIndexOf('\n{');
  if (jsonStart < 0) {
    throw new Error(`Expected JSON output from tools-dev, got: ${stdout}`);
  }
  return JSON.parse(stdout.slice(jsonStart + 1)) as T;
}
