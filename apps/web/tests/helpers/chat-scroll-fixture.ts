// Shared jsdom fixture for the chat-log scroll specs (freeze probe, takeover,
// self-heal). jsdom performs no layout — `scrollHeight` / `clientHeight` are 0
// for every element it builds — so geometry is installed by hand, and every
// write the code under test makes to `scrollTop` is recorded.

/** Scroll geometry jsdom refuses to compute, installed by hand. */
export interface GeometryHandle {
  setTop(value: number): void;
  setContent(value: number): void;
  setViewport(value: number): void;
  top(): number;
  /** Every write the code under test made to `scrollTop`. */
  writes: number[];
}

export function stubGeometry(
  el: HTMLElement,
  initial: { scrollTop: number; scrollHeight: number; clientHeight: number },
): GeometryHandle {
  let top = initial.scrollTop;
  let content = initial.scrollHeight;
  let viewport = initial.clientHeight;
  const writes: number[] = [];
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      writes.push(value);
      // Browser semantics: a write is clamped to the layout extent.
      top = Math.min(Math.max(0, value), Math.max(0, content - viewport));
    },
  });
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => content });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => viewport });
  return {
    setTop: (value) => {
      top = value;
    },
    setContent: (value) => {
      content = value;
    },
    setViewport: (value) => {
      viewport = value;
    },
    top: () => top,
    writes,
  };
}

export function buildChatLog(): HTMLElement {
  const log = document.createElement('div');
  log.className = 'chat-log';
  log.setAttribute('data-testid', 'chat-log');
  document.body.appendChild(log);
  return log;
}

/** The measured failing surface: 1764px of real travel, wheel stuck at 91. */
export const FROZEN = { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 } as const;
export const LAYOUT_MAX = FROZEN.scrollHeight - FROZEN.clientHeight;

export function scrolled(target: HTMLElement): void {
  target.dispatchEvent(new Event('scroll', { bubbles: false }));
}

/** Dispatch one wheel notch and hand back the event, so the spec can ask whether it was consumed. */
export function wheelEvent(
  target: HTMLElement,
  deltaY: number,
  init: { deltaMode?: number; ctrlKey?: boolean } = {},
): WheelEvent {
  const event = new WheelEvent('wheel', {
    deltaY,
    deltaMode: init.deltaMode ?? 0,
    ctrlKey: init.ctrlKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

/** Dispatch one key press on `target` (default: the focused element or body). */
export function keyEvent(
  key: string,
  init: { target?: EventTarget; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    shiftKey: init.shiftKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    altKey: init.altKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  (init.target ?? document.activeElement ?? document.body).dispatchEvent(event);
  return event;
}

export function decodeSafetyEvents(
  fetchMock: { mock: { calls: unknown[][] } },
): Array<{ event: string; properties: Record<string, unknown> }> {
  const decoded: Array<{ event: string; properties: Record<string, unknown> }> = [];
  for (const call of fetchMock.mock.calls) {
    const init = call[1] as RequestInit | undefined;
    if (typeof init?.body !== 'string') continue;
    try {
      decoded.push(
        JSON.parse(init.body) as { event: string; properties: Record<string, unknown> },
      );
    } catch {
      // not a telemetry beacon
    }
  }
  return decoded;
}
