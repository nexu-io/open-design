import { test } from 'vitest';
import { assert, opencode } from './helpers/test-helpers.js';
import { byokOpenCodeAgentDef } from '../../src/runtimes/defs/byok-opencode.js';
import { agentCapabilities } from '../../src/runtimes/capabilities.js';
import { appendOpenCodePure } from '../../src/runtimes/opencode-permissions.js';
import { getRememberedLiveModels, rememberLiveModels } from '../../src/runtimes/models.js';

// OpenCode 2 removed `--dir`, `--pure`, `--variant`, and
// `--dangerously-skip-permissions` from `opencode run`, and added
// `--auto`/`--standalone`. The adapter therefore emits a flag only when the
// `run --help` probe proves the installed CLI accepts it. These cases pin the
// two generations against the help text captured from real binaries.

const V1_CAPS = {
  skipPermissions: true,
  autoApprove: false,
  workspaceDir: true,
  pure: true,
  variantFlag: true,
  standalone: false,
};

const V2_CAPS = {
  skipPermissions: false,
  autoApprove: true,
  workspaceDir: false,
  pure: false,
  variantFlag: false,
  standalone: true,
};

test('opencode V2 argv drops --dir/--pure and runs on a private server', () => {
  agentCapabilities.set('opencode', V2_CAPS);
  try {
    const args = opencode.buildArgs('design a dashboard', [], [], {}, { cwd: '/projects/p1' });
    assert.deepEqual(args, ['run', '--format', 'json', '--standalone', '--auto']);
    assert.equal(args.includes('--dir'), false);
    assert.equal(args.includes('--pure'), false);
  } finally {
    agentCapabilities.delete('opencode');
  }
});

test('opencode V1 argv keeps the flags that generation accepts', () => {
  agentCapabilities.set('opencode', V1_CAPS);
  try {
    const args = opencode.buildArgs('design a dashboard', [], [], {}, { cwd: '/projects/p1' });
    assert.deepEqual(args, [
      'run',
      '--format',
      'json',
      '--dangerously-skip-permissions',
      '--dir',
      '/projects/p1',
    ]);
  } finally {
    agentCapabilities.delete('opencode');
  }
});

test('an unprobed opencode surface keeps V1 argv so a failed probe cannot silently unpin the workspace', () => {
  // `probeCapabilities` returns {} when `--help` times out or the binary is
  // missing. That must stay on the V1 shape: appending --dir to a V2 CLI fails
  // loudly, while omitting it from a V1 CLI reproduces the silent
  // "wrote the deliverable into the repo root" bug.
  agentCapabilities.delete('opencode');
  const args = opencode.buildArgs('design a dashboard', [], [], {}, { cwd: '/projects/p1' });
  assert.deepEqual(args, ['run', '--format', 'json', '--dir', '/projects/p1']);
});

test('opencode V2 folds the reasoning variant into the model reference', () => {
  const previous = getRememberedLiveModels('opencode');
  rememberLiveModels('opencode', [
    {
      id: 'anthropic/claude-sonnet-4-5',
      label: 'anthropic/claude-sonnet-4-5',
      reasoningOptions: [
        { id: 'default', label: 'Default' },
        { id: 'high', label: 'high' },
      ],
    },
  ]);
  agentCapabilities.set('opencode', V2_CAPS);
  try {
    const args = opencode.buildArgs(
      '',
      [],
      [],
      { model: 'anthropic/claude-sonnet-4-5', reasoning: 'high' },
      { cwd: '/projects/p1' },
    );
    assert.deepEqual(args, [
      'run',
      '--format',
      'json',
      '--standalone',
      '--auto',
      '-m',
      'anthropic/claude-sonnet-4-5#high',
    ]);
    assert.equal(args.includes('--variant'), false);
  } finally {
    agentCapabilities.delete('opencode');
    rememberLiveModels('opencode', previous);
  }
});

test('opencode V1 keeps --variant as its own flag', () => {
  const previous = getRememberedLiveModels('opencode');
  rememberLiveModels('opencode', [
    {
      id: 'anthropic/claude-sonnet-4-5',
      label: 'anthropic/claude-sonnet-4-5',
      reasoningOptions: [
        { id: 'default', label: 'Default' },
        { id: 'high', label: 'high' },
      ],
    },
  ]);
  agentCapabilities.set('opencode', V1_CAPS);
  try {
    const args = opencode.buildArgs(
      '',
      [],
      [],
      { model: 'anthropic/claude-sonnet-4-5', reasoning: 'high' },
      { cwd: '/projects/p1' },
    );
    assert.deepEqual(args, [
      'run',
      '--format',
      'json',
      '--dangerously-skip-permissions',
      '--dir',
      '/projects/p1',
      '-m',
      'anthropic/claude-sonnet-4-5',
      '--variant',
      'high',
    ]);
  } finally {
    agentCapabilities.delete('opencode');
    rememberLiveModels('opencode', previous);
  }
});

test('BYOK OpenCode applies the same V2 workspace rule', () => {
  agentCapabilities.set('byok-opencode', V2_CAPS);
  try {
    const args = byokOpenCodeAgentDef.buildArgs('body', [], [], {}, { cwd: '/projects/p1' });
    assert.equal(args.includes('--dir'), false);
    assert.equal(args.includes('--standalone'), true);
    assert.equal(args.includes('--auto'), true);
  } finally {
    agentCapabilities.delete('byok-opencode');
  }
});

// `--pure` isolates the connection test from user-installed plugins. OpenCode 2
// removed the flag and does not run V1 plugins, so a probed V2 surface omits it
// while an unprobed surface keeps the historical behaviour.
test('connection-test purity flag follows the probed surface', () => {
  agentCapabilities.set('opencode', V2_CAPS);
  try {
    const args: string[] = ['run', '--format', 'json'];
    appendOpenCodePure(args, 'opencode');
    assert.equal(args.includes('--pure'), false);
  } finally {
    agentCapabilities.delete('opencode');
  }

  const unknownSurface: string[] = ['run', '--format', 'json'];
  appendOpenCodePure(unknownSurface, 'opencode');
  assert.equal(unknownSurface.includes('--pure'), true);
});
