// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DesignKitView } from '../../src/components/DesignKitView';
import { PreviewModal } from '../../src/components/PreviewModal';
import { I18nProvider } from '../../src/i18n';
import type { DesignKit } from '../../src/runtime/design-kit';

function previewKit(): DesignKit {
  return {
    designSystemId: 'user:preview-kit',
    name: 'Preview Kit',
    editable: true,
    canUpload: false,
    logoSrc: null,
    logoAlternates: [],
    colors: [{ role: 'Primary', name: 'Primary', hex: '#123456', usage: 'Primary actions' }],
    typography: {
      display: { family: 'Inter', fallbacks: [], weights: [700] },
      body: { family: 'Inter', fallbacks: [], weights: [400] },
    },
    fonts: [],
    system: {
      kitUrl: '/raw/projects/preview/system/kit.html',
    },
    assets: [{
      kind: 'landing',
      label: 'Landing page',
      url: '/raw/projects/preview/system/artifacts/landing.html',
    }],
    showcaseHtml: '<main><a target="_blank" href="/">Open</a></main>',
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DesignKitView iframe sandboxing', () => {
  it('does not let generated kit previews escape the iframe sandbox', () => {
    const { container } = render(
      <I18nProvider initial="en">
        <DesignKitView kit={previewKit()} />
      </I18nProvider>,
    );

    const iframes = Array.from(container.querySelectorAll('iframe'));
    expect(iframes.length).toBeGreaterThan(0);
    for (const iframe of iframes) {
      expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-popups');
    }
    expect(container.innerHTML).not.toContain('allow-popups-to-escape-sandbox');
    expect(container.innerHTML).not.toContain('allow-same-origin');
  });

  it('renders new kit actions with the active non-English locale', () => {
    const kit = { ...previewKit(), canUpload: true };
    render(
      <I18nProvider initial="zh-CN">
        <DesignKitView
          kit={kit}
          designMd={{
            body: '# Preview Kit',
            onSave: async () => {},
            saving: false,
          }}
          onUploadModule={() => {}}
          onRefresh={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.getAllByTitle('复制 DESIGN.md').length).toBeGreaterThan(0);
    expect(screen.getByTitle('添加字体文件')).toBeTruthy();
    expect(screen.getByTitle('复制字体排版段落')).toBeTruthy();
    expect(screen.getByTitle('刷新')).toBeTruthy();
    expect(screen.queryByText('Add font file')).toBeNull();
    expect(screen.queryByText('Copy Typography section')).toBeNull();
    expect(screen.queryByText('Copy DESIGN.md')).toBeNull();
  });

  it('edits only the selected DESIGN.md module section', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <I18nProvider initial="en">
        <DesignKitView
          kit={previewKit()}
          designMd={{
            body: [
              '# Preview Kit',
              '',
              'The system overview.',
              '',
              '## Color Palette',
              '',
              '| Role | Name | Hex | Usage |',
              '| --- | --- | --- | --- |',
              '| primary | Primary | `#123456` | Primary actions |',
              '',
              '## Voice & Tone',
              '',
              '- Direct and clear.',
            ].join('\n'),
            onSave,
            saving: false,
          }}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTitle('Edit Palette section'));

    const textarea = screen.getByRole('textbox', { name: 'Palette DESIGN.md section' }) as HTMLTextAreaElement;
    expect(textarea.value).toContain('## Color Palette');
    expect(textarea.value).not.toContain('## Voice & Tone');

    fireEvent.change(textarea, {
      target: {
        value: [
          '## Color Palette',
          '',
          '| Role | Name | Hex | Usage |',
          '| --- | --- | --- | --- |',
          '| primary | Primary | `#FF6A3D` | Primary actions |',
        ].join('\n'),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save module' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0]?.[0] as string;
    expect(saved).toContain('# Preview Kit');
    expect(saved).toContain('## Voice & Tone');
    expect(saved).toContain('`#FF6A3D`');
    expect(saved).not.toContain('`#123456`');
  });

  it('keeps upload, full-system preview, and shortcut help out of the sticky more menu', () => {
    const baseKit = previewKit();
    const kit = {
      ...baseKit,
      canUpload: true,
      system: {
        kitUrl: baseKit.system!.kitUrl,
        kitDarkUrl: baseKit.system?.kitDarkUrl,
        tokensUrl: baseKit.system?.tokensUrl,
        indexUrl: '/raw/projects/preview/system/index.html',
      },
    };

    render(
      <I18nProvider initial="en">
        <DesignKitView
          kit={kit}
          stickyHeader
          designMd={{
            body: '# Preview Kit',
            onSave: async () => {},
            saving: false,
          }}
          onUploadModule={() => {}}
          onRefresh={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.queryByTestId('design-kit-shortcuts-hint')).toBeNull();

    fireEvent.click(screen.getByTestId('design-kit-more-actions'));

    expect(screen.getByRole('menuitem', { name: 'Edit DESIGN.md' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Copy DESIGN.md' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Upload MD' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Open full system' })).toBeNull();
  });

  it('renders sticky header action loading state in the overflow menu', () => {
    render(
      <I18nProvider initial="en">
        <DesignKitView
          kit={previewKit()}
          stickyHeader
          headerMenuActions={[
            {
              id: 'refresh',
              label: 'Refresh',
              icon: 'refresh',
              onClick: () => {},
              disabled: true,
              loading: true,
            },
          ]}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId('design-kit-more-actions'));
    const refresh = screen.getByRole('menuitem', { name: 'Refresh' });
    expect(refresh.getAttribute('aria-busy')).toBe('true');
    expect((refresh as HTMLButtonElement).disabled).toBe(true);
  });

  it('reports clipboard success for DESIGN.md copy actions', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const onActionFeedback = vi.fn();
    render(
      <I18nProvider initial="en">
        <DesignKitView
          kit={previewKit()}
          stickyHeader
          designMd={{ body: '# Preview Kit' }}
          onActionFeedback={onActionFeedback}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId('design-kit-more-actions'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy DESIGN.md' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('# Preview Kit'));
    expect(onActionFeedback).toHaveBeenCalledWith('loading', 'Copy DESIGN.md...');
    expect(onActionFeedback).toHaveBeenCalledWith('success', 'Copied!');
  });

  it('renders the embedded component kit without an Open full system action', () => {
    const baseKit = previewKit();
    const kit = {
      ...baseKit,
      system: {
        kitUrl: baseKit.system!.kitUrl,
        indexUrl: '/raw/projects/preview/system/index.html',
      },
    };

    const { container } = render(
      <I18nProvider initial="en">
        <DesignKitView kit={kit} />
      </I18nProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Open full system' })).toBeNull();
    expect(container.querySelector('iframe[src="/raw/projects/preview/system/kit.html"]')).toBeTruthy();
  });

  it('opens the component kit on the light file before explicit dark selection', () => {
    const baseKit = previewKit();
    const kit = {
      ...baseKit,
      system: {
        kitUrl: baseKit.system!.kitUrl,
        kitDarkUrl: '/raw/projects/preview/system/kit.dark.html',
      },
    };

    const { container } = render(
      <I18nProvider initial="en">
        <DesignKitView kit={kit} />
      </I18nProvider>,
    );

    expect(container.querySelector('iframe[src="/raw/projects/preview/system/kit.html"]')).toBeTruthy();
    expect(container.querySelector('iframe[src="/raw/projects/preview/system/kit.dark.html"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(container.querySelector('iframe[src="/raw/projects/preview/system/kit.dark.html"]')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(container.querySelector('iframe[src="/raw/projects/preview/system/kit.html"]')).toBeTruthy();
  });

  it('lets users browse design-system images inside the preview modal', () => {
    const kit: DesignKit = {
      ...previewKit(),
      imagery: {
        style: '',
        subjects: [],
        treatment: '',
        avoid: [],
        samples: [
          { url: '/raw/projects/preview/imagery/hero.png', caption: 'Hero image', kind: 'hero' },
          { url: '/raw/projects/preview/imagery/detail.png', caption: 'Detail image', kind: 'detail' },
          { url: '/raw/projects/preview/imagery/filler-3.png', caption: 'Filler image 3', kind: 'detail' },
          { url: '/raw/projects/preview/imagery/filler-4.png', caption: 'Filler image 4', kind: 'detail' },
          { url: '/raw/projects/preview/imagery/filler-5.png', caption: 'Filler image 5', kind: 'detail' },
          { url: '/raw/projects/preview/imagery/filler-6.png', caption: 'Filler image 6', kind: 'detail' },
          { url: '/raw/projects/preview/imagery/filler-7.png', caption: 'Filler image 7', kind: 'detail' },
          { url: '/raw/projects/preview/imagery/filler-8.png', caption: 'Filler image 8', kind: 'detail' },
          { url: '/raw/projects/preview/imagery/hidden.png', caption: 'Hidden image', kind: 'detail' },
        ],
      },
    };

    render(
      <I18nProvider initial="en">
        <DesignKitView kit={kit} />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hero image' }));

    let dialog = screen.getByRole('dialog', { name: 'Hero image' });
    expect(within(dialog).getByRole('img', { name: 'Hero image' }).getAttribute('src')).toBe(
      '/raw/projects/preview/imagery/hero.png',
    );
    expect(within(dialog).getByText('1 / 9')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Previous' }));

    dialog = screen.getByRole('dialog', { name: 'Hidden image' });
    expect(within(dialog).getByRole('img', { name: 'Hidden image' }).getAttribute('src')).toBe(
      '/raw/projects/preview/imagery/hidden.png',
    );
    expect(within(dialog).getByText('9 / 9')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'ArrowRight' });

    dialog = screen.getByRole('dialog', { name: 'Hero image' });
    expect(within(dialog).getByRole('img', { name: 'Hero image' }).getAttribute('src')).toBe(
      '/raw/projects/preview/imagery/hero.png',
    );

    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));

    dialog = screen.getByRole('dialog', { name: 'Detail image' });
    expect(within(dialog).getByRole('img', { name: 'Detail image' }).getAttribute('src')).toBe(
      '/raw/projects/preview/imagery/detail.png',
    );
    expect(within(dialog).getByText('2 / 9')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'ArrowLeft' });

    dialog = screen.getByRole('dialog', { name: 'Hero image' });
    expect(within(dialog).getByRole('img', { name: 'Hero image' }).getAttribute('src')).toBe(
      '/raw/projects/preview/imagery/hero.png',
    );
  });

  it('skips a hidden gallery image when it fails after opening in the lightbox', async () => {
    const kit: DesignKit = {
      ...previewKit(),
      imagery: {
        style: '',
        subjects: [],
        treatment: '',
        avoid: [],
        samples: [
          { url: '/raw/projects/preview/imagery/hero.png', caption: 'Hero image', kind: 'hero' },
          { url: '/raw/projects/preview/imagery/detail.png', caption: 'Detail image', kind: 'detail' },
          { url: '/raw/projects/preview/imagery/filler-3.png', caption: 'Filler image 3', kind: 'detail' },
          { url: '/raw/projects/preview/imagery/filler-4.png', caption: 'Filler image 4', kind: 'detail' },
          { url: '/raw/projects/preview/imagery/filler-5.png', caption: 'Filler image 5', kind: 'detail' },
          { url: '/raw/projects/preview/imagery/filler-6.png', caption: 'Filler image 6', kind: 'detail' },
          { url: '/raw/projects/preview/imagery/filler-7.png', caption: 'Filler image 7', kind: 'detail' },
          { url: '/raw/projects/preview/imagery/filler-8.png', caption: 'Filler image 8', kind: 'detail' },
          { url: '/raw/projects/preview/imagery/hidden.png', caption: 'Hidden image', kind: 'detail' },
        ],
      },
    };

    render(
      <I18nProvider initial="en">
        <DesignKitView kit={kit} />
      </I18nProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Hidden image' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Hero image' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Hero image' })).getByRole('button', { name: 'Previous' }),
    );

    const hiddenDialog = screen.getByRole('dialog', { name: 'Hidden image' });
    fireEvent.error(within(hiddenDialog).getByRole('img', { name: 'Hidden image' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Hidden image' })).toBeNull();
      expect(screen.getByRole('dialog', { name: 'Filler image 8' })).toBeTruthy();
    });

    const fallbackDialog = screen.getByRole('dialog', { name: 'Filler image 8' });
    expect(within(fallbackDialog).getByRole('img', { name: 'Filler image 8' }).getAttribute('src')).toBe(
      '/raw/projects/preview/imagery/filler-8.png',
    );
    expect(within(fallbackDialog).getByText('8 / 8')).toBeTruthy();
  });

  it('lets Escape close an image lightbox before the outer preview modal', () => {
    const onClose = vi.fn();
    const kit: DesignKit = {
      ...previewKit(),
      imagery: {
        style: '',
        subjects: [],
        treatment: '',
        avoid: [],
        samples: [
          { url: '/raw/projects/preview/imagery/hero.png', caption: 'Hero image', kind: 'hero' },
        ],
      },
    };

    render(
      <I18nProvider initial="en">
        <PreviewModal
          title="Preview Kit"
          views={[{
            id: 'kit',
            label: 'Kit',
            custom: <DesignKitView kit={kit} />,
          }]}
          exportTitleFor={() => 'preview-kit'}
          onClose={onClose}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hero image' }));
    expect(screen.getByRole('dialog', { name: 'Hero image' })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Hero image' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Preview Kit preview' })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('scrolls to Logo and reveals edit controls for edit focus requests', () => {
    vi.useFakeTimers();
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    const { container, unmount } = render(
      <I18nProvider initial="en">
        <DesignKitView
          kit={previewKit()}
          editFocusRequest={{ module: 'logo', nonce: 1 }}
        />
      </I18nProvider>,
    );

    try {
      const logoSection = container.querySelector<HTMLElement>('[data-testid="design-kit-logo-section"]');
      if (!logoSection) throw new Error('Expected Logo section to render');
      expect(logoSection.textContent).toContain(
        'Edit Logo here. Hover this section to reveal controls.',
      );
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    } finally {
      unmount();
      vi.useRealTimers();
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
          configurable: true,
          value: originalScrollIntoView,
        });
      } else {
        delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
      }
    }
  });
});
