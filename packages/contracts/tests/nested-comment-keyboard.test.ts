import { expect, it, vi } from 'vitest';
import { NESTED_COMMENT_HELPERS } from '../src/runtime/nested-comment-helpers';

it('forwards guarded Escape from existing and newly loaded nested documents without resolving anchors', () => {
  const postMessage = vi.fn();
  const observers: Array<{ callback: (records: Array<{ addedNodes: unknown[] }>) => void }> = [];
  class Observer {
    callback: (records: Array<{ addedNodes: unknown[] }>) => void;
    constructor(callback: (records: Array<{ addedNodes: unknown[] }>) => void) { this.callback = callback; observers.push(this); }
    observe() {}
  }
  class Doc extends EventTarget {
    frames: Frame[] = [];
    documentElement = {};
    querySelectorAll() { return this.frames; }
  }
  class Frame extends EventTarget { localName = 'iframe'; constructor(public contentDocument: Doc | null) { super(); } }
  const root = new Doc();
  const child = new Doc();
  const frame = new Frame(child);
  root.frames.push(frame);
  const init = new Function('document', 'window', 'MutationObserver', `var commentEnabled = true; ${NESTED_COMMENT_HELPERS}; return observeNestedCommentDocuments;`)(root, { parent: { postMessage } }, Observer);
  init();
  const key = (doc: Doc, options: Record<string, unknown> = {}) => {
    const event = new Event('keydown', { cancelable: true });
    Object.assign(event, { key: 'Escape', isComposing: false, repeat: false, ...options });
    doc.dispatchEvent(event);
  };
  key(child);
  expect(postMessage).toHaveBeenCalledTimes(1);
  key(child, { repeat: true });
  key(child, { isComposing: true });
  expect(postMessage).toHaveBeenCalledTimes(1);
  const loaded = new Doc();
  frame.contentDocument = loaded;
  frame.dispatchEvent(new Event('load'));
  key(loaded);
  expect(postMessage).toHaveBeenCalledTimes(2);
  const added = new Doc();
  const addedFrame = new Frame(added);
  root.frames.push(addedFrame);
  observers[0]!.callback([{ addedNodes: [addedFrame] }]);
  key(added);
  expect(postMessage).toHaveBeenCalledTimes(3);
  observers[0]!.callback([{ addedNodes: [{}] }]);
  expect(observers).toHaveLength(4);
});

it('keeps editable, menu, composition, repeat and handled key guards', () => {
  const postMessage = vi.fn();
  const forward = new Function('window', `var commentEnabled = true; ${NESTED_COMMENT_HELPERS}; return forwardCommentEscape;`)({ parent: { postMessage } });
  const event = { key: 'Escape', defaultPrevented: false, isComposing: false, repeat: false, target: { closest: () => null } };
  for (const changed of [
    { defaultPrevented: true }, { isComposing: true }, { repeat: true },
    { target: { closest: () => ({}) } }, { key: 'Enter' },
  ]) expect(forward({ ...event, ...changed })).toBe(false);
  expect(postMessage).not.toHaveBeenCalled();
  expect(forward(event)).toBe(true);
  expect(postMessage).toHaveBeenCalledWith({ type: 'od:comment-escape' }, '*');
});
