// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChatMessage, PersistedAgentEvent } from '@open-design/contracts';
import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { I18nProvider } from '../../../src/i18n';
import { elideFileName } from '../../../src/runtime/chat/format';

afterEach(cleanup);

// OPEND-2791's two persisted calls; the workspace prefix is anonymized.
const PATH = '/workspace/.od-skills/fs-electric-studio-16c1e76c5e/example.html';
const FIRST_ID = 'acp_7794e77335818675cc678908';
const SECOND_ID = 'acp_55893239d19dda0e3141e682';

function read(id: string, input: Record<string, unknown>, failed = false): PersistedAgentEvent[] {
  return [
    { kind: 'tool_use', id, name: 'Read', input, startedAt: 1788776876394 },
    // A short result does not imply that all 300 requested lines returned.
    { kind: 'tool_result', toolUseId: id, content: failed ? 'Read failed' : 'one returned line', isError: failed, completedAt: 1788776876415 },
  ];
}

function message(events: PersistedAgentEvent[]): ChatMessage {
  return { id: 'f81cb8ab-adc1-4d42-85c1-4478c30bc190', role: 'assistant', content: '', events, runStatus: 'succeeded' };
}

function show(events: PersistedAgentEvent[]) {
  return <I18nProvider initial="zh-CN"><AssistantMessage message={message(events)} streaming={false} /></I18nProvider>;
}

function expand(container: HTMLElement) {
  const shell = container.querySelector<HTMLDetailsElement>('.assistant-flow > details');
  const summary = shell?.querySelector<HTMLElement>(':scope > summary');
  if (!shell || !summary) throw new Error('Execution record missing');
  fireEvent.click(summary);
}

function names(container: HTMLElement, label = 'example.html') {
  return [...container.querySelectorAll('code')]
    .filter((code) => code.textContent === label)
    .map((code) => code.parentElement!);
}

const calls = () => [
  ...read(FIRST_ID, { filePath: PATH, offset: 1, limit: 300 }),
  ...read(SECOND_ID, { file_path: PATH, offset: 550, limit: 300 }),
];

describe('OPEND-2791: read parameters reach the existing file tooltip', () => {
  it('distinguishes requested slices and preserves them after replay without extra rows', () => {
    const events = calls();
    const view = render(show(events));
    expand(view.container);
    const assertSlices = () => {
      const files = names(view.container);
      expect(files).toHaveLength(2);
      expect(files.map((file) => file.getAttribute('title'))).toEqual([
        `${PATH}\noffset=1, limit=300`, `${PATH}\noffset=550, limit=300`,
      ]);
      expect(files.every((file) => file.tagName === 'SPAN')).toBe(true);
      expect(files.map((file) => file.textContent)).toEqual(['example.html', 'example.html']);
    };
    assertSlices();
    // The real message normalization keeps one row per invocation, not per filename.
    view.rerender(show([...events, ...JSON.parse(JSON.stringify(events))]));
    assertSlices();
  });

  it('retains full paths for identically named files and their separate calls', () => {
    const other = '/workspace/other/example.html';
    const { container } = render(show([
      ...read('a', { file_path: PATH, offset: 1, limit: 300 }),
      ...read('b', { file_path: other, offset: 1, limit: 300 }),
    ]));
    expand(container);
    expect(names(container).map((file) => file.title)).toEqual([
      `${PATH}\noffset=1, limit=300`, `${other}\noffset=1, limit=300`,
    ]);
  });

  it.each(['example.html', 'a-very-long-example-file-name-that-is-elided-but-keeps-its-extension.html'])(
    'preserves the original title without range parameters: %s', (label) => {
      const { container } = render(show(read('legacy', { file_path: `/workspace/${label}` })));
      expand(container);
      const files = names(container, elideFileName(label));
      expect(files).toHaveLength(1);
      expect(files[0]!.getAttribute('title')).toBe(elideFileName(label) === label ? null : label);
    },
  );

  it('retains request metadata on a failed read without claiming a returned range', () => {
    const { container } = render(show(read('failed', { file_path: PATH, offset: 550, limit: 300 }, true)));
    expand(container);
    expect(names(container)[0]!.title).toBe(`${PATH}\noffset=550, limit=300`);
  });

  it.each([
    { input: { offset: 550 }, suffix: 'offset=550' },
    { input: { limit: 300 }, suffix: 'limit=300' },
  ])('does not invent missing parameters: $suffix', ({ input, suffix }) => {
    const { container } = render(show(read('partial', { file_path: PATH, ...input })));
    expand(container);
    expect(names(container)[0]!.title).toBe(`${PATH}\n${suffix}`);
  });

  it('does not turn invalid range values into a tooltip', () => {
    const { container } = render(show(read('invalid', { file_path: PATH, offset: -1, limit: '300' })));
    expand(container);
    expect(names(container)[0]!.getAttribute('title')).toBeNull();
  });
});
