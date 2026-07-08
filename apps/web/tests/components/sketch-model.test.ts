import { describe, expect, it } from 'vitest';
import {
  buildExcalidrawSketchDocument,
  buildSketchDocument,
  computeSketchBounds,
  parseSketchDocument,
  parseSketchWorkspaceDocument,
} from '../../src/components/sketch-model';

describe('sketch-model', () => {
  it('tolerates malformed text items from sketch json when computing bounds', () => {
    const items = parseSketchDocument(JSON.stringify({
      version: 1,
      items: [
        { kind: 'text', x: 0, y: 0, size: 16, color: '#111' },
      ],
    }));

    expect(() => computeSketchBounds(items)).not.toThrow();
    expect(computeSketchBounds(items)).toEqual({
      minX: -4,
      minY: -20,
      maxX: 20,
      maxY: 7.2,
    });
  });

  it('drops malformed non-text items while preserving normalized text items', () => {
    const items = parseSketchDocument(JSON.stringify({
      version: 1,
      items: [
        { kind: 'pen' },
        { kind: 'rect' },
        { kind: 'arrow' },
        { kind: 'text', x: 0, y: 0, size: 16, color: '#111' },
      ],
    }));

    expect(items).toEqual([
      {
        kind: 'text',
        x: 0,
        y: 0,
        text: '',
        color: '#111',
        size: 16,
      },
    ]);
    expect(() => computeSketchBounds(items)).not.toThrow();
    expect(computeSketchBounds(items)).toEqual({
      minX: -4,
      minY: -20,
      maxX: 20,
      maxY: 7.2,
    });
  });

  it('preserves unsupported raw items and version when rebuilding a workspace sketch document', () => {
    const parsed = parseSketchWorkspaceDocument(JSON.stringify({
      version: 3,
      items: [
        { kind: 'pen', points: [{ x: 1, y: 2 }], color: '#111', size: 2 },
        { kind: 'ellipse', cx: 80, cy: 60, rx: 24, ry: 12, color: '#0af', size: 3 },
        { kind: 'text', x: 20, y: 32, text: 'hello', color: '#222', size: 16 },
      ],
    }));

    const rebuilt = buildSketchDocument(parsed.version, parsed.rawItems, parsed.items);

    expect(rebuilt).toEqual({
      version: 3,
      items: [
        { kind: 'pen', points: [{ x: 1, y: 2 }], color: '#111', size: 2 },
        { kind: 'ellipse', cx: 80, cy: 60, rx: 24, ry: 12, color: '#0af', size: 3 },
        { kind: 'text', x: 20, y: 32, text: 'hello', color: '#222', size: 16 },
      ],
    });
  });

  it('drops unsupported raw items when rebuilding from an explicit clear state', () => {
    const rebuilt = buildSketchDocument(3, [], []);

    expect(rebuilt).toEqual({
      version: 3,
      items: [],
    });
  });

  it('parses Excalidraw sketch documents as scenes', () => {
    const parsed = parseSketchWorkspaceDocument(JSON.stringify({
      type: 'excalidraw',
      version: 2,
      source: 'https://open-design.ai/sketch',
      elements: [
        { id: 'box', type: 'rectangle', x: 10, y: 20, width: 80, height: 40 },
      ],
      appState: { viewBackgroundColor: '#ffffff' },
      files: {},
      libraryItems: [
        {
          id: 'lib-box',
          status: 'unpublished',
          created: 1710000000000,
          elements: [{ id: 'box-template', type: 'rectangle', isDeleted: false }],
        },
      ],
    }));

    expect(parsed.format).toBe('excalidraw');
    expect(parsed.items).toEqual([]);
    expect(parsed.rawItems).toEqual([]);
    expect(parsed.scene.elements).toHaveLength(1);
    expect(parsed.scene.appState).toEqual({ viewBackgroundColor: '#ffffff' });
    expect(parsed.scene).not.toHaveProperty('libraryItems');
  });

  it('serializes Excalidraw scenes without transient app state', () => {
    const document = buildExcalidrawSketchDocument({
      elements: [{ id: 'box', type: 'rectangle', isDeleted: false }],
      appState: {
        name: 'scratch.sketch.json',
        viewBackgroundColor: '#ffffff',
        openMenu: 'canvas',
        collaborators: new Map(),
      },
      files: {},
    }, 'scratch.sketch.json');

    expect(document).toMatchObject({
      type: 'excalidraw',
      version: 2,
      source: 'https://open-design.ai/sketch',
      elements: [{ id: 'box', type: 'rectangle', isDeleted: false }],
      appState: {
        name: 'scratch.sketch.json',
        viewBackgroundColor: '#ffffff',
      },
      files: {},
    });
    expect(document).not.toHaveProperty('libraryItems');
    expect(document.appState).not.toHaveProperty('openMenu');
    expect(document.appState).not.toHaveProperty('collaborators');
  });
});
