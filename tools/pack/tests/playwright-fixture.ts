import { chmod, lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import process from "node:process";

import { resolveDaemonPlaywrightChromiumExecutablePath } from "../src/resources.js";

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDaemonPlaywrightFixture(workspaceRoot: string): Promise<{
  cleanup: () => Promise<void>;
  executablePath: string;
  headlessSentinel: string;
  headedRoot: string;
  headlessRoot: string;
}> {
  const originalBrowsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  let temporaryBrowsersPath: string | null = null;
  let executablePath = resolveDaemonPlaywrightChromiumExecutablePath(workspaceRoot);
  let headedRoot = dirname(executablePath);
  while (!/^chromium-(\d+)$/i.test(basename(headedRoot))) {
    const parent = dirname(headedRoot);
    if (parent === headedRoot) {
      throw new Error(`tools-pack tests: unexpected Playwright Chromium root ${executablePath}`);
    }
    headedRoot = parent;
  }
  const revisionMatch = basename(headedRoot).match(/^chromium-(\d+)$/i);
  if (!revisionMatch) {
    throw new Error(`tools-pack tests: unexpected Playwright Chromium root ${headedRoot}`);
  }
  const revision = revisionMatch[1];
  let headlessRoot = join(dirname(headedRoot), `chromium_headless_shell-${revision}`);
  if (!(await pathExists(headedRoot))) {
    temporaryBrowsersPath = await mkdtemp(join(tmpdir(), "open-design-playwright-fixture-"));
    process.env.PLAYWRIGHT_BROWSERS_PATH = temporaryBrowsersPath;
    executablePath = resolveDaemonPlaywrightChromiumExecutablePath(workspaceRoot);
    headedRoot = dirname(executablePath);
    while (!/^chromium-(\d+)$/i.test(basename(headedRoot))) {
      const parent = dirname(headedRoot);
      if (parent === headedRoot) {
        throw new Error(`tools-pack tests: unexpected Playwright Chromium root ${executablePath}`);
      }
      headedRoot = parent;
    }
    headlessRoot = join(dirname(headedRoot), `chromium_headless_shell-${revision}`);
  }
  const chromeDir = dirname(executablePath);
  const headlessSentinel = join(headlessRoot, "HEADLESS_SENTINEL");
  if (!(await pathExists(headedRoot))) {
    await mkdir(chromeDir, { recursive: true });
    await writeFile(executablePath, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(executablePath, 0o755);
    await writeFile(join(chromeDir, "LICENSE"), "license\n", "utf8");
  }

  if (!(await pathExists(headlessRoot))) {
    await mkdir(headlessRoot, { recursive: true });
  }

  if (!(await pathExists(headlessSentinel))) {
    await writeFile(headlessSentinel, "headless shell\n", "utf8");
  }

  return {
    cleanup: async () => {
      if (temporaryBrowsersPath != null) {
        if (originalBrowsersPath == null) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
        else process.env.PLAYWRIGHT_BROWSERS_PATH = originalBrowsersPath;
        await rm(temporaryBrowsersPath, { force: true, recursive: true });
      }
    },
    executablePath,
    headlessSentinel,
    headedRoot,
    headlessRoot,
  };
}
