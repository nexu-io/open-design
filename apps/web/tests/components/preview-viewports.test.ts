import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREVIEW_VIEWPORT_STATE,
  FLUID_DESKTOP_VIEWPORT_PRESET,
  PREVIEW_VIEWPORT_GROUPS,
  PREVIEW_VIEWPORT_PRESETS,
  commentPreviewCanvasSize,
  effectivePreviewScale,
  findPreviewViewportPreset,
  formatPreviewViewportDimensions,
  isFluidDesktopViewport,
  manualEditPreviewShellStyle,
  normalizePreviewViewportState,
  previewOverlayTransform,
  previewScaleShellStyle,
  previewViewportContainerClass,
  previewViewportIcon,
  previewViewportStyle,
  resolveDesktopPreviewZoomPercent,
  resolvePreviewViewportDimensions,
  selectPreviewViewportPreset,
  togglePreviewViewportRotation,
  type PreviewViewportId,
} from '../../src/components/preview-viewports';

describe('preview-viewports', () => {
  it('defines Fluid Desktop plus 11 device presets grouped across Mobile, Tablet, and Desktop', () => {
    expect(FLUID_DESKTOP_VIEWPORT_PRESET).toEqual({
      id: 'desktop',
      category: 'desktop',
      label: 'Desktop',
      width: null,
      height: null,
    });
    expect(PREVIEW_VIEWPORT_PRESETS).toHaveLength(12);
    expect(PREVIEW_VIEWPORT_GROUPS).toHaveLength(3);

    const [mobileGroup, tabletGroup, desktopGroup] = PREVIEW_VIEWPORT_GROUPS;
    expect(mobileGroup?.category).toBe('mobile');
    expect(mobileGroup?.presets).toEqual([
      { id: 'iphone-se', category: 'mobile', label: 'iPhone SE', width: 375, height: 667 },
      { id: 'android-compact', category: 'mobile', label: 'Android Compact', width: 360, height: 800 },
      { id: 'mobile', category: 'mobile', label: 'iPhone 15', width: 390, height: 844 },
      { id: 'pixel-8', category: 'mobile', label: 'Pixel 8', width: 412, height: 915 },
      { id: 'iphone-15-pro-max', category: 'mobile', label: 'iPhone 15 Pro Max', width: 430, height: 932 },
    ]);

    expect(tabletGroup?.category).toBe('tablet');
    expect(tabletGroup?.presets).toEqual([
      { id: 'ipad-mini', category: 'tablet', label: 'iPad Mini', width: 744, height: 1133 },
      { id: 'tablet', category: 'tablet', label: 'iPad Air', width: 820, height: 1180 },
      { id: 'ipad-pro', category: 'tablet', label: 'iPad Pro', width: 1024, height: 1366 },
    ]);

    expect(desktopGroup?.category).toBe('desktop');
    expect(desktopGroup?.presets).toEqual([
      { id: 'laptop', category: 'desktop', label: 'Laptop', width: 1366, height: 768 },
      { id: 'macbook', category: 'desktop', label: 'MacBook', width: 1440, height: 900 },
      { id: 'full-hd', category: 'desktop', label: 'Full HD', width: 1920, height: 1080 },
    ]);
  });

  it('toggles Portrait <-> Landscape orientation for mobile, tablet, and fixed desktop presets', () => {
    // Fluid desktop cannot rotate.
    expect(togglePreviewViewportRotation('desktop')).toEqual(DEFAULT_PREVIEW_VIEWPORT_STATE);
    expect(resolvePreviewViewportDimensions('desktop')).toBeNull();

    // Mobile (portrait default -> landscape -> portrait)
    const mobileRotated = togglePreviewViewportRotation({ id: 'mobile', rotated: false });
    expect(mobileRotated).toEqual({ id: 'mobile', rotated: true });
    expect(resolvePreviewViewportDimensions(mobileRotated)).toEqual({ width: 844, height: 390 });
    expect(togglePreviewViewportRotation(mobileRotated)).toEqual({ id: 'mobile', rotated: false });
    expect(resolvePreviewViewportDimensions({ id: 'mobile', rotated: false })).toEqual({ width: 390, height: 844 });

    // Tablet (portrait default -> landscape -> portrait)
    const tabletRotated = togglePreviewViewportRotation('tablet');
    expect(tabletRotated).toEqual({ id: 'tablet', rotated: true });
    expect(resolvePreviewViewportDimensions(tabletRotated)).toEqual({ width: 1180, height: 820 });
    expect(togglePreviewViewportRotation(tabletRotated)).toEqual({ id: 'tablet', rotated: false });

    // Fixed desktop (landscape default -> portrait -> landscape)
    const fullHdRotated = togglePreviewViewportRotation({ id: 'full-hd', rotated: false });
    expect(fullHdRotated).toEqual({ id: 'full-hd', rotated: true });
    expect(resolvePreviewViewportDimensions(fullHdRotated)).toEqual({ width: 1080, height: 1920 });
    expect(togglePreviewViewportRotation(fullHdRotated)).toEqual({ id: 'full-hd', rotated: false });
    expect(resolvePreviewViewportDimensions({ id: 'full-hd', rotated: false })).toEqual({ width: 1920, height: 1080 });
  });

  it('resets orientation when selecting any preset', () => {
    const selectedMobile = selectPreviewViewportPreset('mobile');
    const rotatedMobile = togglePreviewViewportRotation(selectedMobile);
    expect(rotatedMobile.rotated).toBe(true);

    expect(selectPreviewViewportPreset('tablet')).toEqual({ id: 'tablet', rotated: false });
    expect(selectPreviewViewportPreset('mobile')).toEqual({ id: 'mobile', rotated: false });
    expect(selectPreviewViewportPreset('full-hd')).toEqual({ id: 'full-hd', rotated: false });
    expect(selectPreviewViewportPreset('desktop')).toEqual({ id: 'desktop', rotated: false });
  });

  it('normalizes string and object inputs and maps CSS container classes and icons', () => {
    expect(normalizePreviewViewportState()).toEqual({ id: 'desktop', rotated: false });
    expect(normalizePreviewViewportState('mobile')).toEqual({ id: 'mobile', rotated: false });
    expect(normalizePreviewViewportState({ id: 'desktop', rotated: true })).toEqual({ id: 'desktop', rotated: false });
    expect(normalizePreviewViewportState({ id: 'ipad-pro', rotated: true })).toEqual({ id: 'ipad-pro', rotated: true });

    expect(isFluidDesktopViewport('desktop')).toBe(true);
    expect(isFluidDesktopViewport({ id: 'full-hd', rotated: false })).toBe(false);

    expect(previewViewportContainerClass('desktop')).toBe('preview-viewport-desktop');
    expect(previewViewportContainerClass({ id: 'iphone-se', rotated: true })).toBe('preview-viewport-mobile');
    expect(previewViewportContainerClass({ id: 'ipad-mini', rotated: true })).toBe('preview-viewport-tablet');
    expect(previewViewportContainerClass({ id: 'laptop', rotated: false })).toBe('preview-viewport-fixed-desktop');
    expect(previewViewportContainerClass({ id: 'full-hd', rotated: true })).toBe('preview-viewport-fixed-desktop');

    expect(previewViewportIcon('desktop')).toBe('computer-line');
    expect(previewViewportIcon('full-hd')).toBe('computer-line');
    expect(previewViewportIcon('ipad-pro')).toBe('tablet-line');
    expect(previewViewportIcon('pixel-8')).toBe('smartphone-line');

    expect(findPreviewViewportPreset('unknown' as PreviewViewportId)).toEqual(FLUID_DESKTOP_VIEWPORT_PRESET);
    expect(formatPreviewViewportDimensions(1920, 1080)).toBe('1920 × 1080');
  });

  it('preserves backward-compatible helper signatures for string IDs and viewport state objects', () => {
    const canvas = { width: 900, height: 700 };

    // effectivePreviewScale: string vs state object
    expect(effectivePreviewScale('desktop', 1.5, canvas)).toBe(1.5);
    expect(effectivePreviewScale({ id: 'desktop', rotated: false }, 1.5, canvas)).toBe(1.5);
    expect(effectivePreviewScale('tablet', 1, canvas)).toBeCloseTo(
      effectivePreviewScale({ id: 'tablet', rotated: false }, 1, canvas),
    );
    expect(effectivePreviewScale({ id: 'tablet', rotated: true }, 1, canvas)).toBeCloseTo(
      Math.min(1, (900 - 48) / 1180, (700 - 48) / 820),
    );

    // Auto-fit scaling for 1920x1080 landscape vs 1080x1920 portrait
    expect(effectivePreviewScale({ id: 'full-hd', rotated: false }, 1, canvas)).toBeCloseTo(
      Math.min(1, (900 - 48) / 1920, (700 - 48) / 1080),
    );
    expect(effectivePreviewScale({ id: 'full-hd', rotated: true }, 1, canvas)).toBeCloseTo(
      Math.min(1, (900 - 48) / 1080, (700 - 48) / 1920),
    );

    // previewViewportStyle reflects rotated CSS vars and auto-fit scale
    expect(previewViewportStyle('desktop', 1, canvas)).toEqual({});
    expect(previewViewportStyle({ id: 'full-hd', rotated: false }, 1, canvas)).toEqual({
      '--preview-viewport-width': '1920px',
      '--preview-viewport-height': '1080px',
      '--preview-scale': (900 - 48) / 1920,
      '--preview-user-scale': 1,
    });
    expect(previewViewportStyle({ id: 'full-hd', rotated: true }, 1, canvas)).toEqual({
      '--preview-viewport-width': '1080px',
      '--preview-viewport-height': '1920px',
      '--preview-scale': (700 - 48) / 1920,
      '--preview-user-scale': 1,
    });

    // commentPreviewCanvasSize: non-fluid desktop keeps 24px dock padding for fixed desktop too
    expect(commentPreviewCanvasSize(canvas, { boardMode: true, sidePanelCollapsed: false, viewport: 'tablet' })).toEqual({
      width: 520,
      height: 652,
    });
    expect(
      commentPreviewCanvasSize(canvas, {
        boardMode: true,
        sidePanelCollapsed: false,
        viewport: { id: 'full-hd', rotated: true },
      }),
    ).toEqual({
      width: 520,
      height: 652,
    });

    // resolveDesktopPreviewZoomPercent: auto-fit only on fluid desktop, manual zoom on fixed presets
    expect(
      resolveDesktopPreviewZoomPercent({
        zoomMode: 'auto',
        viewport: 'desktop',
        isDeck: false,
        manualZoomPercent: 100,
        canvasSize: canvas,
        contentWidth: 1440,
      }),
    ).toBeCloseTo(62.5);
    expect(
      resolveDesktopPreviewZoomPercent({
        zoomMode: 'auto',
        viewport: { id: 'macbook', rotated: false },
        isDeck: false,
        manualZoomPercent: 125,
        canvasSize: canvas,
        contentWidth: 1440,
      }),
    ).toBe(125);

    // previewOverlayTransform: string vs rotated state object
    expect(previewOverlayTransform('mobile', 1, { width: 1200, height: 1000 })).toEqual(
      previewOverlayTransform({ id: 'mobile', rotated: false }, 1, { width: 1200, height: 1000 }),
    );
    expect(previewOverlayTransform({ id: 'mobile', rotated: true }, 1, { width: 1200, height: 1000 })).toEqual({
      scale: 1,
      offsetX: 24 + (1152 - 844) / 2,
      offsetY: 24,
    });

    // Shell styles
    expect(previewScaleShellStyle('desktop', 0.5)).toEqual({
      width: '200%',
      height: '200%',
      transform: 'scale(0.5)',
      transformOrigin: '0 0',
    });
    expect(previewScaleShellStyle({ id: 'full-hd', rotated: true }, 1)).toEqual({
      width: 'var(--preview-viewport-width)',
      height: 'var(--preview-viewport-height)',
      transform: 'scale(var(--preview-scale, 1))',
      transformOrigin: '0 0',
    });
    expect(manualEditPreviewShellStyle('desktop', 0.5, 1000)).toEqual({
      width: '2000px',
      height: '200%',
      transform: 'scale(0.5)',
      transformOrigin: '0 0',
    });
  });
});
