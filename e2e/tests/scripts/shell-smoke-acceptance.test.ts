import { describe, expect, it } from 'vitest';

import {
  createShellSmokeAcceptanceDigest,
  extractWorkflowJob,
  shellSmokeAcceptanceSourcePaths,
} from '../../../.github/scripts/release/shell-smoke-acceptance.ts';

describe('release Shell smoke acceptance identity', () => {
  it('keeps platform-owned smoke sources out of the opposite proof', () => {
    const mac = shellSmokeAcceptanceSourcePaths('mac_arm64');
    const win = shellSmokeAcceptanceSourcePaths('win_x64');
    expect(mac).toContain('e2e/specs/mac.spec.ts');
    expect(mac).not.toContain('e2e/specs/win.spec.ts');
    expect(win).toContain('e2e/specs/win.spec.ts');
    expect(win).not.toContain('e2e/specs/mac.spec.ts');
    expect(mac).toContain('e2e/lib/vitest/packaged-smoke-contract.ts');
    expect(win).toContain('e2e/lib/vitest/packaged-smoke-contract.ts');
  });

  it('hashes only the selected workflow job while retaining shared inputs', () => {
    const workflow = `name: release\n\njobs:\n  build_mac_arm64:\n    runs-on: macos\n  build_win_x64:\n    runs-on: windows\n  publish:\n    runs-on: linux\n`;
    const macJob = extractWorkflowJob(workflow, 'build_mac_arm64');
    const winJob = extractWorkflowJob(workflow, 'build_win_x64');
    const shared = { body: 'shared-v1', label: 'shared.ts' };
    const initialMac = createShellSmokeAcceptanceDigest([shared, { body: macJob, label: 'workflow#mac' }]);
    const initialWin = createShellSmokeAcceptanceDigest([shared, { body: winJob, label: 'workflow#win' }]);
    const changedWorkflow = workflow.replace('runs-on: windows', 'runs-on: windows-latest');

    expect(createShellSmokeAcceptanceDigest([
      shared,
      { body: extractWorkflowJob(changedWorkflow, 'build_mac_arm64'), label: 'workflow#mac' },
    ])).toBe(initialMac);
    expect(createShellSmokeAcceptanceDigest([
      shared,
      { body: extractWorkflowJob(changedWorkflow, 'build_win_x64'), label: 'workflow#win' },
    ])).not.toBe(initialWin);
    expect(createShellSmokeAcceptanceDigest([
      { body: 'shared-v2', label: 'shared.ts' },
      { body: macJob, label: 'workflow#mac' },
    ])).not.toBe(initialMac);
  });
});
