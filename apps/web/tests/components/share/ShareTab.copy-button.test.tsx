// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { parse } from 'postcss';
import { ShareTab } from '../../../src/components/share/ShareTab';
import { I18nProvider } from '../../../src/i18n';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

type Props = ComponentProps<typeof ShareTab>;
const authenticatedWorkspace: WorkspaceCollabContext = {
  workspaceId: 'ws', workspaceType: 'personal', workspaceMemberId: 'member', role: 'owner',
  memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
  seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
  permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
};
function props(overrides: Partial<Props> = {}): Props {
  return {
    menuOrigin: 'artifact-card', workspaceContext: authenticatedWorkspace, t: (key) => key,
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

describe('S0/S13 signed-out Share panel', () => {
  it('starts and cancels the existing Vela login from the S0 CTA without publishing', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/integrations/vela/status')) return new Response(JSON.stringify({ loggedIn: false, loginInFlight: false, profile: 'prod', user: null, configPath: '/x' }), { status: 200 });
      if (url.endsWith('/api/integrations/vela/login') && init?.method === 'POST') return new Response(JSON.stringify({ pid: 4242 }), { status: 202 });
      if (url.endsWith('/api/integrations/vela/login/cancel') && init?.method === 'POST') return new Response(JSON.stringify({ canceled: true, pids: [4242] }), { status: 200 });
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetch);
    const input = props({ canPublishPublic: false, filePublished: false, publishedFileUrl: '' });
    render(<I18nProvider initial="en"><ShareTab {...input} /></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(fetch.mock.calls.filter(([url, init]) => String(url).endsWith('/api/integrations/vela/login') && init?.method === 'POST')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: /cancel sign-in/i }));
    await waitFor(() => expect(fetch.mock.calls.filter(([url, init]) => String(url).endsWith('/api/integrations/vela/login/cancel') && init?.method === 'POST')).toHaveLength(1));
    expect(input.publishCurrentFilePublic).not.toHaveBeenCalled();
  });

  it('explains why an unbound workspace cannot publish and offers a real sign-in entry, not an empty shell', () => {
    const input = props({ canPublishPublic: false, filePublished: false, publishedFileUrl: '' });
    render(<I18nProvider><ShareTab {...input} /></I18nProvider>);
    expect(screen.getByText('fileViewer.publishFileRequiresWorkspace')).toBeVisible();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();
    expect(screen.queryByRole('switch', { name: 'fileViewer.linkAccessTitle' })).toBeNull();
    expect(input.publishCurrentFilePublic).not.toHaveBeenCalled();
  });

  it('keeps a retained signed-out publication copyable while disabling its mutation controls', async () => {
    const input = props({
      workspaceContext: null,
      canPublishPublic: true,
      publicationStatus: 'active',
      publicationFreshness: 'outdated',
      updateCurrentFilePublic: vi.fn().mockResolvedValue(undefined),
    });
    render(<I18nProvider><ShareTab {...input} /></I18nProvider>);

    expect(screen.getByText(input.publishedFileUrl)).toBeVisible();
    const accessSwitch = screen.getByRole('switch', { name: 'fileViewer.linkAccessTitle' });
    const updateButton = screen.getByRole('button', { name: 'fileViewer.shareUpdateLink' });
    expect(accessSwitch).toBeDisabled();
    expect(updateButton).toBeDisabled();
    fireEvent.click(accessSwitch);
    fireEvent.click(updateButton);
    expect(input.unpublishCurrentFilePublic).not.toHaveBeenCalled();
    expect(input.updateCurrentFilePublic).not.toHaveBeenCalled();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'fileViewer.copyShareLink' })));
    expect(input.copyPublishedFileLink).toHaveBeenCalledTimes(1);
    expect(screen.getByText(input.publishedFileUrl)).toBeVisible();
  });
});

