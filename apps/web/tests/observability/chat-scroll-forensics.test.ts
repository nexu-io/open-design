// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ASSIGNMENT_PROBE_WARNING,
  CHAT_SCROLL_FORENSICS_PATH,
  RENDERER_CAPTURE_GLOBAL,
  RETENTION_TTL_MS,
  __resetChatScrollForensicsForTest,
  captureAndUploadChatScrollForensics,
  captureChatScrollForensicsForExport,
  collectChatScrollForensics,
  handleFreezeSignalForRetention,
  installChatScrollForensicsRetention,
  readRetainedChatScrollForensics,
  retainChatScrollForensics,
} from '../../src/observability/chat-scroll-forensics';
import { chatScrollFreezeListenerCount } from '../../src/observability/chat-scroll-freeze';

/**
 * Why this file exists
 * --------------------
 * The chat log occasionally stops scrolling and we cannot reproduce it.
 * Colleagues can, and they are willing to send data — but the only thing that
 * knows anything (`window.__chatScrollFreeze`) is a DevTools handle that dies
 * with the window.
 *
 * So there is now a capture that turns the live renderer into a file which
 * rides inside the diagnostics zip they already know how to produce. These
 * specs pin the three things that decide whether that file is worth anything:
 *
 *   1. every field a reader would need is actually in it, item by item;
 *   2. the ONE step that writes to the page (`scrollTop = layoutMax`) runs
 *      after everything that observes it, and puts the user back where they
 *      were;
 *   3. when the probe is missing or never attached, the capture SAYS SO in
 *      words instead of throwing or handing back an empty object — that
 *      colleague's file is evidence too.
 */

const HANDLE_KEY = '__chatScrollFreeze';

interface ProbeGlobals {
  __chatScrollFreeze?: unknown;
}

function probeGlobals(): ProbeGlobals {
  return globalThis as unknown as ProbeGlobals;
}

function fakeSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    at: 1234,
    installed: true,
    attached: true,
    reportedThisSession: 0,
    wheelDiscoveryArmed: false,
    thresholds: { minUnreachablePx: 8 },
    surface: { probeId: 'abcd1234', ledger: { first: null } },
    blockers: [],
    verdict: 'ready',
    snapBack: null,
    writeTrace: { armed: false, flagSet: false, recorded: 0, dropped: 0, capacity: 200 },
    ...overrides,
  };
}

function installFakeProbe(snapshot: Record<string, unknown> = fakeSnapshot()): void {
  probeGlobals()[HANDLE_KEY] = {
    version: 1,
    snapshot: () => snapshot,
    why: () => 'ready',
    writes: {
      enabled: () => false,
      enable: () => false,
      disable: () => undefined,
      list: () => [],
      clear: () => undefined,
    },
  };
}

interface ScrollerStub {
  element: HTMLElement;
  writes: number[];
  current: () => number;
}

interface ScrollerOptions {
  scrollTop?: number;
  scrollHeight?: number;
  clientHeight?: number;
  /** Return the value the element is allowed to settle on. */
  clampTo?: (requested: number) => number;
  /** Runs on every scrollTop write, AFTER the value has settled. */
  onWrite?: (requested: number) => void;
  childCount?: number;
  testId?: string;
}

