// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DesignKitView } from '../../src/components/DesignKitView';
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
});
