// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileOpsSummary } from '../../src/components/FileOpsSummary';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import { I18nProvider } from '../../src/i18n';
import { en } from '../../src/i18n/locales/en';
import type { FileOpEntry } from '../../src/runtime/file-ops';
import type { ChatMessage } from '../../src/types';

const files = [...Array.from({ length: 16 }, (_, index) => `image-${index + 1}.png`), 'result.html'];
function entry(name: string): FileOpEntry {
  return { path: name, fullPath: `/repo/${name}`, ops: ['write'], opCounts: { read: 0, write: 1, edit: 0, delete: 0 }, total: 1, status: 'done' };
}
function panel(names: string[], callbacks: Record<string, unknown> = {}) {
  return <I18nProvider initial="en"><FileOpsSummary
    entries={names.map(entry)} projectId="project-gallery" {...callbacks}
    artifactRefs={names.map(name => ({ label: name, snapshotState: 'ready',
      displayPolicy: name.endsWith('.png') ? 'immutable_snapshot' : 'latest_with_static_preview',
      thumbnailUrl: `/snapshots/${name}`, snapshotUrl: `/snapshots/${name}` }))}
  /></I18nProvider>;
}
afterEach(cleanup);

describe('OPEND-2571 grouped artifacts', () => {
  it('summarizes the full mixed result and previews both types before expansion', () => {
    const { container } = render(panel(files));
    expect(screen.getByText('16 images · 1 HTML')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View all (17)' })).toHaveAttribute('aria-expanded', 'false');
    const visible = container.querySelectorAll('[data-artifact-card]');
    expect(visible.length).toBeLessThan(files.length);
    expect(container.querySelector('[data-artifact-card][data-kind="image"]')).not.toBeNull();
    // The HTML is last in the original list: taking only the first N images
    // would conceal one entire result type in the supposedly representative set.
    expect(screen.getByTestId('artifact-card-result.html')).toBeTruthy();
  });

  it('reveals every file once, preserves individual actions, and collapses again', () => {
    const onRequestOpenFile = vi.fn();
    const onExport = vi.fn();
    const { container } = render(panel(files, { onRequestOpenFile, onExport }));
    fireEvent.click(screen.getByRole('button', { name: 'View all (17)' }));
    expect(container.querySelectorAll('[data-artifact-card]')).toHaveLength(17);
    for (const name of files) expect(screen.getAllByTestId(`artifact-card-${name}`)).toHaveLength(1);
    fireEvent.click(screen.getByTestId('artifact-card-open-image-16.png'));
    expect(onRequestOpenFile).toHaveBeenCalledWith('image-16.png');
    expect(screen.getByTestId('artifact-card-export-image-16.png')).toHaveAttribute('href', '/snapshots/image-16.png');
    fireEvent.click(screen.getByTestId('artifact-card-export-result.html'));
    expect(onExport).toHaveBeenCalledWith('result.html', expect.any(String));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(screen.queryByTestId('artifact-card-image-16.png')).toBeNull();
    expect(screen.getByRole('button', { name: 'View all (17)' })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'View all (17)' }));
    expect(container.querySelectorAll('[data-artifact-card]')).toHaveLength(17);
  });

  it.each([1, 2, 4])('keeps %i existing small results directly available', count => {
    const names = files.slice(0, count);
    const { container } = render(panel(names));
    expect(container.querySelectorAll('[data-artifact-card]')).toHaveLength(count);
    expect(screen.queryByRole('button', { name: /View all/ })).toBeNull();
  });

  it('represents each supported card type before repeating one type', () => {
    const names = ['a.png', 'b.png', 'a.html', 'b.html', 'a.mp4', 'b.mp4', 'a.txt', 'b.txt'];
    const { container } = render(panel(names));
    expect(screen.getByText('2 images · 2 HTML · 2 videos · 2 documents')).toBeTruthy();
    for (const kind of ['image', 'html', 'video', 'doc']) {
      expect(container.querySelector(`[data-artifact-card][data-kind="${kind}"]`)).not.toBeNull();
    }
    fireEvent.click(screen.getByRole('button', { name: 'View all (8)' }));
    expect(container.querySelectorAll('[data-artifact-card]')).toHaveLength(8);
  });

  it('also groups large batches containing only HTML outputs', () => {
    const names = Array.from({ length: 9 }, (_, index) => `page-${index}.html`);
    const { container } = render(panel(names));
    expect(screen.getByText('9 HTML')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'View all (9)' }));
    expect(container.querySelectorAll('[data-artifact-card]')).toHaveLength(9);
    expect(screen.getByTestId('artifact-card-page-8.html')).toBeTruthy();
  });

  it('counts unique files and retains a user expansion when another result arrives', () => {
    const { rerender, container } = render(panel([...files, files[0]!]));
    expect(screen.getByText('16 images · 1 HTML')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'View all (17)' }));
    rerender(panel([...files, 'another.png', files[0]!]));
    expect(screen.getByText('17 images · 1 HTML')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Collapse' })).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelectorAll('[data-artifact-card]')).toHaveLength(18);
  });

  it('keeps the real message summary, completion status and next action outside the expanded gallery', () => {
    const onNextStepSuggestion = vi.fn();
    const summary = 'The image collection and HTML overview are ready.';
    const suggestion = 'Add captions to the collection';
    const message: ChatMessage = {
      id: 'gallery-turn', role: 'assistant', content: summary,
      runStatus: 'succeeded', startedAt: 1700000000, endedAt: 1700000005,
      producedFiles: files.map(name => ({
        name, path: name, size: 100, mtime: 1700000005,
        kind: name.endsWith('.png') ? 'image' : 'html',
        mime: name.endsWith('.png') ? 'image/png' : 'text/html',
      })),
      events: [
        { kind: 'text', text: summary },
        { kind: 'artifact_focus', show: files },
        { kind: 'next_steps', suggestions: [suggestion] },
      ],
    };
    render(<I18nProvider initial="en"><AssistantMessage
      message={message} streaming={false} projectId="project-gallery" isLast
      onNextStepSuggestion={onNextStepSuggestion}
    /></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'View all (17)' }));
    const gallery = screen.getByRole('region', { name: '16 images · 1 HTML' });
    for (const element of [screen.getByText(summary), screen.getByTestId('assistant-footer'), screen.getByTestId('next-step-suggestions')]) {
      expect(gallery.contains(element)).toBe(false);
    }
    expect(screen.getByTestId('assistant-label')).toHaveTextContent(en['assistant.doneLabel']);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    fireEvent.click(screen.getByTestId('next-step-suggestion-0'));
    expect(onNextStepSuggestion).toHaveBeenCalledWith(suggestion);
    expect(screen.getByText(summary)).toBeTruthy();
  });
});
