import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createJsonEventStreamHandler } from '../../../src/runtimes/json-event-stream.js';
import { createOdNextRunProtocol } from '../../../src/strategies/od-next/protocol.js';

const key = '5e819e50c013db87';
const marker = `<od-production-ready key="${key}" />`;

describe('plan continuation marker', () => {
  it('recognizes a split marker and hides it from streaming and persisted text', () => {
    const text = `Plan: build a landing page and a deck.\n${marker}`;
    for (let split = 0; split <= text.length; split++) {
      const stream = createOdNextRunProtocol(null, key);
      const visible = stream.push(text.slice(0, split)) + stream.push(text.slice(split));
      const result = stream.finish();
      expect(result.parsed.productionReady).toBe(true);
      expect(visible + result.visibleTail).toBe('Plan: build a landing page and a deck.\n');
      expect(result.parsed.visibleText).toBe(visible + result.visibleTail);
    }
  });
  it.each([
    'Plan only.',
    `Plan.\n<od-production-ready key="0000" />`,
    `Plan.\n${marker}\n<od-production-ready key="0000" />`,
    `${marker}\nPlan.`,
    `Plan.\n\`\`\`xml\n${marker}\n\`\`\``,
    `Plan.\n> ${marker}`,
    `Plan.\n    ${marker}`,
    `Example: \`${marker}\``,
    `Plan.\n> Ready.${marker}`,
    `Plan.\n    Ready.${marker}`,
    `Plan.\nExample: \`unfinished code ${marker}`,
    `Plan.\\${marker}`,
    `Plan.\n"${marker}"`,
    `Plan.\n${marker}\nOne more question.`,
    `Plan.\n<od-production-ready key="${key}"`,
    marker,
  ])('does not continue for a missing, quoted, stale or incomplete signal: %s', text => {
    const stream = createOdNextRunProtocol(null, key);
    for (const char of text) stream.push(char);
    expect(stream.finish().parsed.productionReady).toBe(false);
  });
  it.each([
    ['no newline', `计划已完成。${marker}`, '计划已完成。'],
    ['inline after a code span', `创建 \`index.html\`。${marker}`, '创建 `index.html`。'],
    ['spaces before marker', `计划已完成。 ${marker}\n`, '计划已完成。 \n'],
    ['bare control line', `计划已完成。\nod-production-ready key="${key}"`, '计划已完成。\n'],
    ['missing self-closing slash', `计划已完成。\n<od-production-ready key="${key}">`, '计划已完成。\n'],
    ['missing closing quote and slash', `计划已完成。\n<od-production-ready key="${key}>`, '计划已完成。\n'],
    ['inline non-self-closing tag', `计划已完成。<od-production-ready key="${key}">`, '计划已完成。'],
  ])('accepts a terminal %s without leaking it at any chunk boundary', (_name, text, expected) => {
    for (let split = 0; split <= text.length; split++) {
      const stream = createOdNextRunProtocol(null, key);
      const visible = stream.push(text.slice(0, split)) + stream.push(text.slice(split));
      const result = stream.finish();
      expect(result.parsed.productionReady).toBe(true);
      expect(visible + result.visibleTail).toBe(expected);
      expect(result.parsed.visibleText).toBe(expected);
    }
    const stream = createOdNextRunProtocol(null, key);
    let visible = '';
    for (const char of text) visible += stream.push(char);
    const result = stream.finish();
    expect(result.parsed.productionReady).toBe(true);
    expect(visible + result.visibleTail).toBe(expected);
  });
  it.each([
    `计划。<od-production-ready key="0000" />`,
    `计划。\n<od-production-ready key="0000">`,
    `计划。\n<od-production-ready key="${key}0>`,
    `计划。${marker}还有一个问题。`,
    `计划。\nod-production-ready key="0000"`,
    `计划。\nod-production-ready key="${key}`, // Not a complete bare line.
    `计划。\nod-production-ready key="${key}"\n还有一个问题。`,
    `计划。\n> od-production-ready key="${key}"`,
    `计划。\n\`\`\`\nod-production-ready key="${key}"\n\`\`\``,
    `计划。\n说明：od-production-ready key="${key}"`,
    `od-production-ready key="${key}"`, // A signal alone is not a plan.
  ])('keeps relaxed syntax from authorizing a stale, quoted or non-terminal signal: %s', text => {
    const stream = createOdNextRunProtocol(null, key);
    for (const char of text) stream.push(char);
    expect(stream.finish().parsed.productionReady).toBe(false);
  });
  it.each([`计划。${marker}`, `计划。\nod-production-ready key="${key}"`])(
    'does not authorize relaxed syntax from raw stdout', text => {
      const stream = createOdNextRunProtocol(null, key);
      stream.push(text, false);
      expect(stream.finish().parsed.productionReady).toBe(false);
    },
  );
  it('accepts duplicate current markers at the end, including fragmented streams', () => {
    const text = `Plan.\n${marker}\n${marker}\n`;
    for (let split = 0; split <= text.length; split++) {
      const stream = createOdNextRunProtocol(null, key);
      const visible = stream.push(text.slice(0, split)) + stream.push(text.slice(split));
      const result = stream.finish();
      expect(result.parsed.productionReady).toBe(true);
      expect(visible + result.visibleTail).toBe('Plan.\n');
    }
  });
  it('cannot authorize production from a marker hidden in a retired block', () => {
    for (const close of ['', '</open-design-runtime-state>']) {
      const stream = createOdNextRunProtocol(null, key);
      stream.push(`Visible plan.\n<open-design-runtime-state>\n<od-production-ready key="${key}" />${close}`);
      expect(stream.finish().parsed.productionReady).toBe(false);
    }
  });

  it('does not gate a plain answer on a malformed legacy block', () => {
    const stream = createOdNextRunProtocol(null, key);
    stream.push('Done.\n<open-design-runtime-state>\n{broken}\n</open-design-runtime-state>');
    const { parsed } = stream.finish();
    expect(parsed.visibleText.trim()).toBe('Done.');
    expect(parsed.productionReady).toBe(false);
  });
  it('bounds a very long line without treating its suffix as a new control line', () => {
    const stream = createOdNextRunProtocol(null, key);
    const text = 'x'.repeat(5000) + marker;
    const visible = stream.push(text.slice(0, 4500)) + stream.push(text.slice(4500));
    const { parsed, visibleTail } = stream.finish();
    expect(parsed.productionReady).toBe(false);
    expect(visible + visibleTail).toBe(text);
  });
  it('does not treat raw stdout as a model continuation request', () => {
    const stream = createOdNextRunProtocol(null, key);
    stream.push('Plan.\n');
    stream.push(marker, false);
    expect(stream.finish().parsed.productionReady).toBe(false);
  });
  it('keeps a long fenced example from becoming an executable marker', () => {
    const stream = createOdNextRunProtocol(null, key);
    stream.push('```' + 'x'.repeat(5000));
    stream.push(`\n${marker}\n`);
    expect(stream.finish().parsed.productionReady).toBe(false);
  });
});

