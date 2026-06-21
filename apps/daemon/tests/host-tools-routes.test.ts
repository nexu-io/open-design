import { describe, expect, it } from 'vitest';

import {
  CATALOGUE,
  applicableForPlatform,
  resolveHostToolLaunchPlan,
} from '../src/routes/host-tools.js';
import type { CatalogueEntry, Platform } from '../src/routes/host-tools.js';

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
});
