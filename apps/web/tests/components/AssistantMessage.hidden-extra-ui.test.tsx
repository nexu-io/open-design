// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import { I18nProvider } from '../../src/i18n';
import type { ChatMessage, ProjectFile } from '../../src/types';

const KEY = 'a7f3c91ed2b40561';
const BEFORE = 'Visible explanation before the hidden interface.';
const AFTER = 'Visible explanation after the hidden interface.';
const REMINDER = '<system-reminder>PRIVATE_REMINDER_PAYLOAD</system-reminder>';
const HTML = '<!doctype html><html><body><h1>GENERATED_SOURCE_SENTINEL</h1></body></html>';
const ARTIFACT = `<artifact identifier="demo" type="text/html" title="Demo">${HTML}</artifact>`;
const FILE: ProjectFile = { name: 'demo.html', path: 'demo.html', size: HTML.length, mtime: 2000, kind: 'html', mime: 'text/html' };
const PLUGIN_FILES: ProjectFile[] = [
  { name: 'my-skill/open-design.json', path: 'my-skill/open-design.json', size: 120, mtime: 2000, kind: 'code', mime: 'application/json' },
  { name: 'my-skill/SKILL.md', path: 'my-skill/SKILL.md', size: 80, mtime: 2000, kind: 'text', mime: 'text/markdown' },
];

