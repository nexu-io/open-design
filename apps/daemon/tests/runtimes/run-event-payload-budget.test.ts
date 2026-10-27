import { describe, expect, it } from 'vitest';

import {
  RUN_EVENT_JSON_BUDGET_BYTES,
  boundPersistedAgentEvent,
  boundRawAgentLine,
} from '../../src/runtimes/run-event-payload-budget.js';
import { jsonBytes, syntheticHtmlDocument } from '../helpers/cursor-agent-stream-shapes.js';

/*
 * Unit-level pins for I1 ("a persisted run event never carries unbounded
 * payload"): whatever shape arrives, the stored event fits the budget; what
 * fits is returned untouched (same reference); shortening is deterministic,
 * idempotent and tells the reader how much was cut.
 */

function fits(event: unknown): boolean {
  return jsonBytes(event) <= RUN_EVENT_JSON_BUDGET_BYTES;
}

describe('run event payload budget', () => {
  it('is 64 KiB per stored event', () => {
    expect(RUN_EVENT_JSON_BUDGET_BYTES).toBe(64 * 1024);
  });

  it('returns events that already fit — and every text/thinking event — untouched', () => {
    const small = { kind: 'tool_result', toolUseId: 't', content: 'ok', isError: false };
    const text = { kind: 'text', text: 'x'.repeat(500_000) };
    const thinking = { kind: 'thinking', text: 'y'.repeat(500_000) };
    expect(boundPersistedAgentEvent(small)).toBe(small);
    expect(boundPersistedAgentEvent(text)).toBe(text);
    expect(boundPersistedAgentEvent(thinking)).toBe(thinking);
  });

  it('bounds a non-JSON raw line with a head, a tail and an explicit marker', () => {
    const line = `HEAD-${'a'.repeat(400_000)}-TAIL`;
    const bounded = boundPersistedAgentEvent<Record<string, unknown>>({ kind: 'raw', line }) as {
      line: string;
      truncated: unknown;
    };
    expect(fits(bounded)).toBe(true);
    expect(bounded.line.startsWith('HEAD-')).toBe(true);
    expect(bounded.line.endsWith('-TAIL')).toBe(true);
    expect(bounded.line).toContain(`of ${Buffer.byteLength(line)} bytes`);
    expect(bounded.truncated).toEqual({ originalBytes: Buffer.byteLength(line) });
  });

  it('is deterministic and idempotent, and distinguishes originals that share a head and tail', () => {
    const a = { kind: 'raw', line: `${'h'.repeat(200_000)}A${'t'.repeat(200_000)}` };
    const b = { kind: 'raw', line: `${'h'.repeat(200_000)}B${'t'.repeat(200_000)}` };
    const boundA = boundPersistedAgentEvent(a);
    expect(boundPersistedAgentEvent(a)).toEqual(boundA);
    expect(boundPersistedAgentEvent(boundA)).toBe(boundA);
    // Adjacent identical events are de-duplicated downstream; two different
    // originals must never collapse into the same stored event.
    expect(JSON.stringify(boundPersistedAgentEvent(b))).not.toBe(JSON.stringify(boundA));
  });

  it('keeps an oversized JSON raw line valid JSON and drops known full-file fields first', () => {
    const file = syntheticHtmlDocument(700_000);
    const line = JSON.stringify({
      type: 'tool_call',
      subtype: 'completed',
      call_id: 'c1',
      tool_call: {
        editToolCall: {
          args: { path: '/p/index.html' },
          result: { success: { path: '/p/index.html', diffString: '@@ -1 +1 @@', beforeFullFileContent: file, afterFullFileContent: file } },
        },
      },
    });
    const bounded = boundRawAgentLine(line);
    expect(Buffer.byteLength(bounded.line)).toBeLessThan(4 * 1024);
    const parsed = JSON.parse(bounded.line);
    expect(parsed.tool_call.editToolCall.result.success.diffString).toBe('@@ -1 +1 @@');
    expect(parsed.tool_call.editToolCall.result.success.beforeFullFileContent)
      .toContain(`${Buffer.byteLength(file)} bytes`);
    expect(bounded.truncated).toEqual({ originalBytes: Buffer.byteLength(line) });
    // Lines that fit are returned as-is, with no metadata.
    expect(boundRawAgentLine('{"type":"thinking"}')).toEqual({ line: '{"type":"thinking"}' });
  });

  it('carries the Write/Edit line counts the chat row shows when their text is shortened', () => {
    const content = syntheticHtmlDocument(300_000);
    const write = boundPersistedAgentEvent({
      kind: 'tool_use', id: 'w', name: 'Write', input: { file_path: '/p/a.html', content },
    }) as { input: Record<string, unknown> };
    expect(fits(write)).toBe(true);
    expect(write.input.file_path).toBe('/p/a.html');
    expect(write.input.od_diff_stat).toEqual({ added: content.split('\n').length, removed: 0 });

    const edit = boundPersistedAgentEvent({
      kind: 'tool_use', id: 'e', name: 'Edit', input: { file_path: '/p/a.html', old_string: content, new_string: 'short\nnew' },
    }) as { input: Record<string, unknown> };
    expect(fits(edit)).toBe(true);
    expect(edit.input.od_diff_stat).toEqual({ added: 2, removed: content.split('\n').length });
    expect(edit.input.new_string).toBe('short\nnew');

    // A tool whose row never showed a count does not start showing one.
    const other = boundPersistedAgentEvent({
      kind: 'tool_use', id: 'o', name: 'create_file', input: { path: '/p/a.html', text: content },
    }) as { input: Record<string, unknown> };
    expect(other.input.od_diff_stat).toBeUndefined();
  });

  it('fits pathological shapes: many medium strings, escape-heavy text, multibyte text', () => {
    const manyEdits = boundPersistedAgentEvent({
      kind: 'tool_use',
      id: 'm',
      name: 'MultiEdit',
      input: {
        file_path: '/p/a.html',
        edits: Array.from({ length: 5_000 }, (_, index) => ({ old_string: `old ${index} ${'o'.repeat(40)}`, new_string: `new ${index}` })),
      },
    }) as { input: Record<string, unknown> };
    expect(fits(manyEdits)).toBe(true);
    expect(manyEdits.input.file_path).toBe('/p/a.html');

    const controlChars = boundPersistedAgentEvent({ kind: 'tool_result', toolUseId: 't', content: ''.repeat(200_000), isError: true });
    expect(fits(controlChars)).toBe(true);
    expect((controlChars as { isError: boolean }).isError).toBe(true);

    const cjk = boundPersistedAgentEvent({ kind: 'tool_result', toolUseId: 't', content: '设计稿'.repeat(100_000), isError: false }) as { content: string };
    expect(fits(cjk)).toBe(true);
    expect(cjk.content).not.toContain('�');

    const status = boundPersistedAgentEvent({ kind: 'status', label: 'error', detail: 'e'.repeat(300_000) }) as { label: string };
    expect(fits(status)).toBe(true);
    expect(status.label).toBe('error');
  });
});
