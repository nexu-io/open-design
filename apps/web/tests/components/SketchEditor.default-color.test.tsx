// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SketchEditor } from '../../src/components/SketchEditor';
import { I18nProvider } from '../../src/i18n';

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

function renderEditor() {
  return render(
    <I18nProvider initial="en">
      <SketchEditor
        items={[]}
        onItemsChange={vi.fn()}
        onSave={vi.fn()}
        fileName="scratch.sketch.json"
      />
    </I18nProvider>,
  );
}

describe('SketchEditor default color', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      save: vi.fn(),
      fillRect: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute('data-theme');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('starts with a light pen color under the dark theme', () => {
    document.documentElement.setAttribute('data-theme', 'dark');

    const { container } = renderEditor();

    const colorInput = container.querySelector<HTMLInputElement>('input[type="color"]');
    expect(colorInput?.value).toBe('#ffffff');
  });

  it('keeps the existing default pen color under the light theme', () => {
    document.documentElement.setAttribute('data-theme', 'light');

    const { container } = renderEditor();

    const colorInput = container.querySelector<HTMLInputElement>('input[type="color"]');
    expect(colorInput?.value).toBe('#1c1b1a');
  });
});
