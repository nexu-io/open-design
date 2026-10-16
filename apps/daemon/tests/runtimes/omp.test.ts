import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ompAgentDef,
  parseOmpModels,
  OMP_SESSION_DIR_NAME,
  ompSessionsBaseDir,
} from '../../src/runtimes/defs/omp.js';
import { DEFAULT_MODEL_OPTION } from '../../src/runtimes/defs/shared.js';
import { AGENT_DEFS } from '../../src/runtimes/registry.js';
import { installMetaForAgent } from '../../src/runtimes/metadata.js';

const cwd = path.resolve('/projects/landing');
const sessionsDir = path.join(cwd, OMP_SESSION_DIR_NAME, 'sessions');
const dataDir = path.resolve('/var/lib/open-design-data');

describe('omp buildArgs', () => {
  it('drives the conversation over RPC and never puts the prompt in argv', () => {
    const prompt = 'this prompt must travel over stdin, not argv';
    const args = ompAgentDef.buildArgs(prompt, [], [], {}, { cwd });

    expect(args.slice(0, 2)).toEqual(['--mode', 'rpc']);
    expect(args).not.toContain(prompt);
    expect(ompAgentDef.promptViaStdin).toBe(true);
  });

  it('runs headless with auto-approval so a TTY-less spawn cannot block', () => {
    const args = ompAgentDef.buildArgs('p', [], [], {}, { cwd });
    expect(args).toContain('--auto-approve');
  });

  it('falls back to a project-cwd session directory when no data root is resolved', () => {
    // No `dataDir` in context — e.g. an isolated smoke/connection-test
    // invocation that never resolves RUNTIME_DATA_DIR.
    const args = ompAgentDef.buildArgs('p', [], [], {}, { cwd });
    expect(args[args.indexOf('--session-dir') + 1]).toBe(sessionsDir);
    // The transport scans the same directory to capture the resume handle.
    expect(ompAgentDef.piRpcSessionDirName).toBe(OMP_SESSION_DIR_NAME);
  });

  it('pins the session directory under the daemon data root, not the project cwd, once a data root is resolved', () => {
    // Per the daemon data directory contract, agent runtime state must not
    // land in the project cwd — for imported-folder projects, that is the
    // user's own external repository.
    const args = ompAgentDef.buildArgs('p', [], [], {}, { cwd, dataDir });
    const sessionDirArg = args[args.indexOf('--session-dir') + 1];
    expect(sessionDirArg).toBeDefined();
    expect(sessionDirArg).not.toBe(sessionsDir);
    expect(sessionDirArg?.startsWith(cwd)).toBe(false);
    expect(sessionDirArg?.startsWith(dataDir)).toBe(true);
  });

  it('keys the data-root session directory by cwd so different projects never collide', () => {
    const other = path.resolve('/projects/other-app');
    const argsA = ompAgentDef.buildArgs('p', [], [], {}, { cwd, dataDir });
    const argsB = ompAgentDef.buildArgs('p', [], [], {}, { cwd: other, dataDir });
    const dirA = argsA[argsA.indexOf('--session-dir') + 1];
    const dirB = argsB[argsB.indexOf('--session-dir') + 1];
    expect(dirA).not.toBe(dirB);
  });

  it('is deterministic across repeated calls for the same (dataDir, cwd) pair', () => {
    const first = ompAgentDef.buildArgs('p', [], [], {}, { cwd, dataDir });
    const second = ompAgentDef.buildArgs('p2', [], [], {}, { cwd, dataDir });
    expect(first[first.indexOf('--session-dir') + 1]).toBe(
      second[second.indexOf('--session-dir') + 1],
    );
  });

  it('omits --session-dir when there is no absolute cwd to pin to', () => {
    expect(ompAgentDef.buildArgs('p', [], [], {}, {})).not.toContain('--session-dir');
    expect(ompAgentDef.buildArgs('p', [], [], {}, { cwd: 'relative/path' })).not.toContain(
      '--session-dir',
    );
  });

  it('passes a selected model and thinking level through untouched', () => {
    const args = ompAgentDef.buildArgs(
      'p',
      [],
      [],
      { model: 'openai-codex/gpt-5.6-sol', reasoning: 'xhigh' },
      { cwd },
    );
    expect(args[args.indexOf('--model') + 1]).toBe('openai-codex/gpt-5.6-sol');
    expect(args[args.indexOf('--thinking') + 1]).toBe('xhigh');
  });

  it('omits --model and --thinking for the default sentinels', () => {
    const args = ompAgentDef.buildArgs(
      'p',
      [],
      [],
      { model: DEFAULT_MODEL_OPTION.id, reasoning: 'default' },
      { cwd },
    );
    expect(args).not.toContain('--model');
    expect(args).not.toContain('--thinking');
  });

  it('widens the workspace with --add-dir for absolute extra roots only', () => {
    const args = ompAgentDef.buildArgs(
      'p',
      [],
      ['/srv/skills/brand-kit', 'relative/skip-me', '/srv/design-systems/acme'],
      {},
      { cwd },
    );
    const added = args.reduce<string[]>((acc, arg, index) => {
      if (arg === '--add-dir') acc.push(args[index + 1] ?? '');
      return acc;
    }, []);
    expect(added).toEqual(['/srv/skills/brand-kit', '/srv/design-systems/acme']);
  });
});

