import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CATALOGUE,
  applicableForPlatform,
  launchHostTool,
  resolveHostToolLaunchPlan,
} from '../src/routes/host-tools.js';
import type { CatalogueEntry, Platform } from '../src/routes/host-tools.js';

// Probe boundary. `installed` stays null by default so the cases that want the
// real filesystem (the darwin Finder/Terminal plans below) keep hitting it;
// the resolution-order cases set an allowlist instead, which lets them assert
// resolved launch arguments on any CI platform rather than self-skipping.
const probe = vi.hoisted(() => ({ installed: null as string[] | null }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    access: async (target: Parameters<typeof actual.access>[0], mode?: number) => {
      if (probe.installed === null) return actual.access(target, mode);
      if (probe.installed.includes(String(target))) return undefined;
      throw Object.assign(new Error(`ENOENT: ${String(target)}`), { code: 'ENOENT' });
    },
  };
});

describe('host tools open-in launch plans', () => {
  it('uses the absolute macOS open command to reveal project folders in Finder', async () => {
    if (process.platform !== 'darwin') return;

    const plan = await resolveHostToolLaunchPlan('finder', '/tmp/open-design-project');

    expect(plan.available).toBe(true);
    expect(plan.command).toBe('/usr/bin/open');
    expect(plan.args).toEqual(['-R', '/tmp/open-design-project']);
  });

  it('finds macOS system app bundles outside /Applications and launches through absolute open', async () => {
    if (process.platform !== 'darwin') return;

    const plan = await resolveHostToolLaunchPlan('terminal', '/tmp/open-design-project');

    expect(plan.available).toBe(true);
    expect(plan.command).toBe('/usr/bin/open');
    expect(plan.args).toEqual(['-a', 'Terminal', '/tmp/open-design-project']);
  });
});

// Resolution-order coverage for the launch *arguments*, not just platform
// applicability. `kiro` carries preferMacOpenBundle so darwin resolves
// /Applications/Kiro.app ahead of the `$PATH` shim — bare `kiro` routes to the
// user's default once the Kiro command router is installed, and `kiro ide
// <dir>` is not a usable substitute (it adds a spurious `ide` entry when the
// router is absent). These cases pin both halves so neither can regress.
describe('host tools resolution order — preferMacOpenBundle', () => {
  const DIR = '/tmp/open-design-project';
  const ORIGINAL_PLATFORM = process.platform;

  function stubPlatform(platform: NodeJS.Platform, installed: string[]) {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    // Single-entry PATH so probeCommandOnPath resolves to a known absolute path.
    vi.stubEnv('PATH', '/fake/bin');
    probe.installed = installed;
  }

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: ORIGINAL_PLATFORM, configurable: true });
    vi.unstubAllEnvs();
    probe.installed = null;
  });

  it('darwin: kiro launches the app bundle through open even when the $PATH shim exists', async () => {
    stubPlatform('darwin', ['/fake/bin/kiro', '/Applications/Kiro.app', '/usr/bin/open']);

    const plan = await resolveHostToolLaunchPlan('kiro', DIR);

    expect(plan.available).toBe(true);
    expect(plan.resolvedPath).toBe('/Applications/Kiro.app');
    expect(plan.command).toBe('/usr/bin/open');
    expect(plan.args).toEqual(['-a', 'Kiro', DIR]);
    expect(plan.args).not.toContain('ide');
  });

  it('darwin: kiro still falls back to the $PATH shim when the app bundle is missing', async () => {
    stubPlatform('darwin', ['/fake/bin/kiro', '/usr/bin/open']);

    const plan = await resolveHostToolLaunchPlan('kiro', DIR);

    expect(plan.available).toBe(true);
    expect(plan.command).toBe('/fake/bin/kiro');
    expect(plan.args).toEqual([DIR]);
  });

  it('win32: kiro falls back to the $PATH shim with the dir as its only argument', async () => {
    stubPlatform('win32', ['/fake/bin/kiro.exe']);

    const plan = await resolveHostToolLaunchPlan('kiro', DIR);

    expect(plan.available).toBe(true);
    expect(plan.command).toBe('/fake/bin/kiro.exe');
    expect(plan.args).toEqual([DIR]);
    expect(plan.args).not.toContain('ide');
  });

  it('linux: kiro falls back to the $PATH shim with the dir as its only argument', async () => {
    stubPlatform('linux', ['/fake/bin/kiro']);

    const plan = await resolveHostToolLaunchPlan('kiro', DIR);

    expect(plan.available).toBe(true);
    expect(plan.command).toBe('/fake/bin/kiro');
    expect(plan.args).toEqual([DIR]);
    expect(plan.args).not.toContain('ide');
  });

  it('darwin: an unflagged entry still prefers the $PATH shim over its app bundle', async () => {
    stubPlatform('darwin', ['/fake/bin/cursor', '/Applications/Cursor.app', '/usr/bin/open']);

    const plan = await resolveHostToolLaunchPlan('cursor', DIR);

    expect(plan.available).toBe(true);
    expect(plan.resolvedPath).toBe('/fake/bin/cursor');
    expect(plan.command).toBe('/fake/bin/cursor');
    expect(plan.args).toEqual([DIR]);
  });

  it('only kiro opts into bundle-first resolution', () => {
    const flagged = CATALOGUE.filter((e: CatalogueEntry) => e.preferMacOpenBundle === true);
    expect(flagged.map((e: CatalogueEntry) => e.id)).toEqual(['kiro']);
  });
});