describe('S3/S4/S4-C copy-button rendering seam', () => {
  it.each(['toolbar', 'artifact-card'] as const)('keeps read-only %s links copyable but prevents stopping them', async menuOrigin => {
    const input = props({ menuOrigin, viewerOnly: true });
    const { rerender } = render(<ShareTab {...input} />);
    const stop = screen.getByRole('switch', { name: 'fileViewer.linkAccessTitle' });
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
    const settled = screen.getByRole('button', { name: feedback === 'copied' ? 'preview.shareCopied' : 'fileViewer.copyShareLink' });
    expect(settled).toBeEnabled();
    expect(settled).not.toHaveAttribute('aria-busy');
    if (feedback === 'failed') expect(screen.getByRole('status')).toHaveTextContent('fileViewer.copyLinkManually');
    rerender(<ShareTab {...input} publishLinkFeedback={null} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'fileViewer.copyShareLink' })); });
    expect(input.copyPublishedFileLink).toHaveBeenCalledTimes(2);
  });
  it.each([null, 'copied', 'failed'] as const)('renders only the matching icon for feedback %s', (feedback) => {
    render(<ShareTab {...props({ publishLinkFeedback: feedback })} />);
    const label = feedback === 'copied' ? 'preview.shareCopied' : 'fileViewer.copyShareLink';
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
    expect(screen.getByRole('switch', { name: 'fileViewer.linkAccessTitle' }).className).not.toContain('copyButton');
  });

  it('keeps the full selectable share URL visible through idle, copied, and clipboard-failure states', () => {
    const input = props();
    const { rerender } = render(<ShareTab {...input} />);
    const url = screen.getByText(input.publishedFileUrl);
    expect(url).toBeVisible();
    expect(url).toHaveAttribute('title', input.publishedFileUrl);
    expect(url.querySelector('svg')).toHaveAttribute('width', '12');
    expect(screen.queryByRole('textbox')).toBeNull();
    for (const feedback of ['copied', 'failed', null] as const) {
      rerender(<ShareTab {...input} publishLinkFeedback={feedback} />);
      if (feedback === 'failed') expect(screen.getByRole('status')).toHaveTextContent('fileViewer.copyLinkManually');
    }
  });

  it('G2/S3/S4/S4-C/S10 UI audit: the URL row carries its own styling class directly, not only through an ancestor-scoped selector', () => {
    // The row previously depended on `.publishedLink :global(.chrome-publish-url)`
    // — a cross-scope descendant selector — to receive its box geometry. That
    // selector matched fine on paper but the row rendered with no visible box
    // in every captured screenshot (G2, S3, S4, S4-C, S10). The fix puts a
    // module-owned class directly on the element so its styling can never
    // depend on descendant/selector matching working out.
    const input = props();
    render(<ShareTab {...input} />);
    const url = screen.getByText(input.publishedFileUrl);
    expect(url.className).toMatch(/publishedUrl/);
    expect(url.className).toContain('chrome-publish-url');
  });

  it('styles the always-visible URL row to the final 32px link geometry', () => {
    const css = parse(readFileSync(resolve(__dirname, '../../../src/components/share/ShareTab.module.css'), 'utf8'));
    const values: Record<string, string> = {};
    css.walkRules('.publishedUrl', rule => {
      rule.walkDecls(decl => { values[decl.prop] = decl.value; });
    });
    expect(values).toMatchObject({
      height: '32px', padding: '0 9px 0 29px', border: '1px solid #E5E5E5',
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

  it('S3/S4 keep the URL visible alongside copied feedback and preserve Help and Stop', () => {
     const input = props({ publishLinkFeedback: 'copied' });
     const { rerender } = render(<I18nProvider initial="zh-CN"><ShareTab {...input} t={(key) => key} /></I18nProvider>);
     const link = screen.getByText(input.publishedFileUrl);
    expect(link).toBeVisible();
    expect(link).not.toHaveAttribute('hidden');
    expect(screen.getByRole('button', { name: 'preview.shareCopied' }).parentElement).toHaveClass('chrome-publish-actions');
    const stop = screen.getByRole('switch', { name: 'fileViewer.linkAccessTitle' });
    expect(stop).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(stop);
    expect(input.unpublishCurrentFilePublic).toHaveBeenCalledTimes(1);
    rerender(<I18nProvider initial="zh-CN"><ShareTab {...input} publishLinkFeedback="failed" t={(key) => key} /></I18nProvider>);
    expect(link).toBeVisible();
    expect(link).not.toHaveAttribute('hidden');
    expect(screen.getByRole('status')).toHaveTextContent('fileViewer.copyLinkManually');
  });

  it('uses a 32px full-width link and copy stack with an 8px gap, hides completed progress, and retains stop controls', () => {
    const input = props({ publishProgress: 0.9 });
    const { rerender } = render(<ShareTab {...input} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
    const link = screen.getByText(input.publishedFileUrl);
    const stack = link.parentElement!;
    expect(stack.className).toContain('publishedLink');
    expect(screen.getByRole('button', { name: 'fileViewer.copyShareLink' })).toBeVisible();
    expect(screen.getByRole('switch', { name: 'fileViewer.linkAccessTitle' })).toBeVisible();
    expect(screen.getByRole('switch', { name: 'fileViewer.linkAccessTitle' })).toBeVisible();
    const css = parse(readFileSync(resolve(__dirname, '../../../src/components/share/ShareTab.module.css'), 'utf8'));
    const declarations = (selector: string) => {
      const values: Record<string, string> = {};
      css.walkRules(selector, rule => rule.walkDecls(decl => { values[decl.prop] = decl.value; }));
      return values;
    };
    expect(declarations('.publishedLink')).toMatchObject({ gap: '8px', padding: '0' });
    expect(declarations('.publishedUrl')).toMatchObject({ width: '100%', height: '32px' });
    expect(declarations('.publishedActions')).toMatchObject({ display: 'block', width: '100%' });
    expect(declarations('button.copyButton')).toMatchObject({ width: '100%', height: '32px' });
    rerender(<ShareTab {...input} filePublished={false} publishingPublicFile publishProgress={0.4} />);
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'fileViewer.uploadingFile');
    rerender(<ShareTab {...input} filePublished publishingPublicFile={false} publishProgress={0.9} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('opens only HTTP(S) deployment links while allowing configured custom domains', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    try {
      const input = props({ menuOrigin: 'toolbar', sharePageUrl: 'https://preview.example.test/page', canOpenSharePage: true });
      const { rerender } = render(<ShareTab {...input} />);
      fireEvent.click(screen.getByRole('menuitem', { name: 'fileViewer.openSharePage' }));
      expect(open).toHaveBeenCalledWith('https://preview.example.test/page', '_blank', 'noopener,noreferrer');
      open.mockClear();
      for (const sharePageUrl of ['javascript:alert(1)', 'data:text/html,unsafe', 'http://[invalid']) {
        rerender(<ShareTab {...input} sharePageUrl={sharePageUrl} />);
        fireEvent.click(screen.getByRole('menuitem', { name: 'fileViewer.openSharePage' }));
        expect(open).not.toHaveBeenCalled();
      }
    } finally {
      open.mockRestore();
    }
  });


  it('keeps copy and stop callbacks separate and the URL read-only', () => {
    const input = props();
    render(<ShareTab {...input} />);
    fireEvent.click(screen.getByRole('button', { name: 'fileViewer.copyShareLink' }));
    expect(input.copyPublishedFileLink).toHaveBeenCalledTimes(1);
    expect(input.unpublishCurrentFilePublic).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('switch', { name: 'fileViewer.linkAccessTitle' }));
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
    expect((screen.getByRole('switch', { name: 'fileViewer.linkAccessTitle' }) as HTMLButtonElement).disabled)
      .toBe(state.viewerOnly || state.publishingPublicFile);
  });

  it('removes the success icon when the existing feedback returns to null or fails', () => {
    const input = props({ publishLinkFeedback: 'copied' });
    const { rerender } = render(<ShareTab {...input} />);
    for (const feedback of [null, 'failed'] as const) {
      rerender(<ShareTab {...input} publishLinkFeedback={feedback} />);
      expect(document.querySelector('path[d="' + checkPath + '"]')).toBeNull();
      expect(screen.queryByRole('button', { name: 'preview.shareCopied' })).toBeNull();
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
