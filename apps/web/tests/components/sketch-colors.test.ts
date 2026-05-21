import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SKETCH_DARK_TOOL_COLOR,
  DEFAULT_SKETCH_LIGHT_TOOL_COLOR,
  resolveDefaultSketchToolColor,
} from '../../src/components/sketch-colors';

describe('sketch-colors', () => {
  it('uses a light tool color for an explicit dark theme', () => {
    expect(resolveDefaultSketchToolColor('dark', false)).toBe(DEFAULT_SKETCH_DARK_TOOL_COLOR);
  });

  it('keeps the existing dark tool color for an explicit light theme', () => {
    expect(resolveDefaultSketchToolColor('light', true)).toBe(DEFAULT_SKETCH_LIGHT_TOOL_COLOR);
  });

  it('follows the system dark preference when no explicit theme is set', () => {
    expect(resolveDefaultSketchToolColor(null, true)).toBe(DEFAULT_SKETCH_DARK_TOOL_COLOR);
  });

  it('keeps the light-mode default when system mode is not dark', () => {
    expect(resolveDefaultSketchToolColor(null, false)).toBe(DEFAULT_SKETCH_LIGHT_TOOL_COLOR);
  });
});
