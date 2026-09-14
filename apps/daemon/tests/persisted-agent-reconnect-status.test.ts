import assert from 'node:assert/strict';
import { describe, test } from 'vitest';

import { daemonAgentPayloadToPersistedAgentEvent } from '../src/runtimes/chat-run-messages.js';

/**
 * `agent_reconnecting` must survive into the transcript.
 *
 * Recorded case (isolated data dir `~/.od-chatpanel-preview`, conversation
 * `f75a2c50-…`): codex's connection to the model dropped mid-turn, the daemon
 * surfaced one `Reconnecting... 1/5`, and after the reconnect the model wrote
 * its whole conclusion a second time — differently worded, because it was
 * re-generated rather than replayed. The transcript therefore holds two
 * conclusions.
 *
 * The status row was being dropped at persistence time, so after a refresh
 * there was nothing left to explain the seam. Keeping the row does not stop the
 * duplication; it stops the duplication from being inexplicable.
 */
describe('重连状态落库', () => {
  test('agent_reconnecting 要落库,并带上第几次重连', () => {
    assert.deepEqual(
      daemonAgentPayloadToPersistedAgentEvent({
        type: 'status',
        label: 'agent_reconnecting',
        detail: '1/5',
      }),
      { kind: 'status', label: 'agent_reconnecting', detail: '1/5' },
    );
  });

  /**
   * The guard on the other side. The labels below are polling-shaped — they
   * describe a state, fire repeatedly, and are superseded by whatever comes
   * next — so replaying them adds empty rows and nothing else. Whoever widens
   * the reconnect change must not take these with it.
   */
  test('真正的轮询噪音仍然不落库', () => {
    for (const label of [
      'waiting_for_first_output',
      'tool_call',
      'tool_call_update',
      'session_update',
      'opencode_compaction',
    ]) {
      assert.equal(
        daemonAgentPayloadToPersistedAgentEvent({ type: 'status', label }),
        null,
        `${label} 不该落库`,
      );
    }
  });
});
