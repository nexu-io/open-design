import { describe, expect, it } from 'vitest';
import {
  registerPreviewModuleCaptureProvider,
  requestPreviewModuleCapture,
  resolveModuleCropRect,
  type PreviewModuleRectInfo,
} from '../../src/runtime/module-capture';

function rectInfo(overrides: Partial<PreviewModuleRectInfo> = {}): PreviewModuleRectInfo {
  return {
    elementId: 'hero',
    label: 'section.hero',
    rect: { x: 0, y: 100, width: 800, height: 400 },
    dpr: 2,
    viewport: { w: 800, h: 600 },
    doc: { w: 800, h: 3000 },
    scroll: { x: 0, y: 0 },
    ...overrides,
  };
}

describe('resolveModuleCropRect', () => {
  it('maps a viewport rect into a full-document snapshot using scroll offsets', () => {
    // Full-doc srcDoc capture: 800x3000 CSS at dpr 2 -> 1600x6000 bitmap.
    const info = rectInfo({ scroll: { x: 0, y: 500 } });
    const crop = resolveModuleCropRect({ w: 1600, h: 6000 }, info);
    expect(crop).toEqual({ x: 0, y: 1200, width: 1600, height: 800 });
  });

  it('maps a viewport rect into a viewport snapshot without scroll offsets', () => {
    // URL-load bridge capture: viewport 800x600 at dpr 2 -> 1600x1200 bitmap.
    const info = rectInfo({ scroll: { x: 0, y: 500 } });
    const crop = resolveModuleCropRect({ w: 1600, h: 1200 }, info);
    expect(crop).toEqual({ x: 0, y: 200, width: 1600, height: 800 });
  });

  it('clamps a module extending past the captured viewport', () => {
    const info = rectInfo({ rect: { x: 0, y: 400, width: 800, height: 600 } });
    const crop = resolveModuleCropRect({ w: 1600, h: 1200 }, info);
    expect(crop).toEqual({ x: 0, y: 800, width: 1600, height: 400 });
  });

  it('returns null when no module rect was resolved', () => {
    expect(resolveModuleCropRect({ w: 1600, h: 1200 }, rectInfo({ rect: undefined }))).toBeNull();
  });

  it('returns null when the module lies fully outside the captured viewport', () => {
    const info = rectInfo({ rect: { x: 0, y: 700, width: 800, height: 300 } });
    expect(resolveModuleCropRect({ w: 1600, h: 1200 }, info)).toBeNull();
  });
});

describe('preview module capture registry', () => {
  it('asks the most recent provider first and stops at the first success', async () => {
    const calls: string[] = [];
    const unregisterA = registerPreviewModuleCaptureProvider(async () => {
      calls.push('a');
      return true;
    });
    const unregisterB = registerPreviewModuleCaptureProvider(async () => {
      calls.push('b');
      return false;
    });
    try {
      await expect(requestPreviewModuleCapture()).resolves.toBe(true);
      expect(calls).toEqual(['b', 'a']);
    } finally {
      unregisterA();
      unregisterB();
    }
  });

  it('reports unhandled when providers decline or are gone', async () => {
    const unregister = registerPreviewModuleCaptureProvider(async () => false);
    try {
      await expect(requestPreviewModuleCapture()).resolves.toBe(false);
    } finally {
      unregister();
    }
    await expect(requestPreviewModuleCapture()).resolves.toBe(false);
  });

  it('skips a throwing provider instead of failing the chain', async () => {
    const unregisterOk = registerPreviewModuleCaptureProvider(async () => true);
    const unregisterBroken = registerPreviewModuleCaptureProvider(async () => {
      throw new Error('boom');
    });
    try {
      await expect(requestPreviewModuleCapture()).resolves.toBe(true);
    } finally {
      unregisterOk();
      unregisterBroken();
    }
  });
});