type Props = ComponentProps<typeof AssistantMessage>;
function message(text: string, streaming: boolean, extra: Partial<ChatMessage> = {}): ChatMessage {
  const content = `Working.\n<od-done key="${KEY}"/>${text}`;
  return {
    id: 'assistant-hidden-ui', role: 'assistant', content, createdAt: 1000,
    startedAt: 1000, runId: 'run-hidden-ui', runStatus: streaming ? 'running' : 'succeeded',
    ...(streaming ? {} : { endedAt: 2000 }),
    events: [{ kind: 'done_key', key: KEY }, { kind: 'text', text: content }],
    ...extra,
  };
}
function ui(value: ChatMessage, streaming: boolean, props: Partial<Props> = {}) {
  return <I18nProvider initial="en"><AssistantMessage message={value} streaming={streaming} isLast projectId="project-1" conversationId="conversation-1" {...props} /></I18nProvider>;
}
function expectNeighbors(container: HTMLElement) {
  expect(container.textContent).toContain(BEFORE);
  expect(container.textContent).toContain(AFTER);
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('explicitly hidden extra ChatPanel interfaces', () => {
  it.each([true, false])('hides a real plugin_candidate event with streaming=%s while preserving message text', (streaming) => {
    const value = message(`${BEFORE}\n\n${AFTER}`, streaming);
    value.events = [
      ...(value.events ?? []),
      { kind: 'plugin_candidate', candidateId: 'candidate-1', title: 'REMOVED_PLUGIN_SUGGESTION', description: 'Candidate details', confidence: 0.9, draftPath: null },
    ];
    const { container } = render(ui(value, streaming));
    expectNeighbors(container);
    expect(within(container).queryByTestId('skill-plugin-candidate-candidate-1')).toBeNull();
    expect(container.textContent).not.toContain('REMOVED_PLUGIN_SUGGESTION');
    expect(within(container).queryByRole('button', { name: 'Contribute to open-design' })).toBeNull();
  });

  it('hides the settled plugin-folder action panel without losing its real produced files', () => {
    const onAction = vi.fn();
    const onOpen = vi.fn();
    // Both manifest + SKILL.md, touched by this turn's authoritative output,
    // meet the production folder detector; absence must not depend on a fake folder.
    const value = message(`${BEFORE}\nmy-skill/ is ready.\n${AFTER}`, false, { producedFiles: PLUGIN_FILES });
    const { container } = render(ui(value, false, { projectFiles: PLUGIN_FILES, onRequestPluginFolderAgentAction: onAction, onRequestOpenFile: onOpen }));
    expectNeighbors(container);
    for (const file of PLUGIN_FILES) expect(within(container).getByTestId(`artifact-card-${file.name}`)).toBeTruthy();
    expect(within(container).queryByTestId('assistant-plugin-actions-my-skill')).toBeNull();
    expect(within(container).queryByTestId('assistant-plugin-install-my-skill')).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('does not synthesize a browser-assist card from a settled brand reply', () => {
    const onConfirm = vi.fn();
    const text = `${BEFORE}\nUse More > Download Page to capture the brand page.\n${AFTER}`;
    const { container } = render(ui(message(text, false), false, {
      nextStepVariant: 'brand-extraction-incomplete',
      projectMetadata: { kind: 'brand', brandId: 'brand-1', brandSourceUrl: 'https://brand.test/' },
      onBrandBrowserAssistConfirm: onConfirm,
    }));
    expectNeighbors(container);
    expect(container.textContent).toContain('Download Page');
    expect(container.querySelector('[data-od-card="brand-browser-assist"]')).toBeNull();
    expect(within(container).queryByRole('button', { name: 'Open browser assist' })).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it.each([true, false])('hides the real reminder block and payload with streaming=%s, retaining surrounding prose', (streaming) => {
    const { container } = render(ui(message(`${BEFORE}\n\n${REMINDER}\n\n${AFTER}`, streaming), streaming));
    expectNeighbors(container);
    expect(within(container).queryByRole('button', { name: /Possible prompt injection/i })).toBeNull();
    expect(container.textContent).not.toContain('PRIVATE_REMINDER_PAYLOAD');
    expect(container.textContent).not.toContain('<system-reminder>');
  });

  it('holds fragmented reminder markup and payload during a live reply, then preserves following prose', () => {
    const { container, rerender } = render(ui(message(BEFORE, true), true));
    for (const partial of ['<system-rem', '<system-reminder>', '<system-reminder>PRIVATE_REMINDER_PAYLOAD', REMINDER.slice(0, -3)]) {
      rerender(ui(message(`${BEFORE}\n\n${partial}`, true), true));
      expect(container.textContent).toContain(BEFORE);
      expect(container.textContent).not.toContain('<system-rem');
      expect(container.textContent).not.toContain('PRIVATE_REMINDER_PAYLOAD');
      expect(within(container).queryByRole('button', { name: /Possible prompt injection/i })).toBeNull();
    }
    rerender(ui(message(`${BEFORE}\n\n${REMINDER}\n\n${AFTER}`, false), false));
    expectNeighbors(container);
    expect(container.textContent).not.toContain('PRIVATE_REMINDER_PAYLOAD');
  });

  it('preserves terminal malformed reminder text and live literal code prefixes', () => {
    const malformed = '<system-reminder>ordinary unfinished literal';
    const { container, rerender } = render(ui(message(`${BEFORE}\n\n${malformed}`, false), false));
    expect(container.textContent).toContain(BEFORE);
    expect(container.textContent).toContain('ordinary unfinished literal');
    for (const code of ['`<system-rem`', '```xml\n<system-rem']) {
      rerender(ui(message(`${BEFORE}\n\n${code}`, true), true));
      expect(container.textContent).toContain(BEFORE);
      expect(container.querySelector('code')?.textContent).toContain('<system-rem');
    }
    rerender(ui(message(`${BEFORE}\n\n<system-reminder-example>ordinary prose`, true), true));
    expect(container.textContent).toContain('<system-reminder-example>ordinary prose');
  });

  it.each(['inline', 'fenced'] as const)('keeps an explicit %s code example containing a reminder tag verbatim', (style) => {
    const code = style === 'inline' ? `\`${REMINDER}\`` : `\`\`\`xml\n${REMINDER}\n\`\`\``;
    const { container } = render(ui(message(`${BEFORE}\n\n${code}\n\n${AFTER}`, false), false));
    expectNeighbors(container);
    expect(container.querySelector('code')?.textContent).toBe(REMINDER);
    expect(within(container).queryByRole('button', { name: /Possible prompt injection/i })).toBeNull();
  });

  it('keeps ordinary risk prose and unrelated tags as content', () => {
    const text = 'This code may contain a prompt injection. <od-demo>literal brand wording</od-demo>';
    const { container } = render(ui(message(`${BEFORE}\n\n${text}\n\n${AFTER}`, false), false));
    expectNeighbors(container);
    expect(container.textContent).toContain(text);
  });

  it('hides fragmented artifact source until completion without removing the final artifact or adjacent prose', () => {
    const onOpen = vi.fn();
    const onExport = vi.fn();
    const props = { projectFiles: [FILE], onRequestOpenFile: onOpen, onArtifactDownload: onExport };
    const { container, rerender } = render(ui(message(BEFORE, true), true, props));
    // Successive accumulated frames of the same real protocol block: opening
    // attributes, start of body, complete body, and partial closing marker.
    for (const partial of [
      '<artifact identifier="demo"',
      '<artifact identifier="demo" type="text/html" title="Demo"><!doctype html>',
      `<artifact identifier="demo" type="text/html" title="Demo">${HTML}`,
      ARTIFACT.slice(0, -3),
    ]) {
      rerender(ui(message(`${BEFORE}\n\n${partial}`, true), true, props));
      expect(container.textContent).toContain(BEFORE);
      expect(within(container).queryByTestId('live-code-box')).toBeNull();
      expect(container.textContent).not.toContain('GENERATED_SOURCE_SENTINEL');
      expect(container.textContent).not.toContain('<artifact');
      expect(container.textContent).not.toContain('<!doctype');
    }
    const complete = message(`${BEFORE}\n\n${ARTIFACT}\n\n${AFTER}`, false, { producedFiles: [FILE] });
    rerender(ui(complete, false, props));
    expectNeighbors(container);
    expect(within(container).queryByTestId('live-code-box')).toBeNull();
    expect(container.textContent).not.toContain('GENERATED_SOURCE_SENTINEL');
    expect(within(container).getByTestId(`artifact-card-${FILE.name}`)).toBeTruthy();
    fireEvent.click(within(container).getByTestId(`artifact-card-open-${FILE.name}`));
    expect(onOpen).toHaveBeenCalledWith(FILE.name);
    fireEvent.click(within(container).getByTestId(`artifact-card-export-${FILE.name}`));
    expect(onExport).toHaveBeenCalled();
    // Remount from the same stored message shape, rather than keep local state.
    cleanup();
    const restored = render(ui(complete, false, props));
    expectNeighbors(restored.container);
    expect(within(restored.container).getByTestId(`artifact-card-${FILE.name}`)).toBeTruthy();
  });

  it.each(['inline', 'fenced'] as const)('keeps an explicit %s artifact protocol example as code', (style) => {
    const code = style === 'inline' ? `\`${ARTIFACT}\`` : `\`\`\`xml\n${ARTIFACT}\n\`\`\``;
    const { container } = render(ui(message(`${BEFORE}\n\n${code}\n\n${AFTER}`, false), false));
    expectNeighbors(container);
    expect(container.querySelector('code')?.textContent).toBe(ARTIFACT);
    expect(within(container).queryByTestId('live-code-box')).toBeNull();
  });

  it('keeps ordinary fenced code during a live reply', () => {
    const code = 'const answer = 42;';
    const { container } = render(ui(message(`${BEFORE}\n\n\`\`\`ts\n${code}\n\`\`\`\n\n${AFTER}`, true), true));
    expectNeighbors(container);
    expect(container.querySelector('code')?.textContent).toBe(code);
  });
});
