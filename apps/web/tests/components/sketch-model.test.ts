import { describe, expect, it } from 'vitest';
import {
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
});
