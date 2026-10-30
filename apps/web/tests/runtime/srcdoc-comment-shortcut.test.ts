// @vitest-environment node
import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

it('forwards enabled comment shortcuts, protects editing, and applies the supplied comment cursor', () => {
  const srcdoc = buildSrcdoc('<body></body>', { commentBridge: true, inspectBridge: true });
  const dom = new JSDOM('<body><input><textarea></textarea><select></select><div contenteditable="true"><span>Editing</span></div><div role="menu"><button>Menu</button></div><div role="dialog"><button>Dialog</button></div><dialog open><button>Native dialog</button></dialog><div popover><button>Popover</button></div><button id="handled">Handled</button></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
  try {
    const win = dom.window;
    const postMessage = vi.fn();
    Object.defineProperty(win, 'parent', { value: { postMessage }, configurable: true });
    const bridge = srcdoc.match(/<script data-od-selection-bridge>([\s\S]*?)<\/script>/)?.[1];
    if (!bridge) throw new Error('Missing selection bridge');
    new win.Function(bridge).call(win);
    const mode = (data: Record<string, unknown>) => win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:comment-mode', ...data } }));
    const key = (init: KeyboardEventInit = {}, target = win.document.body) => {
      const event = new win.KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(key()).toBe(false);
    mode({ enabled: false, observe: true, shortcutEnabled: true, cursor: 'url("comment.svg") 8 8, crosshair' });
    postMessage.mockClear();
    expect(key()).toBe(true);
    expect(key({ key: 'C', shiftKey: true })).toBe(true);
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true }, { isComposing: true }, { keyCode: 229 }, { key: 'x' }]) expect(key(init)).toBe(false);
    for (const selector of ['input', 'textarea', 'select', '[contenteditable] span']) expect(key({}, win.document.querySelector(selector) as HTMLElement)).toBe(false);
    for (const selector of ['[role=menu] button', '[role=dialog] button', 'dialog button', '[popover] button']) expect(key({}, win.document.querySelector(selector) as HTMLElement)).toBe(false);
    const handled = win.document.getElementById('handled')!;
    handled.addEventListener('keydown', event => event.preventDefault());
    expect(key({}, handled)).toBe(true);
    expect(postMessage.mock.calls.map(call => call[0])).toEqual([{ type: 'od:comment-shortcut' }, { type: 'od:comment-shortcut' }]);
    expect(win.document.documentElement.style.getPropertyValue('--od-comment-cursor')).toBe('url("comment.svg") 8 8, crosshair');
    expect(srcdoc).toContain('cursor: var(--od-comment-cursor, crosshair) !important');
    expect(srcdoc).toContain('html[data-od-inspect-mode] body * { cursor: crosshair !important; }');
    expect(srcdoc).toContain('html[data-od-comment-mode][data-od-comment-mode-kind="pod"] body * { cursor: cell !important; }');
    mode({ enabled: true, shortcutEnabled: false });
    expect(key()).toBe(false);
    expect(win.document.documentElement.style.getPropertyValue('--od-comment-cursor')).toBe('');
  } finally { dom.window.close(); }
});
