// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'postcss';
import { ShareTab } from '../../../src/components/share/ShareTab';

afterEach(cleanup);

type Props = ComponentProps<typeof ShareTab>;
function props(overrides: Partial<Props> = {}): Props {
  return {
    menuOrigin: 'artifact-card', workspaceContext: null, t: (key) => key,
    shareAccess: 'private', shareAccessMenuOpen: false, shareAccessBusy: false,
    viewerOnly: false, setShareAccessMenuOpen: vi.fn(), setWorkspaceShareAccess: vi.fn(),
    canPublishPublic: true, filePublished: true, publishedFileUrl: 'https://example.test/artifact/p/s',
    copyPublishedFileLink: vi.fn().mockResolvedValue(undefined), publishLinkFeedback: null,
    publishingPublicFile: false, publishProgress: null,
    unpublishCurrentFilePublic: vi.fn().mockResolvedValue(undefined), viewerOnlyDisabledTitle: 'read only',
    publishCurrentFilePublic: vi.fn().mockResolvedValue(undefined), publishFailureKey: null,
    streaming: false,
    sharePageUrl: '', canCopyShareLink: false, shareUnavailableHint: '',
    copyShareLink: vi.fn().mockResolvedValue(true), copyShareLinkLabel: '',
    canOpenSharePage: false, shareLinkStatusHint: '', ...overrides,
  };
}

const checkPath = 'm3 8 3 3 7-7';
const linkPath = 'M10 13.5a5 5 0 0 0 7 .2l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 10.5a5 5 0 0 0-7-.2l-3 3a5 5 0 0 0 7 7l1.7-1.7';