describe('platform gate — Warp is darwin-only, cross-platform tools stay available everywhere', () => {
  it('CATALOGUE includes a warp entry', () => {
    const warp = CATALOGUE.find((e: CatalogueEntry) => e.id === 'warp');
    expect(warp).toBeDefined();
  });

  it('warp is not applicable on win32', () => {
    const warp = CATALOGUE.find((e: CatalogueEntry) => e.id === 'warp')!;
    expect(applicableForPlatform(warp, 'win32' as Platform)).toBe(false);
  });

  it('warp is not applicable on linux', () => {
    const warp = CATALOGUE.find((e: CatalogueEntry) => e.id === 'warp')!;
    expect(applicableForPlatform(warp, 'linux' as Platform)).toBe(false);
  });

  it('warp is applicable on darwin', () => {
    const warp = CATALOGUE.find((e: CatalogueEntry) => e.id === 'warp')!;
    expect(applicableForPlatform(warp, 'darwin' as Platform)).toBe(true);
  });

  it('cursor remains applicable on win32 (regression guard — no platforms restriction)', () => {
    const cursor = CATALOGUE.find((e: CatalogueEntry) => e.id === 'cursor')!;
    expect(cursor).toBeDefined();
    expect(applicableForPlatform(cursor, 'win32' as Platform)).toBe(true);
  });

  it('cursor remains applicable on darwin (regression guard — no platforms restriction)', () => {
    const cursor = CATALOGUE.find((e: CatalogueEntry) => e.id === 'cursor')!;
    expect(applicableForPlatform(cursor, 'darwin' as Platform)).toBe(true);
  });

  it('kiro is applicable on all desktop platforms (regression guard)', () => {
    const kiro = CATALOGUE.find((e: CatalogueEntry) => e.id === 'kiro')!;
    expect(kiro).toBeDefined();
    expect(applicableForPlatform(kiro, 'darwin' as Platform)).toBe(true);
    expect(applicableForPlatform(kiro, 'win32' as Platform)).toBe(true);
    expect(applicableForPlatform(kiro, 'linux' as Platform)).toBe(true);
  });
});

describe('host tools launch reporting (#3871)', () => {
  it('reports ok once the OS confirms the process spawned', async () => {
    // process.execPath (the running node binary) always spawns, so this
    // exercises the success path without depending on an installed editor.
    const result = await launchHostTool(process.execPath, ['--version']);

    expect(result.ok).toBe(true);
  });

  it('surfaces the launch failure instead of swallowing it', async () => {
    // shell:true on win32 runs the command through cmd.exe, which exits
    // non-zero rather than emitting an `error` event for a missing binary.
    if (process.platform === 'win32') return;

    const result = await launchHostTool('open-design-nonexistent-editor-3871', []);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });
});
