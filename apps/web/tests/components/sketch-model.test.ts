import { describe, expect, it } from 'vitest';
import { computeSketchBounds, parseSketchDocument } from '../../src/components/sketch-model';

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
});
