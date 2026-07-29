// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { StoreScreenshotDocument } from '../../../src/features/store-screenshots/api';
import { StoreScreenshotEditor } from '../../../src/features/store-screenshots/StoreScreenshotEditor';
import { documentResponse } from './fixtures';

const fabricHarness = vi.hoisted(() => {
  class FabricObject {
    left = 0;
    top = 0;
    scaleX = 1;
    scaleY = 1;
    selectable = true;
    evented = true;
    visible = true;
    text = '';
    fill: string | undefined;
    data: Record<string, unknown> = {};

    constructor(options: Record<string, unknown> = {}) {
      Object.assign(this, options);
    }

    set(values: Record<string, unknown>) {
      Object.assign(this, values);
      return this;
    }

    setCoords() {}
  }

  class Rect extends FabricObject {}

  class IText extends FabricObject {
    constructor(text: string, options: Record<string, unknown> = {}) {
      super(options);
      this.text = text;
    }
  }

  class Canvas {
    static last: Canvas | null = null;
    objects: FabricObject[] = [];
    listeners = new Map<string, Set<(event: { target?: FabricObject }) => void>>();
    off = vi.fn((eventName?: string, handler?: (event: { target?: FabricObject }) => void) => {
      if (!eventName) {
        this.listeners.clear();
        return;
      }
      if (!handler) {
        this.listeners.delete(eventName);
        return;
      }
      this.listeners.get(eventName)?.delete(handler);
    });
    dispose = vi.fn(async () => true);
    renderAll = vi.fn();

    constructor() {
      Canvas.last = this;
    }

    add(...objects: FabricObject[]) {
      this.objects.push(...objects);
      return objects[0];
    }

    on(eventName: string, handler: (event: { target?: FabricObject }) => void) {
      const handlers = this.listeners.get(eventName) ?? new Set();
      handlers.add(handler);
      this.listeners.set(eventName, handlers);
      return this;
    }

    emit(eventName: string, target: FabricObject) {
      for (const handler of this.listeners.get(eventName) ?? []) handler({ target });
    }
  }

  return { Canvas, FabricObject, IText, Rect };
});

vi.mock('fabric', () => fabricHarness);

afterEach(() => {
  cleanup();
  fabricHarness.Canvas.last = null;
  vi.clearAllMocks();
});

describe('StoreScreenshotEditor', () => {
  it('converts a product screenshot drag into one current-page setTransform change', () => {
    const onPreviewChangeSet = vi.fn();
    renderEditor({ onPreviewChangeSet });

    const canvas = requiredCanvas();
    const productShot = requiredObject(canvas, 'product-shot');
    productShot.left += 20;
    productShot.top += 30;
    canvas.emit('object:modified', productShot);

    expect(onPreviewChangeSet).toHaveBeenCalledWith({
      baseVersion: 1,
      operations: [{
        op: 'setTransform',
        pageId: 'page-1',
        x: expect.closeTo(71.67, 1),
        y: expect.closeTo(107.5, 1),
        scale: 1,
      }],
    });
  });

  it('converts a product screenshot scale into one current-page setTransform change', () => {
    const onPreviewChangeSet = vi.fn();
    renderEditor({ onPreviewChangeSet });

    const canvas = requiredCanvas();
    const productShot = requiredObject(canvas, 'product-shot');
    productShot.scaleX = 1.25;
    productShot.scaleY = 1.25;
    canvas.emit('object:modified', productShot);

    expect(onPreviewChangeSet).toHaveBeenCalledWith({
      baseVersion: 1,
      operations: [{
        op: 'setTransform',
        pageId: 'page-1',
        x: 0,
        y: 0,
        scale: 1.25,
      }],
    });
  });

  it('emits strict text, color, visibility, and asset replacement changes', () => {
    const onPreviewChangeSet = vi.fn();
    renderEditor({
      document: editorDocument(),
      onPreviewChangeSet,
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'Headline' }), {
      target: { value: 'Focus without friction' },
    });
    fireEvent.blur(screen.getByRole('textbox', { name: 'Headline' }));
    fireEvent.change(screen.getByLabelText('Background color'), {
      target: { value: '#112233' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Visible on this platform' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Product screenshot' }), {
      target: { value: 'asset-2' },
    });

    expect(onPreviewChangeSet.mock.calls.map(([changeSet]) => changeSet.operations[0])).toEqual([
      {
        op: 'setText',
        pageId: 'page-1',
        field: 'headline',
        value: 'Focus without friction',
        platform: 'appStore',
      },
      {
        op: 'setColor',
        pageId: 'page-1',
        field: 'background',
        value: '#112233',
      },
      {
        op: 'setVisibility',
        pageId: 'page-1',
        visible: false,
        platform: 'appStore',
      },
      {
        op: 'setAsset',
        pageId: 'page-1',
        assetId: 'asset-2',
      },
    ]);
  });

  it('keeps locked layout and screenshot nodes inert', () => {
    const onPreviewChangeSet = vi.fn();
    const document = editorDocument();
    document.pages[0]!.lockedFields = ['layout', 'screenshot'];
    renderEditor({ document, onPreviewChangeSet });

    const canvas = requiredCanvas();
    const productShot = requiredObject(canvas, 'product-shot');
    expect(productShot.selectable).toBe(false);
    productShot.left += 50;
    productShot.scaleX = 2;
    canvas.emit('object:modified', productShot);

    expect(screen.getByLabelText('Background color')).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Visible on this platform' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Product screenshot' })).toBeDisabled();
    expect(onPreviewChangeSet).not.toHaveBeenCalled();
  });

  it('disposes the Fabric canvas and unregisters its events on unmount', () => {
    const rendered = renderEditor({ onPreviewChangeSet: vi.fn() });
    const canvas = requiredCanvas();

    rendered.unmount();

    expect(canvas.off).toHaveBeenCalledWith('object:modified', expect.any(Function));
    expect(canvas.off).toHaveBeenCalledWith('text:editing:exited', expect.any(Function));
    expect(canvas.dispose).toHaveBeenCalledTimes(1);
  });
});

function renderEditor({
  document = editorDocument(),
  onPreviewChangeSet,
}: {
  document?: StoreScreenshotDocument;
  onPreviewChangeSet: (changeSet: import('@launch-studio/store-screenshot').StoreScreenshotChangeSet) => void;
}) {
  return render(
    <StoreScreenshotEditor
      document={document}
      page={document.pages[0]!}
      platform="appStore"
      onPreviewChangeSet={onPreviewChangeSet}
    />,
  );
}

function editorDocument(): StoreScreenshotDocument {
  const document = structuredClone(documentResponse.document);
  document.assets = [{ id: 'asset-1' }, { id: 'asset-2' }];
  document.pages[0]!.screenshotAssetId = 'asset-1';
  return document;
}

function requiredCanvas(): InstanceType<typeof fabricHarness.Canvas> {
  const canvas = fabricHarness.Canvas.last;
  if (!canvas) throw new Error('Fabric canvas was not created');
  return canvas;
}

function requiredObject(
  canvas: InstanceType<typeof fabricHarness.Canvas>,
  nodeId: string,
): InstanceType<typeof fabricHarness.FabricObject> {
  const object = canvas.objects.find((candidate) => (
    (candidate.data.storeScreenshotNode as { id?: string } | undefined)?.id === nodeId
  ));
  if (!object) throw new Error(`Fabric object ${nodeId} was not created`);
  return object;
}
