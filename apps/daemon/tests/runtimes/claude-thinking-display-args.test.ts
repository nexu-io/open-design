import { afterEach, describe, expect, it } from 'vitest';
import { claudeAgentDef } from '../../src/runtimes/defs/claude.js';
import { agentCapabilities } from '../../src/runtimes/capabilities.js';

/**
 * Claude Code redacts extended-thinking text unless the request carries a
 * thinking `display` mode. In headless `-p --output-format stream-json` the
 * CLI resolves that display to `undefined`, keeps the `redact-thinking` beta
 * on the request, and the API answers with `thinking_delta` frames whose
 * `thinking` field is the empty string. `--thinking-display summarized` is the
 * only lever on the CLI surface that restores the text.
 */
describe('claude buildArgs thinking display', () => {
  afterEach(() => {
    agentCapabilities.delete('claude');
  });

  it('asks for summarized thinking when the CLI supports --thinking-display', () => {
    agentCapabilities.set('claude', { thinkingDisplay: true });
    const args = claudeAgentDef.buildArgs('prompt', [], [], {}, {});
    expect(args).toContain('--thinking-display');
    expect(args[args.indexOf('--thinking-display') + 1]).toBe('summarized');
  });

  it('omits the flag when the probe did not confirm support', () => {
    agentCapabilities.set('claude', { thinkingDisplay: false });
    const args = claudeAgentDef.buildArgs('prompt', [], [], {}, {});
    expect(args).not.toContain('--thinking-display');
  });

  it('omits the flag when no capability probe ran at all', () => {
    const args = claudeAgentDef.buildArgs('prompt', [], [], {}, {});
    expect(args).not.toContain('--thinking-display');
  });
});
