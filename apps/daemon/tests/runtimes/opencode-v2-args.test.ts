import { afterEach, describe, expect, it } from 'vitest';
import { agentCapabilities } from '../../src/runtimes/capabilities.js';
import { opencodeAgentDef } from '../../src/runtimes/defs/opencode.js';
import { byokOpenCodeAgentDef } from '../../src/runtimes/defs/byok-opencode.js';
import { rememberLiveModels, resetLiveModelsForTests } from '../../src/runtimes/models.js';

const CWD = 'E:\\proj\\demo';

// OpenCode 2.x removed the 1.x CLI surface the daemon was written against:
// no `--dir`, no `--variant`, and `--dangerously-skip-permissions` became a
// hidden alias of the documented `--auto`. The def must consult the cached
// `--help` capability scan and speak the dialect the detected binary
// advertises, while an unprobed binary keeps today's exact 1.x behavior.
afterEach(() => {
  agentCapabilities.delete('opencode');
  agentCapabilities.delete('byok-opencode');
  resetLiveModelsForTests();
});

describe('opencode buildArgs OpenCode 2.x dialect', () => {
  it('v2: drops --dir, bypasses permissions with the advertised --auto, adds --standalone', () => {
    agentCapabilities.set('opencode', {
      skipPermissions: '--auto',
      archivedSessions: true,
      standaloneServer: '--standalone',
    });
    const args = opencodeAgentDef.buildArgs('p', [], [], {}, { cwd: CWD });
    expect(args.slice(0, 3)).toEqual(['run', '--format', 'json']);
    expect(args).toContain('--auto');
    expect(args).toContain('--standalone');
    expect(args).not.toContain('--dir');
    // Without `--dir` the cwd must not leak into argv as a stray positional.
    expect(args).not.toContain(CWD);
    expect(args).not.toContain('--dangerously-skip-permissions');
  });

  it('v2: folds a live-catalog reasoning variant into `-m provider/model#variant`', () => {
    agentCapabilities.set('opencode', { skipPermissions: '--auto', archivedSessions: true });
    rememberLiveModels('opencode', [
      {
        id: 'anthropic/claude-sonnet-4-5',
        label: 'anthropic/claude-sonnet-4-5',
        reasoningOptions: [{ id: 'steady', label: 'steady' }],
      },
    ]);
    const args = opencodeAgentDef.buildArgs(
      'p',
      [],
      [],
      { model: 'anthropic/claude-sonnet-4-5', reasoning: 'steady' },
      {},
    );
    expect(args).not.toContain('--variant');
    expect(args[args.indexOf('-m') + 1]).toBe('anthropic/claude-sonnet-4-5#steady');
  });

  it('v1 dialect: keeps `--dir` and the legacy bypass flag, no --standalone', () => {
    agentCapabilities.set('opencode', {
      skipPermissions: '--dangerously-skip-permissions',
      modelVariant: '--variant',
    });
    const args = opencodeAgentDef.buildArgs('p', [], [], {}, { cwd: CWD });
    expect(args).toContain('--dir');
    expect(args[args.indexOf('--dir') + 1]).toBe(CWD);
    expect(args).toContain('--dangerously-skip-permissions');
    expect(args).not.toContain('--standalone');
  });

  it('never-probed: keeps today’s unconditional `--dir` behavior (status quo)', () => {
    const args = opencodeAgentDef.buildArgs('p', [], [], {}, { cwd: CWD });
    expect(args).toContain('--dir');
    expect(args[args.indexOf('--dir') + 1]).toBe(CWD);
  });

  it('byok-opencode v2: drops `--dir` and uses the advertised bypass flag', () => {
    agentCapabilities.set('byok-opencode', { skipPermissions: '--auto', archivedSessions: true });
    const args = byokOpenCodeAgentDef.buildArgs('p', [], [], {}, { cwd: CWD });
    expect(args).not.toContain('--dir');
    expect(args).toContain('--auto');
  });

  it('listModels carries a plain-`models` fallback for CLIs without `--verbose`', () => {
    expect(opencodeAgentDef.listModels?.fallbackArgs).toEqual(['models']);
  });
});
