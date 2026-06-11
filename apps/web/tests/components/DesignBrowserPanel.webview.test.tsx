// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMockOpenDesignHost } from '@open-design/host/testing';

import { DesignBrowserPanel } from '../../src/components/DesignBrowserPanel';
import { I18nProvider } from '../../src/i18n';

// The panel imports these writers from the registry at module load; stub them so
// rendering never reaches the network.
vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    openExternalUrl: vi.fn(async () => true),
    writeProjectTextFile: vi.fn(async () => null),
    writeProjectBase64File: vi.fn(async () => null),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let restoreHost: (() => void) | null = null;

beforeEach(() => {
  window.localStorage.clear();
  // Makes isOpenDesignHostAvailable() true so the panel renders the desktop
  // <webview> branch (rather than the iframe fallback).
  restoreHost = installMockOpenDesignHost();
});

afterEach(() => {
  cleanup();
  restoreHost?.();
  restoreHost = null;
  window.localStorage.clear();
});

function dispatchWebviewNavigate(webview: HTMLElement, url: string) {
  act(() => {
    const event = new Event('did-navigate') as Event & { url?: string; isMainFrame?: boolean };
    event.url = url;
    event.isMainFrame = true;
    webview.dispatchEvent(event);
  });
}

function dispatchWebviewTitle(webview: HTMLElement, title: string) {
  act(() => {
    const event = new Event('page-title-updated') as Event & { title?: string };
    event.title = title;
    webview.dispatchEvent(event);
  });
}

function getAddressDisplay(container: HTMLElement) {
  return {
    title: container.querySelector('.db-address-title')?.textContent ?? '',
    url: container.querySelector('.db-address-url')?.textContent ?? '',
  };
}

