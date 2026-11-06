import { describe, expect, it } from 'vitest';
import { runMemoryAcpTurn, safeObservation, textUpdate } from './acp-memory-peer.js';

describe('AMR generation cannot complete by publishing an unfinished internal tool opener', () => {
  for (const prefix of ['<tool_call', '<edit']) {
    it(`keeps ${prefix} internal and returns an actionable failure without native execution`, async () => {
      // The user requested generation, not a literal spelling or code example.
      // These are prefixes of the already-recognized tool_call/edit protocol,
      // not a policy about unknown od-* tags or readable envelope content.
      const prompt = 'Generate the requested design using the available tools.';
      const turn = await runMemoryAcpTurn({
        amr: true,
        prompt,
        updates: [textUpdate(prefix)],
      });
      const evidence = safeObservation(turn);
      expect(turn.requestMethods).toEqual(['initialize', 'session/new', 'session/set_model', 'session/prompt']);
      expect(turn.selectedModel).toBe('deepseek-v4-flash');
      expect(turn.sentPrompt).toEqual([{ type: 'text', text: prompt }]);
      expect(turn.beforePromptResult.visibleText, evidence).toBe('');
      expect(turn.beforePromptResult.terminals, evidence).toEqual([]);
      expect(turn.inputCompletedToolFrames).toBe(0);
      expect(turn.tools, evidence).toEqual([]);

      // Keep exposure and terminal behavior independently observable. A
      // text-only internal prefix must not become proof of executed work.
      expect.soft(turn.visibleText, evidence).toBe('');
      expect.soft(turn.textDeltas, evidence).toEqual([]);
      expect.soft(turn.completed, evidence).toBe(false);
      expect.soft(turn.fatal, evidence).toBe(true);
      expect.soft(turn.terminals, evidence).toEqual(['fatal']);
      expect.soft(turn.promptCompleteCount, evidence).toBe(0);
      expect.soft(turn.errors, evidence).toHaveLength(1);
      expect.soft(turn.errors[0]?.message, evidence).toEqual(expect.any(String));
      expect.soft(String(turn.errors[0]?.message ?? '').trim().length, evidence).toBeGreaterThan(0);
      expect.soft(turn.errors[0]?.code, evidence).toEqual(expect.any(String));
      expect.soft(turn.errors[0]?.retryable, evidence).toBe(true);
      // No new wording, S21 classification, retry attempt, or tool event is
      // manufactured by this specification.
    });
  }
});
