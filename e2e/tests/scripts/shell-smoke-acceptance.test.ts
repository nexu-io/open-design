import { describe, expect, it } from 'vitest';

import {
  createShellSmokeAcceptanceDigest,
  extractWorkflowJob,
  shellSmokeAcceptanceSourcePaths,
} from '../../../.github/scripts/release/shell-smoke-acceptance.ts';

describe('release Shell smoke acceptance identity', () => {
  it('keeps platform-owned smoke sources out of the opposite proof', () => {
    const macArm64 = shellSmokeAcceptanceSourcePaths('mac_arm64');
    const macX64 = shellSmokeAcceptanceSourcePaths('mac_x64');
    const win = shellSmokeAcceptanceSourcePaths('win_x64');
    expect(macArm64).toContain('e2e/specs/mac.spec.ts');
    expect(macArm64).not.toContain('e2e/specs/win.spec.ts');
    expect(macX64).toEqual(macArm64);
    expect(win).toContain('e2e/specs/win.spec.ts');
    expect(win).not.toContain('e2e/specs/mac.spec.ts');
    expect(macArm64).toContain('e2e/lib/vitest/packaged-smoke-contract.ts');
    expect(win).toContain('e2e/lib/vitest/packaged-smoke-contract.ts');
  });

  it('hashes only the selected workflow job while retaining shared inputs', () => {
    const workflow = `name: release\n\njobs:\n  build_mac_arm64:\n    runs-on: macos-arm\n  build_mac_x64:\n    runs-on: macos-intel\n  build_win_x64:\n    runs-on: windows\n  publish:\n    runs-on: linux\n`;
    const macArm64Job = extractWorkflowJob(workflow, 'build_mac_arm64');
    const macX64Job = extractWorkflowJob(workflow, 'build_mac_x64');
    const winJob = extractWorkflowJob(workflow, 'build_win_x64');
    const shared = { body: 'shared-v1', label: 'shared.ts' };
    const initialMacArm64 = createShellSmokeAcceptanceDigest([shared, { body: macArm64Job, label: 'workflow#mac-arm64' }]);
    const initialMacX64 = createShellSmokeAcceptanceDigest([shared, { body: macX64Job, label: 'workflow#mac-x64' }]);
    const initialWin = createShellSmokeAcceptanceDigest([shared, { body: winJob, label: 'workflow#win' }]);
    const changedWorkflow = workflow.replace('runs-on: macos-intel', 'runs-on: macos-15-intel');

    expect(createShellSmokeAcceptanceDigest([
      shared,
      { body: extractWorkflowJob(changedWorkflow, 'build_mac_arm64'), label: 'workflow#mac-arm64' },
    ])).toBe(initialMacArm64);
    expect(createShellSmokeAcceptanceDigest([
      shared,
      { body: extractWorkflowJob(changedWorkflow, 'build_mac_x64'), label: 'workflow#mac-x64' },
    ])).not.toBe(initialMacX64);
    expect(createShellSmokeAcceptanceDigest([
      shared,
      { body: extractWorkflowJob(changedWorkflow, 'build_win_x64'), label: 'workflow#win' },
    ])).toBe(initialWin);
    expect(createShellSmokeAcceptanceDigest([
      { body: 'shared-v2', label: 'shared.ts' },
      { body: macArm64Job, label: 'workflow#mac-arm64' },
    ])).not.toBe(initialMacArm64);
  });
});