function mountChatLog(options: ScrollerOptions = {}): ScrollerStub {
  const wrap = document.createElement('div');
  wrap.className = 'chat-log-wrap';
  const viewport = document.createElement('div');
  viewport.className = 'chat-log-viewport';
  const log = document.createElement('div');
  log.className = 'chat-log is-scrollable';
  if (options.testId !== '') log.setAttribute('data-testid', options.testId ?? 'chat-log');
  for (let i = 0; i < (options.childCount ?? 3); i += 1) {
    const row = document.createElement('div');
    row.className = 'msg';
    row.setAttribute('data-testid', 'chat-message');
    row.textContent = `message ${i}`;
    log.appendChild(row);
  }
  viewport.appendChild(log);
  wrap.appendChild(viewport);
  document.body.appendChild(wrap);

  let value = options.scrollTop ?? 100;
  const writes: number[] = [];
  Object.defineProperty(log, 'scrollTop', {
    configurable: true,
    get: () => value,
    set: (next: number) => {
      writes.push(next);
      value = options.clampTo ? options.clampTo(next) : next;
      // After the value settles, so a throwing hook leaves the element MOVED —
      // which is the only way the restore path can be observed doing work.
      options.onWrite?.(next);
    },
  });
  Object.defineProperty(log, 'scrollHeight', {
    configurable: true,
    get: () => options.scrollHeight ?? 5000,
  });
  Object.defineProperty(log, 'clientHeight', {
    configurable: true,
    get: () => options.clientHeight ?? 800,
  });
  return { element: log, writes, current: () => value };
}

beforeEach(() => {
  __resetChatScrollForensicsForTest();
  document.body.innerHTML = '';
  delete probeGlobals()[HANDLE_KEY];
});