// The real recorded Codex event shape must remain usable without any OD marker.
const replayRoot = new URL('../../../../../mocks/', import.meta.url);
const replayTrace = 'dcdff3b3-cd39-4dcd-be83-372830a29639';
it.skipIf(!existsSync(new URL(`recordings/${replayTrace}.jsonl`, replayRoot)))(
  'replays a recorded Codex CLI turn without inventing a continuation', () => {
    const replay = spawnSync(process.execPath, [fileURLToPath(new URL('mock-agent.mjs', replayRoot)), '--as', 'codex', '--no-delay'], {
      env: { ...process.env, OD_MOCKS_TRACE: replayTrace, OD_MOCKS_NO_DELAY: '1' },
      input: 'Replay recorded task', encoding: 'utf8', timeout: 30_000,
    });
    expect(replay.status, replay.stderr).toBe(0);
    const protocol = createOdNextRunProtocol(null, key);
    let textEvents = 0;
    const handler = createJsonEventStreamHandler('codex', event => {
      if (event.type === 'text_delta' && typeof event.delta === 'string') {
        textEvents++;
        protocol.push(event.delta);
      }
    });
    handler.feed(replay.stdout);
    const { parsed } = protocol.finish();
    expect(textEvents).toBeGreaterThan(0);
    expect(parsed.visibleText.trim()).not.toBe('');
    expect(parsed.productionReady).toBe(false);
  },
);

it('does not parse or validate retired model contracts', () => {
  const protocol = createOdNextRunProtocol(null, key);
  protocol.push('Hello.');
  expect(protocol.finish().parsed).toEqual({ visibleText: 'Hello.', productionReady: false });
});
