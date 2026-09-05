import { describe, expect, it } from 'vitest';

import {
  CATALOGUE,
  applicableForPlatform,
  launchHostTool,
  resolveHostToolLaunchPlan,
} from '../src/routes/host-tools.js';
import type {
  CatalogueEntry,
  Platform,
  ResolveEntryDeps,
} from '../src/routes/host-tools.js';

function resolveEntryDeps(overrides: Partial<ResolveEntryDeps> = {}): ResolveEntryDeps {
  return {
    platform: 'darwin',
    probeCommandOnPath: async () => '/usr/local/bin/cursor',
    probeMacBundle: async () => ({ name: 'Cursor', path: '/Applications/Cursor.app' }),
    resolveMacOpenCommand: async () => '/usr/bin/open',
    ...overrides,
  };
}

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

  it('prefers a discoverable macOS app bundle over a discoverable CLI', async () => {
    const plan = await resolveHostToolLaunchPlan(
      'cursor',
      '/tmp/open-design-project',
      resolveEntryDeps(),
    );

    expect(plan).toEqual({
      available: true,
      resolvedPath: '/Applications/Cursor.app',
      command: '/usr/bin/open',
      args: ['-a', 'Cursor', '/tmp/open-design-project'],
    });
  });

  it('falls back to the CLI when a macOS app bundle is unavailable', async () => {
    const plan = await resolveHostToolLaunchPlan(
      'cursor',
      '/tmp/open-design-project',
      resolveEntryDeps({ probeMacBundle: async () => null }),
    );

    expect(plan).toEqual({
      available: true,
      resolvedPath: '/usr/local/bin/cursor',
      command: '/usr/local/bin/cursor',
      args: ['/tmp/open-design-project'],
    });
  });

  it('keeps CLI selection on non-macOS platforms', async () => {
    const plan = await resolveHostToolLaunchPlan(
      'cursor',
      '/tmp/open-design-project',
      resolveEntryDeps({
        platform: 'linux',
        probeMacBundle: async () => {
          throw new Error('macOS bundle probe must not run');
        },
      }),
    );

    expect(plan).toEqual({
      available: true,
      resolvedPath: '/usr/local/bin/cursor',
      command: '/usr/local/bin/cursor',
      args: ['/tmp/open-design-project'],
    });
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
    expect(cursor).toBeDefined();
    expect(applicableForPlatform(cursor, 'darwin' as Platform)).toBe(true);
  });
});

describe('host tools launch reporting (#3871)', () => {
  it('reports ok once the OS confirms the process spawned', async () => {
    // process.execPath (the running node binary) always spawns, so this
    // exercises the successful-exit path without an installed editor.
    const result = await launchHostTool(process.execPath, ['--version']);

    expect(result.ok).toBe(true);
  });

  it('surfaces the launch failure instead of swallowing it', async () => {
    // shell:true on win32 runs the command through cmd.exe, which exits
    // non-zero rather than emitting an error event for a missing binary.
    if (process.platform === 'win32') return;

    const result = await launchHostTool('open-design-nonexistent-editor-3871', []);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });
});