afterEach(() => {
  __resetChatScrollForensicsForTest();
  document.body.innerHTML = '';
  delete probeGlobals()[HANDLE_KEY];
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('the capture carries every field a reader needs', () => {
  it('includes the probe snapshot verbatim', () => {
    installFakeProbe(fakeSnapshot({ verdict: 'blocked_by=inner_scroller' }));
    mountChatLog();

    const capture = collectChatScrollForensics();

    expect(capture.probe.available).toBe(true);
    if (!capture.probe.available) throw new Error('probe should be available');
    expect(capture.probe.attached).toBe(true);
    expect(capture.probe.snapshot).toMatchObject({
      verdict: 'blocked_by=inner_scroller',
      surface: { probeId: 'abcd1234' },
    });
  });

  it('describes the ancestor chain and every direct child with the compositing properties', () => {
    mountChatLog({ childCount: 4 });

    const capture = collectChatScrollForensics();

    const roles = capture.composition.map((node) => node.role);
    expect(roles).toContain('ancestor');
    expect(roles.filter((role) => role === 'scroller')).toHaveLength(1);
    expect(roles.filter((role) => role === 'child')).toHaveLength(4);

    // Ancestors are listed outermost-first and reach the chat-log wrapper.
    const ancestorClasses = capture.composition
      .filter((node) => node.role === 'ancestor')
      .map((node) => node.className);
    expect(ancestorClasses).toContain('chat-log-viewport');
    expect(ancestorClasses).toContain('chat-log-wrap');

    const scroller = capture.composition.find((node) => node.role === 'scroller');
    expect(scroller).toBeDefined();
    for (const property of [
      'display',
      'position',
      'overflow-x',
      'overflow-y',
      'transform',
      'filter',
      'backdrop-filter',
      'contain',
      'will-change',
      'content-visibility',
    ]) {
      expect(Object.keys(scroller!.style)).toContain(property);
    }
    expect(scroller!.tag).toBe('div');
    expect(scroller!.className).toContain('chat-log');
    expect(scroller!.testId).toBe('chat-log');
    expect(typeof scroller!.offsetTop).toBe('number');
    expect(typeof scroller!.offsetHeight).toBe('number');
    // Element.getAnimations is absent in jsdom: absent, not fabricated as zero.
    expect(scroller!.runningAnimations).toBeNull();

    const firstChild = capture.composition.find((node) => node.role === 'child');
    expect(firstChild?.childIndex).toBe(0);
    expect(firstChild?.openTag).toContain('class="msg"');
  });

  it('carries the chat log outerHTML in full', () => {
    mountChatLog({ childCount: 2 });

    const capture = collectChatScrollForensics();

    expect(capture.dom.captured).toBe(true);
    expect(capture.dom.truncated).toBe(false);
    expect(capture.dom.matchedSelector).toBe('[data-testid="chat-log"]');
    expect(capture.dom.outerHTML).toContain('data-testid="chat-log"');
    expect(capture.dom.outerHTML).toContain('message 0');
    expect(capture.dom.outerHTML).toContain('message 1');
    expect(capture.dom.byteLength).toBe(capture.dom.outerHTML?.length);
  });

  it('carries the geometry triple, layoutMax and the unreachable gap', () => {
    mountChatLog({ scrollTop: 120, scrollHeight: 5000, clientHeight: 800 });

    const capture = collectChatScrollForensics();

    expect(capture.scroller.found).toBe(true);
    if (!capture.scroller.found) throw new Error('scroller should be found');
    expect(capture.scroller.geometry).toMatchObject({
      scrollTop: 120,
      scrollHeight: 5000,
      clientHeight: 800,
      layoutMax: 4200,
      unreachablePx: 4080,
      pastFreezeThreshold: true,
    });
    expect(capture.scroller.messageRowCount).toBe(3);
  });

  it('lists every running animation from document.getAnimations()', () => {
    mountChatLog();
    const target = document.createElement('span');
    const animation = {
      id: 'pulse',
      playState: 'running',
      currentTime: 42,
      startTime: 0,
      effect: {
        getTiming: () => ({ duration: 400, iterations: 2 }),
        target,
        animationName: 'od-pulse',
      },
    };
    Object.defineProperty(document, 'getAnimations', {
      configurable: true,
      value: () => [animation],
    });

    const capture = collectChatScrollForensics();

    expect(capture.animations.supported).toBe(true);
    expect(capture.animations.total).toBe(1);
    expect(capture.animations.entries[0]).toMatchObject({
      id: 'pulse',
      playState: 'running',
      currentTimeMs: 42,
      name: 'od-pulse',
      durationMs: 400,
      iterations: 2,
    });
    expect(capture.animations.entries[0]?.target).toContain('span');

    delete (document as unknown as Record<string, unknown>)['getAnimations'];
  });

  it('says so when the engine has no getAnimations rather than reporting zero animations', () => {
    mountChatLog();

    const capture = collectChatScrollForensics();

    expect(capture.animations.supported).toBe(false);
    expect(capture.animations.note).toMatch(/getAnimations/);
    expect(capture.animations.entries).toEqual([]);
  });

  it('records the renderer identity', () => {
    mountChatLog();

    const capture = collectChatScrollForensics();

    expect(capture.runtime.userAgent).toEqual(expect.any(String));
    expect(capture.runtime.window).toMatchObject({
      innerWidth: expect.any(Number),
      innerHeight: expect.any(Number),
    });
    expect(capture.runtime.devicePixelRatio).toEqual(expect.any(Number));
    expect(capture.runtime.zoomInputs).toMatchObject({
      devicePixelRatio: expect.any(Number),
    });
    expect(capture.runtime.packaged).toBe(false);
    expect(capture.runtime.protocol).toBe('http:');
    // No build sha exists in apps/web. The field is present and explained
    // rather than silently missing.
    expect(capture.runtime.commit).toBeNull();
    expect(capture.runtime.commitNote).toMatch(/manifest\.json/);
  });

  it('reports the scrollTop write trace, and says it was off when it was off', () => {
    mountChatLog();

    const capture = collectChatScrollForensics();

    expect(capture.writes.armed).toBe(false);
    expect(capture.writes.count).toBe(0);
    expect(capture.writes.note).toMatch(/OFF/);
    expect(Array.isArray(capture.writes.records)).toBe(true);
  });
});

describe('the assignment probe — the one measurement that decides the case', () => {
  it('assigns layoutMax, reads it back, and calls it the compositor case when it lands', () => {
    mountChatLog({ scrollTop: 100, scrollHeight: 5000, clientHeight: 800 });

    const capture = collectChatScrollForensics();

    expect(capture.assignment.performed).toBe(true);
    if (!capture.assignment.performed) throw new Error('probe should have run');
    expect(capture.assignment.before).toBe(100);
    expect(capture.assignment.requested).toBe(4200);
    expect(capture.assignment.readBack).toBe(4200);
    expect(capture.assignment.landed).toBe(true);
    expect(capture.assignment.verdict).toBe('assignment_reached_layout_max');
    expect(capture.assignment.movedUserView).toBe(true);
  });

  it('calls it the clamped case when the scroller refuses the position', () => {
    mountChatLog({
      scrollTop: 100,
      scrollHeight: 5000,
      clientHeight: 800,
      clampTo: (requested) => Math.min(requested, 100),
    });

    const capture = collectChatScrollForensics();

    if (!capture.assignment.performed) throw new Error('probe should have run');
    expect(capture.assignment.requested).toBe(4200);
    expect(capture.assignment.readBack).toBe(100);
    expect(capture.assignment.landed).toBe(false);
    expect(capture.assignment.verdict).toBe('assignment_clamped');
  });

  it('calls it no_room when layout offers nothing below the current position', () => {
    mountChatLog({ scrollTop: 0, scrollHeight: 800, clientHeight: 800 });

    const capture = collectChatScrollForensics();

    if (!capture.assignment.performed) throw new Error('probe should have run');
    expect(capture.assignment.requested).toBe(0);
    expect(capture.assignment.verdict).toBe('no_room');
  });

  it('puts the user back where they were', () => {
    const stub = mountChatLog({ scrollTop: 137, scrollHeight: 5000, clientHeight: 800 });

    const capture = collectChatScrollForensics();

    expect(stub.current()).toBe(137);
    expect(stub.element.scrollTop).toBe(137);
    if (!capture.assignment.performed) throw new Error('probe should have run');
    expect(capture.assignment.restoredTo).toBe(137);
    expect(capture.assignment.restoredExactly).toBe(true);
    // The write actually happened — restoration is a restore, not a skip.
    expect(stub.writes).toContain(4200);
  });

  it('restores the position even when the read-back path throws', () => {
    let calls = 0;
    const stub = mountChatLog({
      scrollTop: 77,
      scrollHeight: 5000,
      clientHeight: 800,
      onWrite: () => {
        calls += 1;
        // Blow up AFTER the first write has moved the element, so the
        // finally-clause restore is the only thing that can put the user back.
        if (calls === 1) throw new Error('compositor exploded');
      },
    });

    const capture = collectChatScrollForensics();

    expect(capture.assignment.performed).toBe(false);
    if (capture.assignment.performed) throw new Error('probe should have failed');
    expect(capture.assignment.reason).toBe('threw');
    expect(capture.assignment.detail).toContain('compositor exploded');
    // The element really was moved, and really was put back.
    expect(stub.writes).toEqual([4200, 77]);
    expect(stub.current()).toBe(77);
  });

  it('runs after the DOM has already been captured, so the file shows the untouched page', () => {
    // The setter mutates the DOM. If the capture serialized the chat log AFTER
    // writing scrollTop, the marker would be in the file — which would mean the
    // evidence describes a page the probe had already disturbed.
    const stub = mountChatLog({
      scrollTop: 100,
      scrollHeight: 5000,
      clientHeight: 800,
      onWrite: () => {
        const marker = document.createElement('div');
        marker.className = 'written-after-capture';
        stub.element.appendChild(marker);
      },
    });

    const capture = collectChatScrollForensics();

    expect(capture.dom.outerHTML).not.toContain('written-after-capture');
    expect(stub.element.querySelector('.written-after-capture')).not.toBeNull();
    // …and the same ordering is legible from the payload itself.
    expect(capture.timeline.assignment).toBeGreaterThanOrEqual(capture.timeline.dom);
    expect(capture.timeline.assignment).toBeGreaterThanOrEqual(capture.timeline.composition);
  });

  it('warns in the payload that the view was moved on purpose', () => {
    mountChatLog();

    const capture = collectChatScrollForensics();

    expect(capture.warnings).toContain(ASSIGNMENT_PROBE_WARNING);
  });

  it('says why the decisive measurement is missing when there is no chat log', () => {
    const capture = collectChatScrollForensics();

    expect(capture.assignment.performed).toBe(false);
    if (capture.assignment.performed) throw new Error('probe should not have run');
    expect(capture.assignment.reason).toBe('no_scroller');
    expect(capture.assignment.note).toMatch(/decisive measurement is missing/);
  });
});

describe('a capture taken without the probe is still evidence', () => {
  it('explains that the handle was never published instead of throwing', () => {
    mountChatLog();

    const capture = collectChatScrollForensics();

    expect(capture.probe.available).toBe(false);
    if (capture.probe.available) throw new Error('probe should be unavailable');
    expect(capture.probe.reason).toBe('handle_missing');
    expect(capture.probe.note).toMatch(/did NOT publish its runtime handle/);
    expect(capture.warnings).toContain(capture.probe.note);
    // …and the rest of the scene is still there.
    expect(capture.dom.captured).toBe(true);
    expect(capture.scroller.found).toBe(true);
  });

  it('explains that the probe never attached, rather than shipping an empty ledger silently', () => {
    installFakeProbe(fakeSnapshot({ attached: false, surface: null }));
    mountChatLog();

    const capture = collectChatScrollForensics();

    expect(capture.probe.available).toBe(true);
    if (!capture.probe.available) throw new Error('probe should be available');
    expect(capture.probe.attached).toBe(false);
    expect(capture.probe.note).toMatch(/has NOT attached to a chat log/);
    expect(capture.warnings).toContain(capture.probe.note);
  });

  it('reports a throwing handle with the error, and keeps collecting', () => {
    probeGlobals()[HANDLE_KEY] = {
      version: 1,
      snapshot: () => {
        throw new TypeError('snapshot blew up');
      },
    };
    mountChatLog();

    const capture = collectChatScrollForensics();

    expect(capture.probe.available).toBe(false);
    if (capture.probe.available) throw new Error('probe should be unavailable');
    expect(capture.probe.reason).toBe('handle_threw');
    expect(capture.probe.detail).toContain('snapshot blew up');
    expect(capture.dom.captured).toBe(true);
  });

  it('explains an absent chat log rather than returning an empty object', () => {
    installFakeProbe();

    const capture = collectChatScrollForensics();

    expect(capture.scroller.found).toBe(false);
    if (capture.scroller.found) throw new Error('scroller should be missing');
    expect(capture.scroller.selectorsTried).toEqual(['[data-testid="chat-log"]', '.chat-log']);
    expect(capture.scroller.note).toMatch(/No chat log was in the DOM/);
    expect(capture.dom.captured).toBe(false);
    expect(capture.dom.reason).toBe('chat_log_not_found');
    expect(capture.composition).toEqual([]);
    // The probe half is still fully populated, which is the whole point.
    expect(capture.probe.available).toBe(true);
  });
});

describe('freeze-time retention survives the walk to the export button', () => {
  it('subscribes to the probe when installed and unsubscribes on teardown', () => {
    const before = chatScrollFreezeListenerCount();
    const teardown = installChatScrollForensicsRetention();
    expect(chatScrollFreezeListenerCount()).toBe(before + 1);
    teardown();
    expect(chatScrollFreezeListenerCount()).toBe(before);
  });

  it('publishes the capture hook the desktop Help menu reaches back in through', async () => {
    installFakeProbe();
    mountChatLog();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const teardown = installChatScrollForensicsRetention();
    const hook = (globalThis as unknown as Record<string, unknown>)[RENDERER_CAPTURE_GLOBAL];
    expect(typeof hook).toBe('function');

    await expect((hook as () => Promise<boolean>)()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      CHAT_SCROLL_FORENSICS_PATH,
      expect.objectContaining({ method: 'POST' }),
    );

    teardown();
    expect((globalThis as unknown as Record<string, unknown>)[RENDERER_CAPTURE_GLOBAL]).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('banks a full capture on a frozen verdict', () => {
    installFakeProbe();
    const stub = mountChatLog({ scrollTop: 55 });

    handleFreezeSignalForRetention({
      kind: 'frozen',
      element: stub.element,
      probeId: 'p1',
      trigger: 'wheel_stall',
      geometry: { scrollTop: 55, scrollHeight: 5000, clientHeight: 800 },
    });

    const held = readRetainedChatScrollForensics();
    expect(held).not.toBeNull();
    expect(held?.forensics.dom.captured).toBe(true);
    expect(held?.forensics.scroller.found).toBe(true);
    // Retention must not leave the colleague scrolled somewhere else either.
    expect(stub.current()).toBe(55);
  });

  it('ignores surface_released', () => {
    installFakeProbe();
    const stub = mountChatLog();

    handleFreezeSignalForRetention({
      kind: 'surface_released',
      element: stub.element,
      probeId: 'p1',
    });

    expect(readRetainedChatScrollForensics()).toBeNull();
  });

  it('keeps the first freeze, not the latest', () => {
    installFakeProbe();
    const stub = mountChatLog();
    const first = collectChatScrollForensics();
    retainChatScrollForensics(first);
    const second = collectChatScrollForensics();
    retainChatScrollForensics(second);

    // Identity, not timestamp: two captures in the same millisecond would make
    // an ISO-string comparison pass without proving anything.
    expect(readRetainedChatScrollForensics()?.forensics).toBe(first);
    expect(readRetainedChatScrollForensics()?.forensics).not.toBe(second);
    expect(stub.current()).toBe(100);
  });

  it('drops a capture older than the retention window', () => {
    vi.useFakeTimers();
    installFakeProbe();
    mountChatLog();
    retainChatScrollForensics(collectChatScrollForensics());
    expect(readRetainedChatScrollForensics()).not.toBeNull();

    vi.advanceTimersByTime(RETENTION_TTL_MS + 1);

    expect(readRetainedChatScrollForensics()).toBeNull();
  });
});

describe('the envelope handed to the daemon', () => {
  it('carries both a live capture and the retained freeze-time one', () => {
    installFakeProbe();
    mountChatLog();
    retainChatScrollForensics(collectChatScrollForensics());

    const envelope = captureChatScrollForensicsForExport();

    expect(envelope.live.available).toBe(true);
    expect(envelope.live.forensics?.dom.captured).toBe(true);
    expect(envelope.retained.available).toBe(true);
    expect(envelope.retained.forensics?.dom.captured).toBe(true);
    expect(envelope.retained.ageMs).toEqual(expect.any(Number));
  });

  it('states why the live slot is empty when the chat log has been navigated away from', () => {
    installFakeProbe();
    mountChatLog();
    retainChatScrollForensics(collectChatScrollForensics());
    document.body.innerHTML = '';

    const envelope = captureChatScrollForensicsForExport();

    expect(envelope.live.available).toBe(false);
    expect(envelope.live.reason).toMatch(/No chat log was in the DOM/);
    // …and the freeze-time capture still rides along, which is the reason the
    // retention exists at all.
    expect(envelope.retained.available).toBe(true);
  });

  it('states both slots are empty rather than handing back nothing', () => {
    const envelope = captureChatScrollForensicsForExport();

    expect(envelope.live.available).toBe(false);
    expect(envelope.live.reason).toEqual(expect.any(String));
    expect(envelope.retained.available).toBe(false);
    expect(envelope.retained.forensics).toBeNull();
    expect(envelope.note).toEqual(expect.any(String));
  });
});

describe('upload', () => {
  it('posts the envelope to the daemon', async () => {
    installFakeProbe();
    mountChatLog();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await expect(captureAndUploadChatScrollForensics()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(CHAT_SCROLL_FORENSICS_PATH);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as { live: { forensics: { dom: { outerHTML: string } } } };
    expect(body.live.forensics.dom.outerHTML).toContain('data-testid="chat-log"');

    vi.unstubAllGlobals();
  });

  it('never lets a failed upload become a thrown error', async () => {
    installFakeProbe();
    mountChatLog();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(captureAndUploadChatScrollForensics()).resolves.toBe(false);

    vi.unstubAllGlobals();
  });
});
