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

// Resolution coverage for the launch *arguments*, not just platform
// applicability. `kiro` is bundle-only: it declares no `command`, so the tile
// can only ever reach Kiro.app and never the `kiro` shim, which routes to the
// user's default once the Kiro command router is installed. These cases pin
// both halves of that — the bundle launch, and the refusal to fall back to a
// shim that may be the terminal agent. (#6313)
describe('host tools resolution — kiro resolves through the IDE bundle only', () => {
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

  it('darwin: kiro is unavailable when Kiro.app is missing, even with the $PATH shim installed', async () => {
    stubPlatform('darwin', ['/fake/bin/kiro', '/usr/bin/open']);

    const plan = await resolveHostToolLaunchPlan('kiro', DIR);

    expect(plan.available).toBe(false);
    expect(plan.command).toBeUndefined();
    expect(plan.args).toBeUndefined();
  });

  it('darwin: an entry that declares a shim still prefers it over its app bundle', async () => {
    stubPlatform('darwin', ['/fake/bin/cursor', '/Applications/Cursor.app', '/usr/bin/open']);

    const plan = await resolveHostToolLaunchPlan('cursor', DIR);

    expect(plan.available).toBe(true);
    expect(plan.resolvedPath).toBe('/fake/bin/cursor');
    expect(plan.command).toBe('/fake/bin/cursor');
    expect(plan.args).toEqual([DIR]);
  });
});

describe('platform gate — Warp and Kiro are darwin-only, cross-platform tools stay available everywhere', () => {
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

  // Kiro is the same shape of gate as Warp: darwin resolves the IDE app bundle
  // deterministically, win32/linux have no verified IDE launch path yet, so the
  // entry must not be advertised there. (#6313) `resolveHostToolLaunchPlan`
  // reads CATALOGUE directly and does not consult applicableForPlatform, so the
  // gate has to be asserted here rather than through a launch plan.
  it('CATALOGUE includes a kiro entry', () => {
    const kiro = CATALOGUE.find((e: CatalogueEntry) => e.id === 'kiro');
    expect(kiro).toBeDefined();
  });

  it('kiro is not applicable on win32', () => {
    const kiro = CATALOGUE.find((e: CatalogueEntry) => e.id === 'kiro')!;
    expect(applicableForPlatform(kiro, 'win32' as Platform)).toBe(false);
  });

  it('kiro is not applicable on linux', () => {
    const kiro = CATALOGUE.find((e: CatalogueEntry) => e.id === 'kiro')!;
    expect(applicableForPlatform(kiro, 'linux' as Platform)).toBe(false);
  });

  it('kiro is applicable on darwin', () => {
    const kiro = CATALOGUE.find((e: CatalogueEntry) => e.id === 'kiro')!;
    expect(applicableForPlatform(kiro, 'darwin' as Platform)).toBe(true);
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
