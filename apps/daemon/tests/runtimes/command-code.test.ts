import { afterEach, describe, expect, it } from 'vitest';
import { agentCapabilities } from '../../src/runtimes/capabilities.js';
import { commandCodeAgentDef } from '../../src/runtimes/defs/command-code.js';
import type { RuntimeAgentDef } from '../../src/runtimes/types.js';

// The def is declared with `satisfies`, so its literal type only carries the
// fields it actually sets. This contract view is what lets the tests below
// assert that an optional field is deliberately ABSENT.
const def: RuntimeAgentDef = commandCodeAgentDef;

afterEach(() => {
  agentCapabilities.delete('command-code');
});

describe('command-code buildArgs', () => {
  it('emits the headless NDJSON argv without a query argument', () => {
    const args = commandCodeAgentDef.buildArgs('prompt', [], [], {}, {});
    expect(args).toEqual([
      '-p',
      '--output-format',
      'json',
      '--skip-onboarding',
      '--yolo',
      '--trust',
    ]);
  });

  it('never puts the prompt in argv', () => {
    expect(commandCodeAgentDef.promptViaStdin).toBe(true);
    expect(def.promptInputFormat).toBeUndefined();

    const longPrompt = 'x'.repeat(200_000);
    const args = commandCodeAgentDef.buildArgs(longPrompt, [], [], {}, {});
    expect(args).not.toContain(longPrompt);
    for (const arg of args) {
      expect(typeof arg === 'string' && arg.length < 1000).toBe(true);
    }
  });

  it('appends --model for a non-default model and omits it for the default sentinel', () => {
    const selected = commandCodeAgentDef.buildArgs('', [], [], { model: 'zai-org/GLM-5.3' }, {});
    expect(selected[selected.indexOf('--model') + 1]).toBe('zai-org/GLM-5.3');

    const fallback = commandCodeAgentDef.buildArgs('', [], [], { model: 'default' }, {});
    expect(fallback).not.toContain('--model');
  });

  it('appends --effort for a real level and omits it for the default sentinel', () => {
    const selected = commandCodeAgentDef.buildArgs('', [], [], { reasoning: 'xhigh' }, {});
    expect(selected[selected.indexOf('--effort') + 1]).toBe('xhigh');

    const fallback = commandCodeAgentDef.buildArgs('', [], [], { reasoning: 'default' }, {});
    expect(fallback).not.toContain('--effort');
  });

  it('passes each extra directory as its own --add-dir', () => {
    const args = commandCodeAgentDef.buildArgs(
      '',
      [],
      ['/repo/skills', '/repo/design-systems'],
      {},
      {},
    );
    expect(args.filter((arg) => arg === '--add-dir')).toHaveLength(2);
    expect(args).toContain('/repo/skills');
    expect(args).toContain('/repo/design-systems');
  });

  it('filters empty and non-string directories', () => {
    const args = commandCodeAgentDef.buildArgs(
      '',
      [],
      ['', null, '/repo/skills', undefined] as unknown as string[],
      {},
      {},
    );
    expect(args.filter((arg) => arg === '--add-dir')).toHaveLength(1);
    expect(args[args.indexOf('--add-dir') + 1]).toBe('/repo/skills');
  });

  it('emits --resume only when a stored session id exists', () => {
    const resuming = commandCodeAgentDef.buildArgs('', [], [], {}, {
      resumeSessionId: '2f1e9c0a-4b7c-4d1e-9098-9c1c1d0f7a11',
    });
    expect(resuming[resuming.indexOf('--resume') + 1]).toBe(
      '2f1e9c0a-4b7c-4d1e-9098-9c1c1d0f7a11',
    );

    const fresh = commandCodeAgentDef.buildArgs('', [], [], {}, { resumeSessionId: null });
    expect(fresh).not.toContain('--resume');
  });
});

describe('command-code capability gating', () => {
  it('omits --trust when the help probe reports the flag is gone', () => {
    agentCapabilities.set('command-code', { trust: false });
    expect(commandCodeAgentDef.buildArgs('', [], [], {}, {})).not.toContain('--trust');
  });

  it('restores todo_write only on a build that advertises --tools-enable', () => {
    const beforeProbe = commandCodeAgentDef.buildArgs('', [], [], {}, {});
    expect(beforeProbe).not.toContain('--tools-enable');

    agentCapabilities.set('command-code', { toolsEnable: true });
    const advertised = commandCodeAgentDef.buildArgs('', [], [], {}, {});
    expect(advertised[advertised.indexOf('--tools-enable') + 1]).toBe('todo_write');
  });

  it('drops --add-dir and --effort only when the help probe proves them absent', () => {
    agentCapabilities.set('command-code', { addDir: false, effort: false });
    const args = commandCodeAgentDef.buildArgs('', [], ['/repo/skills'], { reasoning: 'high' }, {});
    expect(args).not.toContain('--add-dir');
    expect(args).not.toContain('--effort');
  });
});

