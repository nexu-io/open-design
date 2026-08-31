// @vitest-environment node

import { JSDOM, type DOMWindow } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

function extractSelectionBridge(srcdoc: string): string {
  const match = srcdoc.match(/<script data-od-selection-bridge>([\s\S]*?)<\/script>/);
  if (!match?.[1]) throw new Error('selection bridge script not found');
  return match[1];
}

function setupBridge() {
  const body = [
    '<button id="surface">Surface</button>',
    '<input id="input">',
    '<textarea id="textarea"></textarea>',
    '<div id="editable" contenteditable="true">Editable</div>',
  ].join('');
  const srcdoc = buildSrcdoc(`<!doctype html><html><body>${body}</body></html>`, {
    commentBridge: true,
  });
  const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const parentPostMessage = vi.fn();
  Object.defineProperty(dom.window, 'parent', {
    configurable: true,
    value: { postMessage: parentPostMessage },
  });
  new dom.window.Function(extractSelectionBridge(srcdoc)).call(dom.window);
  return { dom, win: dom.window, parentPostMessage };
}

function enableShortcut(win: DOMWindow): void {
  win.dispatchEvent(new win.MessageEvent('message', {
    data: { type: 'od:comment-shortcut-state', enabled: true },
  }));
}

function altC(
  win: DOMWindow,
  target: EventTarget = win,
  init: KeyboardEventInit = {},
) {
  const event = new win.KeyboardEvent('keydown', {
    altKey: true,
    bubbles: true,
    cancelable: true,
    code: 'KeyC',
    key: 'c',
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('srcDoc comment shortcut bridge', () => {
  it('forwards one semantic intent only while the host enables the shortcut', () => {
    const { dom, win, parentPostMessage } = setupBridge();

    const disabled = altC(win);
    expect(disabled.defaultPrevented).toBe(false);
    expect(parentPostMessage).not.toHaveBeenCalledWith(
      { type: 'od:comment-shortcut' },
      '*',
    );

    enableShortcut(win);
    parentPostMessage.mockClear();
    const enabled = altC(win);

    expect(enabled.defaultPrevented).toBe(true);
    expect(parentPostMessage).toHaveBeenCalledTimes(1);
    expect(parentPostMessage).toHaveBeenCalledWith({ type: 'od:comment-shortcut' }, '*');
    dom.window.close();
  });

  it('does not steal the shortcut from editable, modal, modified, composing, repeated, or consumed events', () => {
    const { dom, win, parentPostMessage } = setupBridge();
    enableShortcut(win);
    parentPostMessage.mockClear();

    for (const id of ['input', 'textarea', 'editable']) {
      const target = win.document.getElementById(id);
      if (!target) throw new Error(`missing fixture target ${id}`);
      (target as HTMLElement).focus();
      expect(altC(win, target).defaultPrevented).toBe(false);
    }

    const surface = win.document.getElementById('surface');
    if (!surface) throw new Error('missing surface fixture');
    surface.focus();
    const ignored = [
      altC(win, surface, { ctrlKey: true }),
      altC(win, surface, { metaKey: true }),
      altC(win, surface, { shiftKey: true }),
      altC(win, surface, { isComposing: true }),
      altC(win, surface, { repeat: true }),
      altC(win, surface, { altKey: false }),
    ];
    const consumed = new win.KeyboardEvent('keydown', {
      altKey: true,
      bubbles: true,
      cancelable: true,
      code: 'KeyC',
      key: 'c',
    });
    consumed.preventDefault();
    surface.dispatchEvent(consumed);
    ignored.push(consumed);

    const modal = win.document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    win.document.body.appendChild(modal);
    ignored.push(altC(win, surface));

    expect(ignored.every((event) => event.defaultPrevented === (event === consumed))).toBe(true);
    expect(parentPostMessage).not.toHaveBeenCalledWith(
      { type: 'od:comment-shortcut' },
      '*',
    );
    dom.window.close();
  });
});