describe('ompSessionsBaseDir / piRpcSessionScanBase', () => {
  it('is an absolute path under dataDir/agent-sessions/omp/, never under cwd', () => {
    const base = ompSessionsBaseDir(dataDir, cwd);
    expect(path.isAbsolute(base)).toBe(true);
    expect(base.startsWith(path.join(dataDir, 'agent-sessions', 'omp'))).toBe(true);
    expect(base.startsWith(cwd)).toBe(false);
  });

  it('matches piRpcSessionScanBase for the same inputs, so buildArgs and the transport scanner can never diverge', () => {
    const base = ompSessionsBaseDir(dataDir, cwd);
    expect(ompAgentDef.piRpcSessionScanBase?.({ dataDir, cwd })).toBe(base);
  });

  it('piRpcSessionScanBase falls back to undefined (project cwd) when dataDir or cwd is missing or relative', () => {
    expect(ompAgentDef.piRpcSessionScanBase?.({ cwd })).toBeUndefined();
    expect(ompAgentDef.piRpcSessionScanBase?.({ dataDir })).toBeUndefined();
    expect(ompAgentDef.piRpcSessionScanBase?.({ dataDir: 'relative/dir', cwd })).toBeUndefined();
  });
});

describe('omp registration', () => {
  it('is registered exactly once under the pi-rpc transport', () => {
    const matches = AGENT_DEFS.filter((def) => def.id === 'omp');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.streamFormat).toBe('pi-rpc');
  });

  it('exposes official install and docs metadata for unavailable-agent discovery', () => {
    expect(installMetaForAgent('omp')).toEqual({
      installUrl: 'https://omp.sh/',
      docsUrl: 'https://github.com/can1357/oh-my-pi',
    });
  });

  it('resumes through switch_session rather than pi\'s parentSession', () => {
    // omp's fork reduced `new_session { parentSession }` to a lineage-only
    // header stamp that does not replay the parent transcript.
    expect(ompAgentDef.piRpcResumeCommand).toBe('switch-session');
  });

  it('does not share pi\'s session directory', () => {
    const pi = AGENT_DEFS.find((def) => def.id === 'pi');
    expect(pi?.piRpcSessionDirName ?? '.pi').not.toBe(ompAgentDef.piRpcSessionDirName);
  });
});

describe('parseOmpModels', () => {
  const payload = JSON.stringify({
    models: [
      {
        provider: 'openai-codex',
        id: 'gpt-5.6-sol',
        selector: 'openai-codex/gpt-5.6-sol',
        name: 'GPT-5.6 Sol',
        reasoning: true,
        thinking: ['low', 'medium', 'high'],
      },
      {
        provider: 'github-copilot',
        id: 'gpt-4.1',
        selector: 'github-copilot/gpt-4.1',
        name: 'GPT-4.1',
        reasoning: false,
        thinking: null,
      },
    ],
  });

  it('uses the selector as the option id and labels by provider', () => {
    const models = parseOmpModels(payload);
    expect(models?.[0]).toEqual(DEFAULT_MODEL_OPTION);
    expect(models?.[1]?.id).toBe('openai-codex/gpt-5.6-sol');
    expect(models?.[1]?.label).toBe('GPT-5.6 Sol · openai-codex');
  });

  it('exposes per-model thinking levels, with off always available', () => {
    const models = parseOmpModels(payload);
    expect(models?.[1]?.reasoningOptions?.map((option) => option.id)).toEqual([
      'default',
      'off',
      'low',
      'medium',
      'high',
    ]);
  });

  it('leaves non-reasoning models on the adapter-level list', () => {
    const models = parseOmpModels(payload);
    expect(models?.[2]?.id).toBe('github-copilot/gpt-4.1');
    expect(models?.[2]?.reasoningOptions).toBeUndefined();
  });

  it('falls back to provider/id when selector is absent and de-dupes', () => {
    const models = parseOmpModels(
      JSON.stringify({
        models: [
          { provider: 'openrouter', id: 'z-ai/glm-5', name: 'GLM-5' },
          { provider: 'openrouter', id: 'z-ai/glm-5', name: 'GLM-5 (dupe)' },
        ],
      }),
    );
    expect(models).toHaveLength(2);
    expect(models?.[1]?.id).toBe('openrouter/z-ai/glm-5');
  });

  it('returns null for unusable output so detection keeps the fallback list', () => {
    expect(parseOmpModels('not json')).toBeNull();
    expect(parseOmpModels('')).toBeNull();
    expect(parseOmpModels(JSON.stringify({ models: [] }))).toBeNull();
    expect(parseOmpModels(JSON.stringify({ models: 'nope' }))).toBeNull();
  });
});
