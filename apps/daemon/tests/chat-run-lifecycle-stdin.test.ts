import { describe, expect, it } from 'vitest';

import {
  recordPromptDeliveredAtSpawn,
  runtimeReadsPlainTextPromptFromStdin,
} from '../src/runtimes/chat-run-lifecycle.js';
import { claudeAgentDef } from '../src/runtimes/defs/claude.js';
import { codexAgentDef, withCodexTransport } from '../src/runtimes/defs/codex.js';
import { cursorAgentDef } from '../src/runtimes/defs/cursor-agent.js';
import { piAgentDef } from '../src/runtimes/defs/pi.js';

// Plain-text stdin prompts are delivered as a complete file-backed stdin at
// spawn (see agent-process.ts). These specs pin WHICH runtimes take that
// path and what the stdin telemetry reports for it.
describe('runtimeReadsPlainTextPromptFromStdin', () => {
  it('selects runtimes that read a plain-text prompt from stdin until EOF', () => {
    // cursor-agent is the 2026-09-14 incident runtime.
    expect(runtimeReadsPlainTextPromptFromStdin(cursorAgentDef)).toBe(true);
    expect(runtimeReadsPlainTextPromptFromStdin(withCodexTransport(codexAgentDef, 'exec-json'))).toBe(true);
  });

  it('leaves framed stdin protocols on the pipe', () => {
    // stream-json keeps stdin open for mid-turn messages (B11 steering).
    expect(runtimeReadsPlainTextPromptFromStdin(claudeAgentDef)).toBe(false);
    expect(runtimeReadsPlainTextPromptFromStdin(piAgentDef)).toBe(false);
    expect(runtimeReadsPlainTextPromptFromStdin(withCodexTransport(codexAgentDef, 'app-server'))).toBe(false);
    expect(runtimeReadsPlainTextPromptFromStdin({ promptViaStdin: true, streamFormat: 'dsh-profile-jsonl' })).toBe(false);
  });

  it('ignores argv/file prompt runtimes', () => {
    expect(runtimeReadsPlainTextPromptFromStdin({ promptViaStdin: false })).toBe(false);
    expect(runtimeReadsPlainTextPromptFromStdin({})).toBe(false);
  });
});

// Regression guard for `run_finished.stdin_backpressure` and the `stdin_write`
// phase once the prompt no longer travels through a pipe the daemon pumps.
describe('recordPromptDeliveredAtSpawn', () => {
  it('marks the prompt handed over in the historical phase order', () => {
    const marks: string[] = [];
    const run: { stdinBackpressure?: boolean } = {};
    recordPromptDeliveredAtSpawn(run, { mark: (mark) => marks.push(mark) });
    expect(marks).toEqual(['model_call_start', 'stdin_write_start', 'stdin_write_end']);
    expect(run.stdinBackpressure).toBe(false);
  });

  it('reports no backpressure: a file-backed stdin cannot stall the daemon write', () => {
    const run = { stdinBackpressure: true };
    recordPromptDeliveredAtSpawn(run, { mark: () => {} });
    expect(run.stdinBackpressure).toBe(false);
  });
});