describe('DesignBrowserPanel <webview> navigation', () => {
  it('keeps external browser mutation and annotation tools hidden', () => {
    render(
      <DesignBrowserPanel
        projectId="proj-webview-more-tools"
        initialTitle="Example"
        initialUrl="https://example.com"
        onOpenFile={() => {}}
        onRefreshFiles={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Tune element' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit live DOM' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Comment' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Screenshot' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Browser menu' }));

    expect(screen.queryByRole('menuitem', { name: /Tune Element/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Edit Live DOM/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Edit HTML/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Mark' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Comment' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Copy Screenshot' })).toBeTruthy();
  });

  it('searches inspiration actions and adds an operation prompt for the current browser tab', () => {
    const onRequestBrowserUsePrompt = vi.fn();

    render(
      <I18nProvider initial="zh-CN">
        <DesignBrowserPanel
          projectId="proj-webview-browser-use"
          initialTitle="Example"
          initialUrl="https://example.com"
          onOpenFile={() => {}}
          onRefreshFiles={() => {}}
          onRequestBrowserUsePrompt={onRequestBrowserUsePrompt}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '灵感' }));
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索灵感' }), {
      target: { value: '字体' },
    });
    expect(screen.queryByRole('menuitem', { name: /validate_view/ })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: /extract_fonts/ }));

    expect(onRequestBrowserUsePrompt).toHaveBeenCalledTimes(1);
    const prompt = onRequestBrowserUsePrompt.mock.calls[0]?.[0] as string;
    expect(prompt).toContain('@agent-browser');
    expect(prompt).toContain('Operation: extract_fonts');
    expect(prompt).toContain('- title: Example');
    expect(prompt).toContain('- url: https://example.com');
    expect(prompt).toContain('browser-use / browser-harness style evidence');
  });

  it('pins the webview src to the load target when the guest commits a redirected URL', () => {
    // Regression guard for the blank-page bug: the embedded <webview> rendered
    // but never painted because did-navigate fed the committed (trailing-slash)
    // URL straight back into the src prop, so Electron re-navigated and aborted
    // the in-flight load (ERR_ABORTED -3). The load target (src) must stay put
    // while only the address bar follows the committed URL.
    const { container } = render(
      <DesignBrowserPanel projectId="proj-webview" onOpenFile={() => {}} onRefreshFiles={() => {}} />,
    );

    const input = screen.getByLabelText('Browser address') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'example.com' } });
    fireEvent.submit(input.closest('form')!);

    const webview = container.querySelector('webview.db-webview') as HTMLElement | null;
    expect(webview).not.toBeNull();
    // The bare domain is normalized to https and becomes the load target.
    expect(webview!.getAttribute('src')).toBe('https://example.com');
    expect(getAddressDisplay(container).url).toBe('https://example.com');

    // The guest commits a redirect that appends a trailing slash.
    dispatchWebviewNavigate(webview!, 'https://example.com/');

    // The address bar follows the committed URL...
    expect(getAddressDisplay(container).url).toBe('https://example.com/');
    // ...but the src remains the original target, so no abort/reload loop.
    expect(webview!.getAttribute('src')).toBe('https://example.com');
  });

  it('changes the src only when the user navigates to a new target', () => {
    const { container } = render(
      <DesignBrowserPanel projectId="proj-webview-2" onOpenFile={() => {}} onRefreshFiles={() => {}} />,
    );

    const input = screen.getByLabelText('Browser address') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://gsap.com' } });
    fireEvent.submit(input.closest('form')!);

    const webview = container.querySelector('webview.db-webview') as HTMLElement;
    expect(webview.getAttribute('src')).toBe('https://gsap.com');

    // An in-page navigation event must not move the load target.
    dispatchWebviewNavigate(webview, 'https://gsap.com/docs/');
    expect(webview.getAttribute('src')).toBe('https://gsap.com');
    expect(getAddressDisplay(container).url).toBe('https://gsap.com/docs/');

    // A fresh user navigation does move it.
    fireEvent.change(input, { target: { value: 'unsplash.com' } });
    fireEvent.submit(input.closest('form')!);
    expect(webview.getAttribute('src')).toBe('https://unsplash.com');
  });

  it('derives back and forward availability from the committed navigation stack', () => {
    const { container } = render(
      <DesignBrowserPanel projectId="proj-webview-3" onOpenFile={() => {}} onRefreshFiles={() => {}} />,
    );

    const input = screen.getByLabelText('Browser address') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'example.com' } });
    fireEvent.submit(input.closest('form')!);

    const webview = container.querySelector('webview.db-webview') as HTMLElement & {
      loadURL?: (url: string) => void;
    };
    const loadURL = vi.fn();
    webview.loadURL = loadURL;

    const backButton = screen.getByRole('button', { name: 'Go Back' }) as HTMLButtonElement;
    const forwardButton = screen.getByRole('button', { name: 'Go Forward' }) as HTMLButtonElement;
    expect(backButton.disabled).toBe(false);
    expect(backButton.parentElement?.getAttribute('data-tooltip')).toBe('Go Back');

    dispatchWebviewNavigate(webview, 'https://example.com/');
    expect(backButton.disabled).toBe(false);

    dispatchWebviewNavigate(webview, 'https://example.com/docs/');
    expect(getAddressDisplay(container).url).toBe('https://example.com/docs/');
    expect(backButton.disabled).toBe(false);
    expect(forwardButton.disabled).toBe(true);

    fireEvent.click(backButton);
    expect(loadURL).toHaveBeenCalledWith('https://example.com/');
    expect(forwardButton.disabled).toBe(false);
  });

  it('treats the start page as the previous browser step after the first address navigation', () => {
    const { container } = render(
      <DesignBrowserPanel projectId="proj-webview-home-back" onOpenFile={() => {}} onRefreshFiles={() => {}} />,
    );

    expect(screen.getByText('Reference Board')).toBeTruthy();

    const input = screen.getByLabelText('Browser address') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://dribbble.com/' } });
    fireEvent.submit(input.closest('form')!);

    const webview = container.querySelector('webview.db-webview') as HTMLElement | null;
    expect(webview?.getAttribute('src')).toBe('https://dribbble.com/');

    const backButton = screen.getByRole('button', { name: 'Go Back' }) as HTMLButtonElement;
    const forwardButton = screen.getByRole('button', { name: 'Go Forward' }) as HTMLButtonElement;
    expect(backButton.disabled).toBe(false);
    expect(forwardButton.disabled).toBe(true);

    fireEvent.click(backButton);

    expect(screen.getByText('Reference Board')).toBeTruthy();
    expect(container.querySelector('webview.db-webview')).toBeNull();
    expect((screen.getByLabelText('Browser address') as HTMLInputElement).value).toBe('');
    expect(backButton.disabled).toBe(true);
    expect(forwardButton.disabled).toBe(false);

    fireEvent.click(forwardButton);

    expect(container.querySelector('webview.db-webview')?.getAttribute('src')).toBe('https://dribbble.com/');
  });

  it('uses native webview history for back navigation when Chromium has it cached', () => {
    const { container } = render(
      <DesignBrowserPanel projectId="proj-webview-native" onOpenFile={() => {}} onRefreshFiles={() => {}} />,
    );

    const input = screen.getByLabelText('Browser address') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'example.com' } });
    fireEvent.submit(input.closest('form')!);

    const webview = container.querySelector('webview.db-webview') as HTMLElement & {
      canGoBack?: () => boolean;
      goBack?: () => void;
      loadURL?: (url: string) => void;
    };
    dispatchWebviewNavigate(webview, 'https://example.com/');
    dispatchWebviewNavigate(webview, 'https://example.com/docs/');

    const goBack = vi.fn();
    const loadURL = vi.fn();
    webview.canGoBack = () => true;
    webview.goBack = goBack;
    webview.loadURL = loadURL;

    fireEvent.click(screen.getByRole('button', { name: 'Go Back' }));

    expect(goBack).toHaveBeenCalledTimes(1);
    expect(loadURL).not.toHaveBeenCalled();
  });

  it('shows extracted page titles in the passive address display and history suggestions', () => {
    const { container } = render(
      <DesignBrowserPanel projectId="proj-webview-title" onOpenFile={() => {}} onRefreshFiles={() => {}} />,
    );

    const input = screen.getByLabelText('Browser address') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://www.baidu.com' } });
    fireEvent.submit(input.closest('form')!);

    const webview = container.querySelector('webview.db-webview') as HTMLElement & {
      getTitle?: () => string;
      getURL?: () => string;
    };
    webview.getURL = () => 'https://www.baidu.com/';
    webview.getTitle = () => '百度一下，你就知道';
    dispatchWebviewNavigate(webview, 'https://www.baidu.com/');
    dispatchWebviewTitle(webview, '百度一下，你就知道');
    fireEvent.blur(input);

    expect(getAddressDisplay(container)).toMatchObject({
      title: '百度一下，你就知道',
      url: 'https://www.baidu.com',
    });

    fireEvent.focus(input);
    expect(input.value).toBe('https://www.baidu.com/');
    expect(screen.getByRole('option', { name: /百度一下，你就知道/ })).toBeTruthy();
  });

  it('opens all reference suggestions by default from the address bar', () => {
    render(
      <DesignBrowserPanel projectId="proj-webview-suggestions" onOpenFile={() => {}} onRefreshFiles={() => {}} />,
    );

    fireEvent.focus(screen.getByLabelText('Browser address'));

    expect(screen.getByRole('option', { name: /Whirrls/ })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Startups Gallery/ })).toBeTruthy();
  });

  it('closes address suggestions when the address input blurs outside the address bar', () => {
    render(
      <DesignBrowserPanel projectId="proj-webview-suggestions-blur" onOpenFile={() => {}} onRefreshFiles={() => {}} />,
    );

    const input = screen.getByLabelText('Browser address');
    fireEvent.focus(input);

    expect(screen.getByRole('listbox')).toBeTruthy();

    fireEvent.blur(input, { relatedTarget: null });

    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('keeps the browser fallback content free of desktop-only overlay banners', () => {
    restoreHost?.();
    restoreHost = null;

    const { container } = render(
      <DesignBrowserPanel projectId="proj-browser-fallback" onOpenFile={() => {}} onRefreshFiles={() => {}} />,
    );

    const input = screen.getByLabelText('Browser address') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://example.com' } });
    fireEvent.submit(input.closest('form')!);

    expect(container.querySelector('iframe')).not.toBeNull();
    expect(screen.queryByText('Embedded browser controls are available in the desktop app.')).toBeNull();
  });

  it('does not render saved comment markers in the browser fallback iframe', () => {
    restoreHost?.();
    restoreHost = null;

    const previewComments = [{
      id: 'comment-fallback-1',
      projectId: 'proj-browser-fallback-comments',
      conversationId: 'conv-1',
      filePath: 'browser:https://example.com',
      elementId: 'dom:#card',
      selector: '#card',
      label: 'article.card',
      note: 'Review this card',
      text: 'Card',
      position: { x: 24, y: 32, width: 240, height: 160 },
      htmlHint: '<article id="card">',
      status: 'open' as const,
      createdAt: 1,
      updatedAt: 1,
    }];

    const { container } = render(
      <DesignBrowserPanel
        initialUrl="https://example.com"
        projectId="proj-browser-fallback-comments"
        previewComments={previewComments}
        onOpenFile={() => {}}
        onRefreshFiles={() => {}}
      />,
    );

    expect(container.querySelector('iframe')).not.toBeNull();
    expect(container.querySelector('.db-comment-layer')).toBeNull();
    expect(container.querySelector('.db-comment-marker')).toBeNull();
  });

  it('does not expose page annotation controls in the external browser', () => {
    const { container } = render(
      <I18nProvider initial="zh-CN">
        <DesignBrowserPanel
          initialUrl="https://example.com"
          projectId="proj-webview-mark-i18n"
          onOpenFile={() => {}}
          onRefreshFiles={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.queryByRole('button', { name: '标记' })).toBeNull();
    expect(screen.queryByRole('button', { name: '评论' })).toBeNull();
    expect(container.querySelector('.ri-pencil-line')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Annotate page' })).toBeNull();
  });

  it('does not start browser element comments from the external browser toolbar', () => {
    const onSendBoardCommentAttachments = vi.fn(async (_attachments: unknown[], _images?: File[]) => undefined);
    const { container } = render(
      <DesignBrowserPanel
        initialUrl="https://example.com"
        projectId="proj-webview-comment-queue"
        onOpenFile={() => {}}
        onRefreshFiles={() => {}}
        onSendBoardCommentAttachments={onSendBoardCommentAttachments}
        sendDisabled
      />,
    );

    const webview = container.querySelector('webview.db-webview') as HTMLElement & {
      executeJavaScript?: ReturnType<typeof vi.fn>;
    };
    webview.executeJavaScript = vi.fn();

    expect(screen.queryByRole('button', { name: 'Comment' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Browser menu' }));
    expect(screen.queryByRole('menuitem', { name: 'Comment' })).toBeNull();
    expect(screen.queryByTestId('comment-popover-input')).toBeNull();
    expect(onSendBoardCommentAttachments).not.toHaveBeenCalled();
    expect(webview.executeJavaScript).not.toHaveBeenCalled();
  });

  it('does not render saved browser comment markers in the external browser', async () => {
    const previewComments = [{
      id: 'comment-1',
      projectId: 'proj-webview-live-comment-marker',
      conversationId: 'conv-1',
      filePath: 'browser:https://example.com',
      elementId: 'dom:#card',
      selector: '#card',
      label: 'article.card',
      note: 'Review this card',
      text: 'Card',
      position: { x: 24, y: 32, width: 240, height: 160 },
      htmlHint: '<article id="card">',
      status: 'open' as const,
      createdAt: 1,
      updatedAt: 1,
    }];
    const { container } = render(
      <DesignBrowserPanel
        initialUrl="https://example.com"
        projectId="proj-webview-live-comment-marker"
        previewComments={previewComments}
        onOpenFile={() => {}}
        onRefreshFiles={() => {}}
      />,
    );

    const webview = container.querySelector('webview.db-webview') as HTMLElement & {
      executeJavaScript?: ReturnType<typeof vi.fn>;
    };
    webview.executeJavaScript = vi.fn(async () => []);

    await act(async () => {
      await Promise.resolve();
    });

    expect(webview.executeJavaScript).not.toHaveBeenCalled();
    expect(container.querySelector('.db-comment-layer')).toBeNull();
    expect(container.querySelector('.db-comment-marker')).toBeNull();
  });

  it('keeps browser screenshot capture available after hiding annotation tools', async () => {
    restoreHost?.();
    const capturePage = vi.fn(async () => {
      expect(document.querySelector('.preview-draw-toolbar')).toBeNull();
      return { ok: true as const, dataUrl: 'data:image/png;base64,cG5n', w: 10, h: 10 };
    });
    restoreHost = installMockOpenDesignHost({
      host: { capture: { page: capturePage } },
    });

    const { container } = render(
      <DesignBrowserPanel
        initialUrl="https://example.com"
        projectId="proj-webview-screenshot-hides-tools"
        onOpenFile={() => {}}
        onRefreshFiles={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Mark' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Comment' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Screenshot' }));

    await waitFor(() => expect(capturePage).toHaveBeenCalledTimes(1));
  });
});
