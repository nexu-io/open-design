import { describe, expect, it } from 'vitest';

import {
  buildOrbitNoLiveArtifactSummary,
  extractOrbitAgentFinalExplanation,
} from '../src/orbit-agent-summary.js';

describe('Orbit agent summary helpers', () => {
  it('preserves the agent final explanation for no-live-artifact Orbit runs', () => {
    const summary = buildOrbitNoLiveArtifactSummary([
      { event: 'agent', data: { type: 'text_delta', delta: 'Data loading failed, ' } },
      { event: 'agent', data: { type: 'text_delta', delta: 'so I did not create a daily digest artifact.' } },
    ]);

    expect(summary).toContain(
      'Agent succeeded but did not register a live artifact for this Orbit run.',
    );
    expect(summary).toContain(
      'Data loading failed, so I did not create a daily digest artifact.',
    );
  });

  it('extracts only user-visible text deltas from run events', () => {
    expect(
      extractOrbitAgentFinalExplanation([
        { event: 'stdout', data: { chunk: 'raw tool output' } },
        { event: 'stderr', data: { chunk: 'OPENAI_API_KEY=sk-raw-secret' } },
        { event: 'tool_result', data: { output: 'token=raw-tool-secret' } },
        { event: 'agent', data: { type: 'thinking_delta', delta: 'private reasoning' } },
        { event: 'agent', data: { type: 'tool_use', name: 'Read' } },
        { event: 'agent', data: { type: 'text_delta', delta: 'GitHub auth failed.' } },
      ]),
    ).toBe('GitHub auth failed.');
  });

  it('falls back to the implementation-level no-artifact marker without final text', () => {
    expect(buildOrbitNoLiveArtifactSummary([])).toBe(
      'Agent succeeded but did not register a live artifact for this Orbit run.',
    );
  });

  it('bounds long final explanations before storing them in the Orbit receipt', () => {
    const explanation = extractOrbitAgentFinalExplanation([
      { event: 'agent', data: { type: 'text_delta', delta: 'x'.repeat(2_100) } },
    ]);

    expect(explanation).toHaveLength(2_003);
    expect(explanation?.endsWith('...')).toBe(true);
  });
});
