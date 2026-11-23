/**
 * Qoder CLI model discovery.
 *
 * `qodercli --list-models` prints a `MODEL` header followed by one model id
 * per line. The adapter used to ship a static tier list (`lite`, `efficient`,
 * …) that Qoder does not accept as `--model` values, so picking one failed the
 * run. These specs pin the parser and the fail-closed fallback.
 */

import { describe, expect, it } from 'vitest';

import { parseQoderModelList, qoderAgentDef } from '../../src/runtimes/defs/qoder.js';

describe('parseQoderModelList', () => {
  it('turns the --list-models table into picker options', () => {
    const stdout = [
      'MODEL',
      'Auto',
      'Qwen4-Max',
      'DeepSeek-Flash',
      '',
    ].join('\n');

    expect(parseQoderModelList(stdout)).toEqual([
      { id: 'default', label: 'Default (CLI config)' },
      { id: 'Auto', label: 'Auto' },
      { id: 'Qwen4-Max', label: 'Qwen4-Max' },
      { id: 'DeepSeek-Flash', label: 'DeepSeek-Flash' },
    ]);
  });

  it('tolerates CRLF output, blank lines, padding, and a lower-case header', () => {
    const stdout = 'model\r\n\r\n  Auto  \r\nGLM-5.3\r\n';

    expect(parseQoderModelList(stdout)?.map((model) => model.id)).toEqual([
      'default',
      'Auto',
      'GLM-5.3',
    ]);
  });

  it('keeps the CLI order and drops repeated ids', () => {
    const stdout = 'MODEL\nKimi-K3.1-Pro\nAuto\nKimi-K3.1-Pro\n';

    expect(parseQoderModelList(stdout)?.map((model) => model.id)).toEqual([
      'default',
      'Kimi-K3.1-Pro',
      'Auto',
    ]);
  });

  it('returns null when the CLI prints nothing usable', () => {
    expect(parseQoderModelList('')).toBeNull();
    expect(parseQoderModelList('MODEL\n')).toBeNull();
    expect(parseQoderModelList('\r\n  \r\n')).toBeNull();
  });

  it('refuses headerless output instead of reporting it as a catalog', () => {
    // A status or usage banner from an older/changed CLI is not a model table;
    // accepting it would surface text as `--model` values that Qoder rejects.
    expect(parseQoderModelList('Auto\nDeepSeek-Flash\n')).toBeNull();
    expect(parseQoderModelList('qodercli 1.1.64\n')).toBeNull();
    // The documented header has to lead the output, not sit below other text.
    expect(parseQoderModelList('Models for your account:\nMODEL\nAuto\n')).toBeNull();
  });
});

describe('qoderAgentDef model wiring', () => {
  it('probes --list-models instead of shipping unverified tier ids', () => {
    expect(qoderAgentDef.listModels?.args).toEqual(['--list-models']);
    expect(qoderAgentDef.listModels?.timeoutMs).toBe(15_000);
    expect(qoderAgentDef.fallbackModels).toEqual([
      { id: 'default', label: 'Default (CLI config)' },
    ]);
  });
});