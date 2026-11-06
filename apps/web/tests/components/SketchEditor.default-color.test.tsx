// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SketchEditor } from '../../src/components/SketchEditor';
import { emptySketchScene } from '../../src/components/sketch-model';
import { I18nProvider } from '../../src/i18n';

vi.mock('@excalidraw/excalidraw', async () => {
  const React = await import('react');
  const MainMenu = Object.assign(
    (props: Record<string, any>) => React.createElement('div', null, props.children),
    {
      Item: ({ children, icon, ...props }: Record<string, any>) =>
        React.createElement('button', { type: 'button', ...props }, icon, children),
      DefaultItems: {
        SearchMenu: () => null,
        Help: () => null,
        ChangeCanvasBackground: () => null,
      },
      Separator: () => null,
    },
  );
  return {
    Excalidraw: (props: Record<string, any>) => {
      const initialData = props.initialData;
      return React.createElement(
        'div',
        {
          'data-testid': 'excalidraw',
          'data-stroke': initialData?.appState?.currentItemStrokeColor,
        },
        props.children,
      );
    },
    MainMenu,
    convertToExcalidrawElements: vi.fn((elements: unknown[]) => elements),
    exportToBlob: vi.fn(async () => new Blob(['mock image'], { type: 'image/png' })),
  };
});

beforeAll(() => {
  if (!window.requestAnimationFrame) {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(callback, 0));
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle));
  }
});

function renderEditor() {
  return render(
    <I18nProvider initial="en">
      <SketchEditor
        scene={emptySketchScene('scratch.sketch.json')}
        onSceneChange={vi.fn()}
        onSave={vi.fn()}
        fileName="scratch.sketch.json"
      />
    </I18nProvider>,
  );
}

describe('SketchEditor default color', () => {
  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute('data-theme');
    vi.restoreAllMocks();
  });

  it('starts with a light pen color under the dark theme', () => {
    document.documentElement.setAttribute('data-theme', 'dark');

    renderEditor();

    expect(document.querySelector('[data-testid="excalidraw"]')?.getAttribute('data-stroke')).toBe('#ffffff');
  });

  it('keeps the existing default pen color under the light theme', () => {
    document.documentElement.setAttribute('data-theme', 'light');

    renderEditor();

    expect(document.querySelector('[data-testid="excalidraw"]')?.getAttribute('data-stroke')).toBe('#1c1b1a');
  });
});