describe('command-code definition metadata', () => {
  it('declares the runtime identity', () => {
    expect(commandCodeAgentDef.id).toBe('command-code');
    expect(commandCodeAgentDef.name).toBe('Command Code');
    expect(commandCodeAgentDef.bin).toBe('command-code');
    // `cmd` is absent on purpose: on Windows that name is the shell.
    expect(commandCodeAgentDef.fallbackBins).toEqual(['cmdc', 'commandcode']);
  });

  it('uses its own NDJSON stream format and stdin delivery', () => {
    expect(commandCodeAgentDef.streamFormat).toBe('command-code-stream-json');
    expect(commandCodeAgentDef.promptViaStdin).toBe(true);
    expect(def.promptViaFile).toBeUndefined();
    expect(def.maxPromptArgBytes).toBeUndefined();
  });

  it('captures the CLI-minted session id for native resume', () => {
    expect(commandCodeAgentDef.resumesSessionViaCli).toBe(true);
    expect(commandCodeAgentDef.capturesSessionIdFromStream).toBe(true);
  });

  it('forwards external MCP servers through the project .mcp.json', () => {
    expect(commandCodeAgentDef.externalMcpInjection).toBe('claude-mcp-json');
  });

  it('probes auth through whoami and the root help surface', () => {
    expect(commandCodeAgentDef.authProbe?.args).toEqual(['whoami']);
    expect(commandCodeAgentDef.helpArgs).toEqual(['--help']);
    expect(commandCodeAgentDef.capabilityFlags).toMatchObject({
      '--add-dir': 'addDir',
      '--effort': 'effort',
      '--trust': 'trust',
      '--tools-enable': 'toolsEnable',
    });
  });

  it('does not claim image support', () => {
    expect(def.supportsImagePaths).toBeUndefined();
  });
});

describe('command-code model discovery', () => {
  // Verbatim shape from `command-code --list-models` on CLI 1.69.0: a padded
  // two-column table under section headers, with examples and a docs footer.
  const REAL_LIST_MODELS_OUTPUT = [
    'Available models  ·  3 models',
    '',
    'Open Source',
    '',
    'deepseek/deepseek-v4-pro               hybrid-attention long-context reasoning',
    'deepseek/deepseek-v4-flash             fast hybrid-attention reasoning (default)',
    'moonshotai/kimi-k3                     long-horizon coding & knowledge work with 1M context',
    '',
    'Anthropic',
    '',
    'claude-sonnet-4-6                      older Sonnet, still fast & capable',
    '',
    'Pass the full id, or just the short name after the last "/":',
    'cmdc --model moonshotai/kimi-k2.5',
    '',
    'Decision models (headless only)',
    'typesafe/jev  typed questions in, probabilities out',
    '',
    'Docs:  https://commandcode.ai/docs/reference/cli/models',
  ].join('\n');

  it('parses the installed CLI table and ignores its headers, examples and footer', () => {
    expect(commandCodeAgentDef.listModels?.args).toEqual(['--list-models']);
    expect(commandCodeAgentDef.listModels?.parse(REAL_LIST_MODELS_OUTPUT)?.map((m) => m.id)).toEqual([
      'default',
      'deepseek/deepseek-v4-pro',
      'deepseek/deepseek-v4-flash',
      'moonshotai/kimi-k3',
      'claude-sonnet-4-6',
      'typesafe/jev',
    ]);
  });

  it('parses a one-id-per-line listing', () => {
    const stdout = 'deepseek/deepseek-v4-flash\nclaude-sonnet-4-6\n\n';
    expect(commandCodeAgentDef.listModels?.parse(stdout)).toEqual([
      { id: 'default', label: 'Default (CLI config)' },
      { id: 'deepseek/deepseek-v4-flash', label: 'deepseek/deepseek-v4-flash' },
      { id: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6' },
    ]);
  });

  it('parses a JSON array listing', () => {
    const stdout = JSON.stringify(['gpt-5.3-codex', 'zai-org/GLM-5.3']);
    expect(commandCodeAgentDef.listModels?.parse(stdout)?.map((model) => model.id)).toEqual([
      'default',
      'gpt-5.3-codex',
      'zai-org/GLM-5.3',
    ]);
  });

  it('never mistakes table furniture for a model', () => {
    // Each of these lines carries a token the id shape alone would accept.
    for (const line of [
      'Available models  ·  84 models',
      'Docs:  https://commandcode.ai/docs/reference/cli/models',
      'cmdc --model kimi-k2.5',
      'Open Source',
      'Pass the full id, or just the short name after the last "/":',
      'Decision models (headless only)',
    ]) {
      expect(commandCodeAgentDef.listModels?.parse(line)).toBeNull();
    }
  });

  it('returns null for empty output so the fallback list stands', () => {
    expect(commandCodeAgentDef.listModels?.parse('')).toBeNull();
    expect(commandCodeAgentDef.listModels?.parse('   \n')).toBeNull();
  });
});

describe('command-code fallback models', () => {
  it('starts with the CLI-config default', () => {
    expect(commandCodeAgentDef.fallbackModels[0]).toEqual({
      id: 'default',
      label: 'Default (CLI config)',
    });
  });

  it('carries exact catalog ids, lowercase as the CLI prints them', () => {
    const ids = commandCodeAgentDef.fallbackModels.map((model) => model.id);
    expect(ids).toContain('deepseek/deepseek-v4-flash');
    expect(ids).toContain('claude-sonnet-4-6');
    expect(ids).toContain('zai-org/glm-5.3');
    expect(ids).toContain('qwen/qwen3.8-max');
    expect(ids).toContain('moonshotai/kimi-k2.5');
  });

  it('declares per-model efforts with the default sentinel first', () => {
    const model = commandCodeAgentDef.fallbackModels.find(
      (candidate) => candidate.id === 'deepseek/deepseek-v4-flash',
    );
    expect(model?.reasoningOptions?.map((option) => option.id)).toEqual([
      'default',
      'high',
      'max',
    ]);
    expect(model?.reasoningOptions?.[0]?.default).toBe(true);
  });

  it('leaves models without advertised efforts without a picker', () => {
    const model = commandCodeAgentDef.fallbackModels.find(
      (candidate) => candidate.id === 'moonshotai/Kimi-K2.5',
    );
    expect(model?.reasoningOptions).toBeUndefined();
  });

  it('declares no def-level reasoningOptions, so effort stays per-model', () => {
    expect(def.reasoningOptions).toBeUndefined();
  });
});
