// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileViewer } from '../../src/components/FileViewer';
import { PREVIEW_VIEWPORT_GROUPS } from '../../src/components/preview-viewports';
import type { ProjectFile } from '../../src/types';
import { readExpandedIndexCss } from '../helpers/read-expanded-css';

function htmlFile(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    name: 'preview.html',
    path: 'preview.html',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'html',
    mime: 'text/html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: 'Preview',
      entry: 'preview.html',
      renderer: 'html',
      exports: ['html'],
    },
    ...overrides,
  };
}

function testRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    width,
    height,
    top,
    left,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

function renderPreview(file = htmlFile(), projectId = 'proj-viewport-presets') {
  return render(
    <FileViewer
      projectId={projectId}
      projectKind="prototype"
      file={file}
      liveHtml="<html><body><main>Responsive page</main></body></html>"
    />,
  );
}

function viewportTrigger() {
  return screen.getByRole('button', { name: 'Preview viewport' });
}

function previewViewportEl() {
  return screen.getByTestId('comment-preview-layout');
}

describe('FileViewer viewport presets and 1-click rotate', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders Fluid Desktop and grouped Mobile (5), Tablet (3), and Desktop (3) presets in the dropdown', () => {
    renderPreview(htmlFile(), 'proj-grouped-menu');

    fireEvent.click(viewportTrigger());
    const listbox = screen.getByRole('listbox', { name: 'Preview viewport' });
    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(12);
    expect(within(listbox).getByRole('option', { name: /^Desktop$/i }).getAttribute('aria-selected')).toBe('true');

    const groups = within(listbox).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('aria-label') || group.textContent)).toHaveLength(3);

    const mobileGroup = within(listbox).getByRole('group', { name: 'Mobile' });
    const tabletGroup = within(listbox).getByRole('group', { name: 'Tablet' });
    const desktopGroup = within(listbox).getByRole('group', { name: 'Desktop' });

    expect(within(mobileGroup).getAllByRole('option')).toHaveLength(5);
    expect(within(tabletGroup).getAllByRole('option')).toHaveLength(3);
    expect(within(desktopGroup).getAllByRole('option')).toHaveLength(3);

    for (const group of PREVIEW_VIEWPORT_GROUPS) {
      const targetGroup =
        group.category === 'mobile' ? mobileGroup : group.category === 'tablet' ? tabletGroup : desktopGroup;
      for (const preset of group.presets) {
        expect(targetGroup.textContent).toContain(preset.label);
        expect(targetGroup.textContent).toContain(`${preset.width} × ${preset.height}`);
      }
    }
  });

  it('hides the Rotate button on Fluid Desktop and swaps dimensions, CSS vars, and resets on preset switch', () => {
    renderPreview(htmlFile(), 'proj-rotate-flow');

    // Default Fluid Desktop: no Rotate button, .preview-viewport-desktop class, no viewport CSS vars.
    expect(viewportTrigger().textContent).toContain('Desktop');
    expect(screen.queryByRole('button', { name: 'Rotate orientation' })).toBeNull();
    expect(previewViewportEl().classList.contains('preview-viewport-desktop')).toBe(true);
    expect(previewViewportEl().style.getPropertyValue('--preview-viewport-width')).toBe('');
    expect(previewViewportEl().style.getPropertyValue('--preview-viewport-height')).toBe('');

    // Select iPhone 15 (390 x 844) -> Rotate button appears.
    fireEvent.click(viewportTrigger());
    fireEvent.click(screen.getByRole('option', { name: /^iPhone 15\s*390 × 844$/i }));

    expect(viewportTrigger().textContent).toContain('iPhone 15 · 390 × 844');
    const rotateBtn = screen.getByRole('button', { name: 'Rotate orientation' });
    expect(rotateBtn.getAttribute('aria-pressed')).toBe('false');
    expect(previewViewportEl().classList.contains('preview-viewport-mobile')).toBe(true);
    expect(previewViewportEl().classList.contains('preview-viewport-desktop')).toBe(false);
    expect(previewViewportEl().style.getPropertyValue('--preview-viewport-width')).toBe('390px');
    expect(previewViewportEl().style.getPropertyValue('--preview-viewport-height')).toBe('844px');

    // Click Rotate -> swaps to 844 x 390.
    fireEvent.click(rotateBtn);
    expect(viewportTrigger().textContent).toContain('iPhone 15 · 844 × 390');
    expect(rotateBtn.getAttribute('aria-pressed')).toBe('true');
    expect(previewViewportEl().style.getPropertyValue('--preview-viewport-width')).toBe('844px');
    expect(previewViewportEl().style.getPropertyValue('--preview-viewport-height')).toBe('390px');

    // Click Rotate again -> restores 390 x 844.
    fireEvent.click(rotateBtn);
    expect(viewportTrigger().textContent).toContain('iPhone 15 · 390 × 844');
    expect(rotateBtn.getAttribute('aria-pressed')).toBe('false');

    // Rotate again, then switch to fixed Desktop preset Full HD -> orientation resets to default landscape (1920 x 1080).
    fireEvent.click(rotateBtn);
    expect(viewportTrigger().textContent).toContain('iPhone 15 · 844 × 390');

    fireEvent.click(viewportTrigger());
    fireEvent.click(screen.getByRole('option', { name: /Full HD/i }));

    expect(viewportTrigger().textContent).toContain('Full HD · 1920 × 1080');
    expect(screen.getByRole('button', { name: 'Rotate orientation' }).getAttribute('aria-pressed')).toBe('false');
    expect(previewViewportEl().classList.contains('preview-viewport-fixed-desktop')).toBe(true);
    expect(previewViewportEl().classList.contains('preview-viewport-desktop')).toBe(false);
    expect(previewViewportEl().style.getPropertyValue('--preview-viewport-width')).toBe('1920px');
    expect(previewViewportEl().style.getPropertyValue('--preview-viewport-height')).toBe('1080px');

    // Rotate Full HD -> 1080 x 1920.
    fireEvent.click(screen.getByRole('button', { name: 'Rotate orientation' }));
    expect(viewportTrigger().textContent).toContain('Full HD · 1080 × 1920');
    expect(previewViewportEl().style.getPropertyValue('--preview-viewport-width')).toBe('1080px');
    expect(previewViewportEl().style.getPropertyValue('--preview-viewport-height')).toBe('1920px');

    // Switch back to Fluid Desktop -> Rotate button disappears again.
    fireEvent.click(viewportTrigger());
    fireEvent.click(screen.getByRole('option', { name: /^Desktop$/i }));
    expect(screen.queryByRole('button', { name: 'Rotate orientation' })).toBeNull();
    expect(previewViewportEl().classList.contains('preview-viewport-desktop')).toBe(true);
  });

  it('renders Fluid Desktop, all 3 device groups, and conditional Rotate item in the narrow More menu', () => {
    renderPreview(htmlFile(), 'proj-more-menu');

    // Fluid Desktop: no Rotate orientation item inside More menu.
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    let menu = screen.getByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'Rotate orientation' })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: /^Desktop$/i })).toBeTruthy();

    const mobileGroup = within(menu).getByRole('group', { name: 'Mobile' });
    const tabletGroup = within(menu).getByRole('group', { name: 'Tablet' });
    const desktopGroup = within(menu).getByRole('group', { name: 'Desktop' });
    expect(within(mobileGroup).getAllByRole('menuitem')).toHaveLength(5);
    expect(within(tabletGroup).getAllByRole('menuitem')).toHaveLength(3);
    expect(within(desktopGroup).getAllByRole('menuitem')).toHaveLength(3);

    // Select MacBook (1440 x 900) from More menu.
    fireEvent.click(within(desktopGroup).getByRole('menuitem', { name: /MacBook/i }));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(viewportTrigger().textContent).toContain('MacBook · 1440 × 900');

    // Open More menu again: Rotate orientation item now appears and rotates to 900 x 1440.
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    menu = screen.getByRole('menu');
    const rotateMenuItem = within(menu).getByRole('menuitem', { name: 'Rotate orientation' });
    fireEvent.click(rotateMenuItem);

    expect(screen.queryByRole('menu')).toBeNull();
    expect(viewportTrigger().textContent).toContain('MacBook · 900 × 1440');
    expect(previewViewportEl().style.getPropertyValue('--preview-viewport-width')).toBe('900px');
    expect(previewViewportEl().style.getPropertyValue('--preview-viewport-height')).toBe('1440px');
  });

  it('computes auto-fit scaling in both landscape (1920x1080) and rotated portrait (1080x1920)', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('viewer-body')) return testRect(0, 0, 900, 700);
      return testRect(0, 0, 0, 0);
    });

    renderPreview(htmlFile(), 'proj-autofit-rotate');

    fireEvent.click(viewportTrigger());
    fireEvent.click(screen.getByRole('option', { name: /Full HD/i }));

    await waitFor(() => {
      // Available box is (900 - 48) x (700 - 48) = 852 x 652.
      // Landscape 1920x1080 is width-bound: 852 / 1920 = 0.44375.
      expect(Number(previewViewportEl().style.getPropertyValue('--preview-scale'))).toBeCloseTo(852 / 1920, 5);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Rotate orientation' }));

    await waitFor(() => {
      // Portrait 1080x1920 is height-bound: 652 / 1920 = 0.339583...
      expect(Number(previewViewportEl().style.getPropertyValue('--preview-scale'))).toBeCloseTo(652 / 1920, 5);
    });
  });

  it('retains distinct device frame radii and scrollable viewport menu styling in CSS', () => {
    const css = readExpandedIndexCss();

    expect(css).toContain('.viewer-viewport-menu');
    expect(css).toMatch(/\.viewer-viewport-menu\s*\{[\s\S]*max-height:\s*min\(420px, calc\(100vh - 120px\)\);[\s\S]*overflow-y:\s*auto;/);
    expect(css).toMatch(/\.preview-viewport:not\(\.preview-viewport-desktop\) \.preview-frame-clip[\s\S]*border-radius:\s*18px;/);
    expect(css).toMatch(/\.preview-viewport-mobile \.preview-frame-clip[\s\S]*border-radius:\s*28px;/);
  });
});
