import { describe, expect, it } from 'vitest';

import {
  RUN_COST_UNAVAILABLE,
  RUN_COST_UNAVAILABLE_FALLBACK,
  runCostUnavailableMessage,
} from '../src/cli-help/run-cost-cli-help.js';

/**
 * `od run cost` is the CLI half of a dual-track capability, so the line it
 * prints when there is no report is product copy, not a debug string.
 *
 * The exhaustiveness of the map is enforced by the `Record` type in a CHECKED
 * module — `cli.ts` itself is `@ts-nocheck`, which is exactly why the map does
 * not live there. These tests cover the runtime half: that every reason resolves
 * to its own line, and that an unknown one degrades instead of printing
 * `undefined`.
 */
describe('runCostUnavailableMessage', () => {
  it('gives each unavailable reason its own line', () => {
    const messages = Object.values(RUN_COST_UNAVAILABLE);

    expect(new Set(messages).size).toBe(messages.length);
    for (const message of messages) {
      expect(message).not.toBe(RUN_COST_UNAVAILABLE_FALLBACK);
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it('names the agent stream, not the run, for an aggregate-usage log', () => {
    // The user must not be sent looking for a problem with their run: the cause
    // is the agent's stream family, and re-running changes nothing.
    const message = runCostUnavailableMessage('aggregate-usage-only');

    expect(message).toContain('once per run');
    expect(message).toContain('not per model call');
  });

  it('does not claim a run made no model call when usage is simply absent', () => {
    // Both causes have to be named: the log is indistinguishable between "never
    // reached the model" and "this stream reports nothing".
    const message = runCostUnavailableMessage('no-usage-frames');

    expect(message).toContain('no model call');
    expect(message).toContain('does not report usage');
  });

  it('falls back rather than printing undefined for an unknown or missing reason', () => {
    // A body from a newer daemon, or one with no reason at all, must not render
    // as `undefined` in a terminal.
    expect(runCostUnavailableMessage(undefined)).toBe(RUN_COST_UNAVAILABLE_FALLBACK);
    expect(runCostUnavailableMessage('something-new')).toBe(RUN_COST_UNAVAILABLE_FALLBACK);
    expect(runCostUnavailableMessage(42)).toBe(RUN_COST_UNAVAILABLE_FALLBACK);
    expect(runCostUnavailableMessage(null)).toBe(RUN_COST_UNAVAILABLE_FALLBACK);
  });
});
