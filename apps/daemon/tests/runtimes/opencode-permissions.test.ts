import { afterEach, describe, expect, it } from 'vitest';

import { agentCapabilities } from '../../src/runtimes/capabilities.js';
import {
  OPENCODE_PERMISSION_CAPABILITY,
  appendOpenCodePermissionBypass,
  appendOpenCodeStandalone,
  appendOpenCodeWorkspaceDir,
  openCodeModelArgs,
  resolveOpenCodeCliGeneration,
  shouldUseOpenCodePureFlag,
  withOpenCodeWorkspaceEnv,
} from '../../src/runtimes/opencode-permissions.js';

// Capability maps as the `run --help` substring probe records them.
const V1_CAPS = {
  skipPermissions: true,
  autoApprove: false,
  workspaceDir: true,
  pure: true,
  variant: true,
  standalone: false,
};
const V2_CAPS = {
  skipPermissions: false,
  autoApprove: true,
  workspaceDir: false,
  pure: false,
  variant: false,
  standalone: true,
};

describe('OpenCode CLI generation', () => {
  afterEach(() => {
    agentCapabilities.delete('opencode');
  });

  it('probes every flag whose presence differs between OpenCode 1.x and 2.x', () => {
    expect(OPENCODE_PERMISSION_CAPABILITY.helpArgs).toEqual(['run', '--help']);
    expect(OPENCODE_PERMISSION_CAPABILITY.capabilityFlags).toEqual({
      '--dangerously-skip-permissions': 'skipPermissions',
      '--auto': 'autoApprove',
      '--dir': 'workspaceDir',
      '--pure': 'pure',
      '--variant': 'variant',
      '--standalone': 'standalone',
    });
  });

  it('resolves the generation from the workspace-dir flag alone', () => {
    expect(resolveOpenCodeCliGeneration('opencode')).toBe('unknown');
    agentCapabilities.set('opencode', {});
    expect(resolveOpenCodeCliGeneration('opencode')).toBe('unknown');
    agentCapabilities.set('opencode', V1_CAPS);
    expect(resolveOpenCodeCliGeneration('opencode')).toBe('v1');
    agentCapabilities.set('opencode', V2_CAPS);
    expect(resolveOpenCodeCliGeneration('opencode')).toBe('v2');
  });

  it('keeps the 1.x argv while the probe has not answered', () => {
    const args: string[] = [];
    appendOpenCodePermissionBypass(args, 'opencode');
    appendOpenCodeWorkspaceDir(args, '/projects/p1', 'opencode');
    appendOpenCodeStandalone(args, 'opencode');
    expect(args).toEqual(['--dir', '/projects/p1']);
    expect(shouldUseOpenCodePureFlag('opencode')).toBe(true);
    expect(openCodeModelArgs('openai/gpt-5', 'high', 'opencode')).toEqual([
      '-m', 'openai/gpt-5', '--variant', 'high',
    ]);
  });

  it('sends the 1.x flags when the probe advertises them', () => {
    agentCapabilities.set('opencode', V1_CAPS);
    const args: string[] = [];
    appendOpenCodePermissionBypass(args, 'opencode');
    appendOpenCodeWorkspaceDir(args, '/projects/p1', 'opencode');
    appendOpenCodeStandalone(args, 'opencode');
    expect(args).toEqual(['--dangerously-skip-permissions', '--dir', '/projects/p1']);
    expect(shouldUseOpenCodePureFlag('opencode')).toBe(true);
  });

  it('switches to the 2.x surface when `run --help` lacks --dir', () => {
    agentCapabilities.set('opencode', V2_CAPS);
    const args: string[] = [];
    appendOpenCodePermissionBypass(args, 'opencode');
    appendOpenCodeWorkspaceDir(args, '/projects/p1', 'opencode');
    appendOpenCodeStandalone(args, 'opencode');
    expect(args).toEqual(['--auto', '--standalone']);
    expect(shouldUseOpenCodePureFlag('opencode')).toBe(false);
    expect(openCodeModelArgs('openai/gpt-5', 'high', 'opencode')).toEqual([
      '-m', 'openai/gpt-5#high',
    ]);
    expect(openCodeModelArgs('openai/gpt-5', null, 'opencode')).toEqual(['-m', 'openai/gpt-5']);
  });

  it('never adds --auto to a 1.x argv, even when the substring probe saw it', () => {
    // The probe is a substring scan of the help text; a 1.x build whose help
    // happens to contain `--auto` must keep its byte-for-byte 1.x argv.
    agentCapabilities.set('opencode', { ...V1_CAPS, skipPermissions: false, autoApprove: true });
    const args: string[] = [];
    appendOpenCodePermissionBypass(args, 'opencode');
    expect(args).toEqual([]);
  });

  it('does not send --standalone to a 2.x build that does not advertise it', () => {
    agentCapabilities.set('opencode', { ...V2_CAPS, standalone: false });
    const args: string[] = [];
    appendOpenCodeStandalone(args, 'opencode');
    expect(args).toEqual([]);
  });

  it('pins PWD to the project directory only for a 2.x launch', () => {
    const inherited = { PATH: '/usr/bin', PWD: '/repo/open-design' };

    expect(withOpenCodeWorkspaceEnv(inherited, '/repo/open-design/.od/projects/p1', 'opencode'))
      .toEqual(inherited);

    agentCapabilities.set('opencode', V1_CAPS);
    expect(withOpenCodeWorkspaceEnv(inherited, '/repo/open-design/.od/projects/p1', 'opencode'))
      .toEqual(inherited);

    agentCapabilities.set('opencode', V2_CAPS);
    const pinned = withOpenCodeWorkspaceEnv(inherited, '/repo/open-design/.od/projects/p1', 'opencode');
    expect(pinned).toEqual({ PATH: '/usr/bin', PWD: '/repo/open-design/.od/projects/p1' });
    // The inherited environment is left untouched.
    expect(inherited.PWD).toBe('/repo/open-design');
    expect(withOpenCodeWorkspaceEnv(inherited, '', 'opencode')).toEqual(inherited);
  });
});
