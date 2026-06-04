import { describe, expect, it } from 'vitest';

import { resolveHostToolLaunchPlan } from '../src/routes/host-tools.js';

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