describe('S3/S4/S4-C copy-button rendering seam', () => {
  it.each(['toolbar', 'artifact-card'] as const)('keeps read-only %s links copyable but prevents stopping them', async menuOrigin => {
    const input = props({ menuOrigin, viewerOnly: true });
    const { rerender } = render(<ShareTab {...input} />);
    const stop = screen.getByRole('button', { name: 'fileViewer.unpublishFile' });
    expect(stop).toBeDisabled();
    expect(stop).toHaveAttribute('title', 'read only');
    fireEvent.click(stop);
    expect(input.unpublishCurrentFilePublic).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'fileViewer.copyShareLink' })));
    expect(input.copyPublishedFileLink).toHaveBeenCalledTimes(1);
    expect(screen.getByText(input.publishedFileUrl)).toBeVisible();
    expect(input.publishCurrentFilePublic).not.toHaveBeenCalled();
    rerender(<ShareTab {...input} viewerOnly={false} />);
    expect(stop).toBeEnabled();
    fireEvent.click(stop);
    expect(input.unpublishCurrentFilePublic).toHaveBeenCalledTimes(1);
  });

  it.each(['copied', 'failed'] as const)('shows pending until the clipboard settles, then delegates %s feedback', async (feedback) => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const input = props({ copyPublishedFileLink: vi.fn(() => pending) });
    const { rerender } = render(<ShareTab {...input} />);
    fireEvent.click(screen.getByRole('button', { name: 'fileViewer.copyShareLink' }));
    const busy = screen.getByRole('button', { name: 'fileViewer.copyingLink' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    const spinner = busy.querySelector('svg')!;
    expect(spinner).toHaveAttribute('viewBox', '0 0 24 24');
    expect(spinner).toHaveAttribute('stroke-width', '2');
    expect(spinner).toHaveClass('icon-spin');
    expect(spinner.querySelector('path')).toHaveAttribute('d', 'M12 3a9 9 0 1 0 9 9');
    expect(screen.getByText(input.publishedFileUrl)).toBeVisible();
    fireEvent.click(busy);
    expect(input.copyPublishedFileLink).toHaveBeenCalledTimes(1);
    expect(input.publishCurrentFilePublic).not.toHaveBeenCalled();
    expect(input.unpublishCurrentFilePublic).not.toHaveBeenCalled();
    await act(async () => { finish(); await pending; });
    rerender(<ShareTab {...input} publishLinkFeedback={feedback} />);
    const settled = screen.getByRole('button', { name: feedback === 'copied' ? 'fileViewer.copied' : 'fileViewer.copyShareLink' });
    expect(settled).toBeEnabled();
    expect(settled).not.toHaveAttribute('aria-busy');
    if (feedback === 'failed') expect(screen.getByRole('status')).toHaveTextContent('fileViewer.copyLinkManually');
    rerender(<ShareTab {...input} publishLinkFeedback={null} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'fileViewer.copyShareLink' })); });
    expect(input.copyPublishedFileLink).toHaveBeenCalledTimes(2);
  });
  it.each([null, 'copied', 'failed'] as const)('renders only the matching icon for feedback %s', (feedback) => {
    render(<ShareTab {...props({ publishLinkFeedback: feedback })} />);
    const label = feedback === 'copied' ? 'fileViewer.copied' : 'fileViewer.copyShareLink';
    const button = screen.getByRole('button', { name: label });
    expect(button.className).toContain('copyButton');
    const icon = button.querySelector('svg')!;
    expect(icon).toHaveAttribute('width', '13');
    expect(icon).toHaveAttribute('height', '13');
    expect(icon).toHaveAttribute('viewBox', feedback === 'copied' ? '0 0 16 16' : '0 0 24 24');
    expect(icon).toHaveAttribute('fill', 'none');
    expect(icon).toHaveAttribute('stroke', 'currentColor');
    expect(icon).toHaveAttribute('stroke-width', '1.8');
    expect(icon).toHaveAttribute('stroke-linecap', 'round');
    expect(icon).toHaveAttribute('stroke-linejoin', 'round');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon.querySelector('path')).toHaveAttribute('d', feedback === 'copied' ? checkPath : linkPath);
    expect(icon.classList.toString().includes('copiedIcon')).toBe(feedback === 'copied');
    expect(screen.getByRole('button', { name: 'fileViewer.unpublishFile' }).className).not.toContain('copyButton');
  });

  it('scopes the selectable S11 URL fallback to failed clipboard feedback', () => {
    const input = props({ publishLinkFeedback: 'failed' });
    const { rerender } = render(<ShareTab {...input} />);
    expect(screen.getByText(input.publishedFileUrl).className).toContain('copyFallback');
    expect(screen.getByText(input.publishedFileUrl)).toHaveAttribute('title', input.publishedFileUrl);
    expect(screen.queryByRole('textbox')).toBeNull();
    for (const feedback of [null, 'copied'] as const) {
      rerender(<ShareTab {...input} publishLinkFeedback={feedback} />);
      expect(screen.getByText(input.publishedFileUrl).className).not.toContain('copyFallback');
    }
  });

  it('declares the S11 fallback geometry without changing the global URL style', () => {
    const css = parse(readFileSync(resolve(__dirname, '../../../src/components/share/ShareTab.module.css'), 'utf8'));
    const values: Record<string, string> = {};
    css.walkRules('.copyFallback:global(.chrome-publish-url)', rule => {
      rule.walkDecls(decl => { values[decl.prop] = decl.value; });
    });
    expect(values).toMatchObject({
      height: '32px', padding: '0 9px', border: '1px solid #E5E5E5',
      'border-radius': '6px', background: '#FFFFFF', color: '#666666',
      'font-size': '11px', 'line-height': '30px', 'user-select': 'text',
      'white-space': 'nowrap', 'text-overflow': 'ellipsis',
    });
  });

  it('explains clipboard failure separately and keeps the copy action retryable', () => {
    const input = props({ publishLinkFeedback: 'failed' });
    const { rerender } = render(<ShareTab {...input} />);
    expect(screen.getByRole('status')).toHaveTextContent('fileViewer.copyLinkManually');
    expect(screen.getByRole('status').className).toContain('copyHint');
    expect(screen.queryByRole('button', { name: 'useEverywhere.copyFailed' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'fileViewer.copyShareLink' }));
    expect(input.copyPublishedFileLink).toHaveBeenCalledTimes(1);
    expect(input.publishCurrentFilePublic).not.toHaveBeenCalled();
    expect(input.unpublishCurrentFilePublic).not.toHaveBeenCalled();
    for (const feedback of [null, 'copied'] as const) {
      rerender(<ShareTab {...input} publishLinkFeedback={feedback} />);
      expect(screen.queryByText('fileViewer.copyLinkManually')).toBeNull();
    }
  });

  it('keeps copy and stop callbacks separate and the URL read-only', () => {
    const input = props();
    render(<ShareTab {...input} />);
    fireEvent.click(screen.getByRole('button', { name: 'fileViewer.copyShareLink' }));
    expect(input.copyPublishedFileLink).toHaveBeenCalledTimes(1);
    expect(input.unpublishCurrentFilePublic).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'fileViewer.unpublishFile' }));
    expect(input.unpublishCurrentFilePublic).toHaveBeenCalledTimes(1);
    expect(input.publishCurrentFilePublic).not.toHaveBeenCalled();
    expect(screen.getByText(input.publishedFileUrl)).toHaveAttribute('title', input.publishedFileUrl);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it.each([
    { streaming: true, viewerOnly: false, publishingPublicFile: false },
    { streaming: false, viewerOnly: true, publishingPublicFile: false },
    { streaming: false, viewerOnly: false, publishingPublicFile: true },
  ])('preserves disabled predicates: %j', (state) => {
    const input = props(state);
    render(<ShareTab {...input} />);
    const copy = screen.getByRole('button', { name: 'fileViewer.copyShareLink' });
    expect((copy as HTMLButtonElement).disabled).toBe(state.streaming);
    expect(copy.getAttribute('title')).toBe(state.streaming ? 'fileViewer.shareAfterGenerationComplete' : null);
    fireEvent.click(copy);
    expect(input.copyPublishedFileLink).toHaveBeenCalledTimes(state.streaming ? 0 : 1);
    expect((screen.getByRole('button', { name: 'fileViewer.unpublishFile' }) as HTMLButtonElement).disabled)
      .toBe(state.viewerOnly || state.publishingPublicFile);
  });

  it('removes the success icon when the existing feedback returns to null or fails', () => {
    const input = props({ publishLinkFeedback: 'copied' });
    const { rerender } = render(<ShareTab {...input} />);
    for (const feedback of [null, 'failed'] as const) {
      rerender(<ShareTab {...input} publishLinkFeedback={feedback} />);
      expect(document.querySelector('path[d="' + checkPath + '"]')).toBeNull();
      expect(screen.queryByRole('button', { name: 'fileViewer.copied' })).toBeNull();
    }
  });

  it('declares the canvas values locally (static CSS contract, not pixel measurement)', () => {
    const css = parse(readFileSync(resolve(__dirname, '../../../src/components/share/ShareTab.module.css'), 'utf8'));
    const declarations = (selector: string) => {
      const values: Record<string, string> = {};
      css.walkRules(selector, (rule) => { rule.walkDecls((decl) => { values[decl.prop] = decl.value; }); });
      return values;
    };
    expect(declarations('button.copyButton')).toMatchObject({
      height: '32px', 'border-radius': '6px', gap: '5px', background: '#29292B', color: '#FFFFFF',
      'font-size': '12px', 'font-weight': '500', 'line-height': '18px', border: '0', padding: '0 8px',
    });
    expect(declarations('button.copyButton:hover:not(:disabled)')).toMatchObject({ background: '#29292B' });
    expect(declarations('.copiedIcon')).toMatchObject({ color: '#82D994' });
    expect(declarations('button.copyButton[aria-busy="true"]:disabled')).toMatchObject({
      background: '#5A5A5C', color: '#FFFFFF', opacity: '1',
    });
  });
});
