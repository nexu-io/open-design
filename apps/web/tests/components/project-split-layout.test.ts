// @vitest-environment jsdom

// OPEND-3207 · one resolver for the project split's first-paint chat width.
// ProjectView and the creation frame that precedes it both ask this module,
// so the column cannot move when one hands over to the other.

import { afterEach, describe, expect, it } from 'vitest';

import {
  CHAT_PANEL_WIDTH_STORAGE_KEY,
  DEFAULT_CHAT_PANEL_WIDTH,
  FALLBACK_MAX_CHAT_PANEL_WIDTH,
  MIN_CHAT_PANEL_WIDTH,
  readSavedChatPanelWidth,
  resolveProjectSplitLayout,
  writeProjectSplitLayout,
} from '../../src/components/project-split-layout';

afterEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = '';
});

describe('resolveProjectSplitLayout', () => {
  it('takes the equal split when nothing was saved', () => {
    const layout = resolveProjectSplitLayout(1280, { width: DEFAULT_CHAT_PANEL_WIDTH, customized: false });
    expect(layout.chatPanelWidth).toBe(638);
    expect(layout.workspacePanelTrack).toBe('minmax(400px, 1fr)');
  });

  it('keeps the saved width at every container size', () => {
    const saved = { width: 380, customized: true };
    expect(resolveProjectSplitLayout(1280, saved).chatPanelWidth).toBe(380);
    expect(resolveProjectSplitLayout(1900, saved).chatPanelWidth).toBe(380);
  });

  it('clamps a saved width the container cannot fit', () => {
    const layout = resolveProjectSplitLayout(900, { width: 700, customized: true });
    // 900 - 4 handle - 400 workspace floor = 496.
    expect(layout.chatPanelWidth).toBe(496);
    expect(layout.chatPanelMaxWidth).toBe(496);
  });

  it('falls back to the stylesheet default before the container is measured', () => {
    const layout = resolveProjectSplitLayout(0, { width: DEFAULT_CHAT_PANEL_WIDTH, customized: false });
    expect(layout.chatPanelWidth).toBe(DEFAULT_CHAT_PANEL_WIDTH);
    expect(layout.chatPanelMaxWidth).toBe(FALLBACK_MAX_CHAT_PANEL_WIDTH);
  });
});

describe('readSavedChatPanelWidth', () => {
  it('reports a saved width as customized and floors it at the minimum', () => {
    window.localStorage.setItem(CHAT_PANEL_WIDTH_STORAGE_KEY, '200');
    expect(readSavedChatPanelWidth()).toEqual({ width: MIN_CHAT_PANEL_WIDTH, customized: true });
  });

  it('reports the default as not customized when nothing was saved', () => {
    expect(readSavedChatPanelWidth()).toEqual({ width: DEFAULT_CHAT_PANEL_WIDTH, customized: false });
  });
});

describe('writeProjectSplitLayout', () => {
  it('writes the three grid properties and leaves no settling class behind', () => {
    const split = document.createElement('div');
    split.className = 'split';
    document.body.append(split);
    writeProjectSplitLayout(split, 512, 'minmax(400px, 1fr)', { animate: false });
    expect(split.style.getPropertyValue('--project-chat-panel-width')).toBe('512px');
    expect(split.style.getPropertyValue('--project-chat-handle-width')).toBe('4px');
    expect(split.style.getPropertyValue('--project-workspace-panel-track')).toBe('minmax(400px, 1fr)');
    expect(split.classList.contains('split-settling')).toBe(false);
  });
});
