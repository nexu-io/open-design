import { describe, expect, it } from 'vitest';
import { PROJECT_CANVAS_TAB, isProjectCanvasTab } from '../../src/types';

describe('project canvas tab id', () => {
  it('exposes a fixed, non-empty tab id', () => {
    expect(typeof PROJECT_CANVAS_TAB).toBe('string');
    expect(PROJECT_CANVAS_TAB.length).toBeGreaterThan(0);
  });

  it('recognizes only the fixed canvas tab id', () => {
    expect(isProjectCanvasTab(PROJECT_CANVAS_TAB)).toBe(true);
    expect(isProjectCanvasTab('__design_files__')).toBe(false);
    expect(isProjectCanvasTab('__design_system__')).toBe(false);
    expect(isProjectCanvasTab('live:abc')).toBe(false);
    expect(isProjectCanvasTab('')).toBe(false);
  });

  it('does not collide with the dynamic tab-id conventions', () => {
    // 画布是单一固定面，不是 `prefix:<id>` 家族，别撞上 terminal/live/side-chat。
    expect(PROJECT_CANVAS_TAB.startsWith('live:')).toBe(false);
    expect(PROJECT_CANVAS_TAB.startsWith('chat:')).toBe(false);
    expect(PROJECT_CANVAS_TAB.startsWith('terminal:')).toBe(false);
  });
});
