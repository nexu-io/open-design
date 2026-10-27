import { describe, expect, it } from 'vitest';

import { createCopilotStreamHandler } from '../../src/copilot-stream.js';
import { createClaudeStreamHandler } from '../../src/runtimes/claude-stream.js';
import { createJsonEventStreamHandler } from '../../src/runtimes/json-event-stream.js';
import { createQoderStreamHandler } from '../../src/runtimes/qoder-stream.js';

/*
 * Live-stream half of "a run event never carries an unbounded payload".
 *
 * Every stdout line a runtime parser does not recognise is handed to the SSE
 * fan-out (and the daemon's in-memory run buffer) as `{ type: 'raw', line }`.
 * Nothing renders it, yet the browser keeps it in the message it holds — which
 * is how one long cursor-agent conversation grew the renderer to 3+ GB. So the
 * line must be bounded where it is produced, by every parser that produces one,
 * not only when it is stored.
 */

/** The per-event budget (UTF-8 bytes of one event's JSON). */
const PERSISTED_EVENT_BUDGET_BYTES = 64 * 1024;

type Event = Record<string, unknown>;
type Parser = { feed(chunk: string): void; flush(): void };

const PARSERS: Array<[string, (onEvent: (event: Event) => void) => Parser]> = [
  ['claude-stream', (onEvent) => createClaudeStreamHandler(onEvent)],
  ['copilot-stream', (onEvent) => createCopilotStreamHandler(onEvent)],
  ['qoder-stream', (onEvent) => createQoderStreamHandler(onEvent)],
  ...(['cursor-agent', 'opencode', 'gemini', 'kimi', 'codex'] as const).map(
    (kind): [string, (onEvent: (event: Event) => void) => Parser] => [
      `json-event-stream (${kind})`,
      (onEvent) => createJsonEventStreamHandler(kind, onEvent),
    ],
  ),
];

function rawEventsFor(
  makeParser: (onEvent: (event: Event) => void) => Parser,
  input: string,
): Event[] {
  const events: Event[] = [];
  const parser = makeParser((event) => events.push(event));
  parser.feed(input);
  parser.flush();
  return events.filter((event) => event.type === 'raw');
}

function expectBounded(event: Event | undefined, original: string) {
  expect(event).toBeDefined();
  const line = String(event!.line);
  expect(Buffer.byteLength(JSON.stringify(event))).toBeLessThanOrEqual(PERSISTED_EVENT_BUDGET_BYTES);
  expect(line.startsWith(original.slice(0, 32))).toBe(true);
  expect(line).toContain(`of ${Buffer.byteLength(original)} bytes`);
  expect(event!.truncated).toEqual({ originalBytes: Buffer.byteLength(original) });
}

describe('raw stdout lines are bounded on the live event stream', () => {
  // Not JSON, so every parser falls through to `raw`.
  const oversizedText = `WARN unparsed agent output ${'x'.repeat(200_000)} END`;

  it.each(PARSERS)('%s bounds an oversized newline-terminated line', (_name, makeParser) => {
    const raw = rawEventsFor(makeParser, `${oversizedText}\n`);
    expect(raw).toHaveLength(1);
    expectBounded(raw[0], oversizedText);
  });

  it.each(PARSERS)('%s bounds an oversized trailing line released by flush()', (_name, makeParser) => {
    const raw = rawEventsFor(makeParser, oversizedText);
    expect(raw).toHaveLength(1);
    expectBounded(raw[0], oversizedText);
  });

  it.each(PARSERS)('%s passes a line that fits through unchanged', (_name, makeParser) => {
    const small = 'WARN a short unparsed line';
    expect(rawEventsFor(makeParser, `${small}\n`)).toEqual([{ type: 'raw', line: small }]);
  });

  it('qoder keeps an oversized unrecognised JSON line valid JSON', () => {
    // qoder echoes tool results back as `user` lines it has no lane for.
    const line = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'r'.repeat(300_000) }],
      },
      session_id: 'qoder-session',
    });
    const raw = rawEventsFor((onEvent) => createQoderStreamHandler(onEvent), `${line}\n`);
    expect(raw).toHaveLength(1);
    expect(Buffer.byteLength(JSON.stringify(raw[0]))).toBeLessThanOrEqual(PERSISTED_EVENT_BUDGET_BYTES);
    const parsed = JSON.parse(String(raw[0]!.line));
    expect(parsed.type).toBe('user');
    expect(parsed.message.content[0].tool_use_id).toBe('tool-1');
    expect(raw[0]!.truncated).toEqual({ originalBytes: Buffer.byteLength(line) });
  });
});
