import { describe, expect, it } from 'vitest';
import { codexAgentDef } from '../../src/runtimes/defs/codex.js';

/**
 * Codex's own model catalog ships `"default_reasoning_summary": "none"` for the
 * current frontier models (verbatim from the `gpt-5.6-sol` entry embedded in
 * codex-cli 0.149.1). With that default the CLI never asks the API for a
 * reasoning summary, so a turn that provably reasons still streams no reasoning
 * text at all.
 *
 * Measured on codex-cli 0.149.1, same prompt, same sandbox, only the config
 * differing:
 *
 *   without the override → {"type":"item.completed","item":{"type":"agent_message",…}}
 *                          and nothing else; `reasoning_output_tokens: 516`
 *   with the override    → {"type":"item.completed","item":{"id":"item_1",
 *                            "type":"reasoning",
 *                            "text":"**Calculating favorable combinations ratio**"}}
 *
 * The daemon's `codex` event parser already understands that item shape
 * (`emitCodexReasoningItem` in json-event-stream.ts turns `item.text` into
 * `thinking_delta`), so the only thing standing between a codex run and a
 * populated Thinking block is asking for the summary in the first place.
 *
 * The override must be byte-identical on the create turn and on the resume
 * turn: codex hashes its per-turn `turn_context` block, and a flag that
 * appears on only one of the two would break the upstream prefix cache that
 * `exec resume` exists to reuse.
 */
describe('codex buildArgs reasoning summary', () => {
  const findOverride = (args: string[]): string | undefined =>
    args.find((a) => a.startsWith('model_reasoning_summary='));

  it('asks for a reasoning summary on a create turn', () => {
    const args = codexAgentDef.buildArgs('prompt', [], [], {}, {});
    expect(findOverride(args)).toBe('model_reasoning_summary="detailed"');
  });

  it('asks for the same reasoning summary on a resume turn', () => {
    const args = codexAgentDef.buildArgs('prompt', [], [], {}, {
      resumeSessionId: 'thread-abc',
    });
    expect(findOverride(args)).toBe('model_reasoning_summary="detailed"');
  });

  it('passes the override as a -c config pair', () => {
    const args = codexAgentDef.buildArgs('prompt', [], [], {}, {});
    const i = args.indexOf('model_reasoning_summary="detailed"');
    expect(i).toBeGreaterThan(0);
    expect(args[i - 1]).toBe('-c');
  });
});
