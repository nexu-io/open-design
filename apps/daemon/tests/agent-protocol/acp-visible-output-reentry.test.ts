import { describe, expect, it } from 'vitest';
import { runMemoryAcpTurn, safeObservation, textUpdate } from './acp-memory-peer.js';

describe('ACP completion preserves text-before-terminal under synchronous send reentry', () => {
  for (const amr of [true, false]) {
    it(`${amr ? 'AMR residual-output check' : 'generic original completion'} tolerates the same prompt result replayed from streaming status`, async () => {
      let replayCount = 0;
      const turn = await runMemoryAcpTurn({
        amr,
        prompt: 'Return exactly the single character < and nothing else.',
        updates: [textUpdate('<')],
        onSend(event, payload, replayPromptResultSynchronously) {
          if (event === 'agent' && payload.type === 'status' && payload.label === 'streaming' && replayCount === 0) {
            replayCount += 1;
            // Exercise the public synchronous callback/notification contract,
            // not a claim that real asynchronous pipe reads interleave here.
            // The helper emits the identical actual JSONL response via stdout;
            // no private completion function or success flag is invoked.
            replayPromptResultSynchronously();
          }
        },
      });
      const evidence = safeObservation(turn);
      expect(replayCount, evidence).toBe(1);
      expect(turn.beforePromptResult.visibleText, evidence).toBe('');
      expect(turn.beforePromptResult.terminals, evidence).toEqual([]);
      expect(turn.textDeltas, evidence).toEqual(['<']);
      expect(turn.tools, evidence).toEqual([]);
      expect(turn.errors, evidence).toEqual([]);
      expect(turn.fatal, evidence).toBe(false);
      expect(turn.completed, evidence).toBe(true);
      expect(turn.promptCompleteCount, evidence).toBe(1);
      expect(turn.terminals, evidence).toEqual(['completed']);
      expect(turn.completionOrder.filter((entry) => entry === 'replay_prompt_result'), evidence).toHaveLength(1);
      const textIndex = turn.completionOrder.indexOf('text_delta');
      const terminalIndex = turn.completionOrder.indexOf('terminal:completed');
      expect(textIndex, evidence).toBeGreaterThanOrEqual(0);
      expect(terminalIndex, evidence).toBeGreaterThan(textIndex);
      // A completed run cannot publish a late text delta after its terminal.
      expect(turn.completionOrder.slice(terminalIndex + 1), evidence).not.toContain('text_delta');
    });
  }
});
