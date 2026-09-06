import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type Ref,
  type SyntheticEvent,
} from 'react';

import type { PreviewPhaseReclaimReason } from '@open-design/contracts/runtime/preview-phase-events';
import { useAnalytics } from '../analytics/provider';
import {
  reportPreviewPoolReclaim,
  setPreviewPhaseSink,
} from '../runtime/preview-phase-reporter';

export const OD_PREVIEW_KEEP_ALIVE =
  typeof process === 'undefined' || process.env.OD_PREVIEW_KEEP_ALIVE !== '0';
export const DEFAULT_IFRAME_KEEP_ALIVE_POOL_SIZE = 5;

interface PoolEntry {
  key: string;
  projectId: string;
  fileName: string;
  element: HTMLIFrameElement;
  lastUsedAt: number;
  /** For `cache_reclaimed.retained_ms`: how long this context stayed alive. */
  createdAt: number;
  /** For `cache_reclaimed.reuse_count`: attaches served, including the first. */
  attachCount: number;
}

type AtomicMoveTarget = HTMLElement & {
  moveBefore?: (node: Node, child: Node | null) => void;
};

interface IframeKeepAlivePoolValue {
  attach(key: string, host: HTMLElement, create: () => HTMLIFrameElement): HTMLIFrameElement;
  release(key: string): void;
  evict(key: string): void;
  /** Remove the exact browsing context regardless of its logical cache key. */
  evictFrame(frame: HTMLIFrameElement): void;
  evictProject(projectId: string, options?: { includeActive?: boolean }): void;
  evictMatching(
    predicate: (entry: PoolEntry) => boolean,
    options?: { includeActive?: boolean },
  ): void;
  subscribe(key: string, listener: () => void): () => void;
  revision(key: string): number;
}

const IframeKeepAliveContext = createContext<IframeKeepAlivePoolValue | null>(null);
const subscribeToNoopStore = () => () => {};
const getClientSnapshot = () => false;
const getServerSnapshot = () => true;
const getServerRevision = () => 0;
const preservedOnLastAttach = new WeakSet<HTMLIFrameElement>();

export function iframeBrowsingContextWasPreservedOnLastAttach(
  frame: HTMLIFrameElement,
): boolean {
  return preservedOnLastAttach.has(frame);
}

function useIsServerRender() {
  return useSyncExternalStore(
    subscribeToNoopStore,
    getClientSnapshot,
    getServerSnapshot,
  );
}

export function previewIframeKeepAliveKey(projectId: string, fileName: string): string {
  return `${projectId}\0${fileName}`;
}

function blurIframeIfFocused(frame: HTMLIFrameElement): void {
  // moveBefore() deliberately preserves the browsing context, including its
  // focused descendant. Release focus before hiding the frame so subsequent
  // keyboard input cannot keep flowing to an off-screen authored document.
  if (document.activeElement === frame) frame.blur();
}

function parkIframeElement(frame: HTMLIFrameElement) {
  blurIframeIfFocused(frame);
  frame.onload = null;
  frame.removeAttribute('data-testid');
  frame.setAttribute('data-od-active', 'false');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('tabindex', '-1');
}

function moveIframeElement(target: HTMLElement, frame: HTMLIFrameElement): boolean {
  const moveBefore = (target as AtomicMoveTarget).moveBefore;
  const canMoveAtomically =
    frame.isConnected
    && target.isConnected
    && typeof moveBefore === 'function';
  if (!canMoveAtomically) {
    target.appendChild(frame);
    return false;
  }

  try {
    // appendChild() removes and reinserts an existing iframe, which resets its
    // browsing context. moveBefore() keeps the loaded document and JS runtime
    // alive while the pool moves it between its visible and parked hosts.
    moveBefore.call(target, frame, null);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotSupportedError') {
      target.appendChild(frame);
      return false;
    }
    throw error;
  }
}

function parseKeepAliveKey(key: string): { projectId: string; fileName: string } {
  const separator = key.indexOf('\0');
  if (separator < 0) return { projectId: key, fileName: '' };
  const fileAndRevision = key.slice(separator + 1);
  const revisionSeparator = fileAndRevision.indexOf('\0');
  return {
    projectId: key.slice(0, separator),
    // Terminal runtime keys append session/version identity after a second
    // NUL. Pool metadata must keep the logical file name so workspace LRU and
    // deletion cleanup can evict every revision of that file together.
    fileName: revisionSeparator < 0
      ? fileAndRevision
      : fileAndRevision.slice(0, revisionSeparator),
  };
}

export function IframeKeepAliveProvider({
  children,
  maxEntries = DEFAULT_IFRAME_KEEP_ALIVE_POOL_SIZE,
}: {
  children: ReactNode;
  maxEntries?: number;
}) {
  const parkedHostRef = useRef<HTMLDivElement | null>(null);
  const entriesRef = useRef<Map<string, PoolEntry>>(new Map());
  const activeKeysRef = useRef<Set<string>>(new Set());
  const maxEntriesRef = useRef(maxEntries);
  const keyRevisionsRef = useRef<Map<string, number>>(new Map());
  const keyListenersRef = useRef<Map<string, Set<() => void>>>(new Map());
  maxEntriesRef.current = maxEntries;

  const invalidateKey = (key: string) => {
    keyRevisionsRef.current.set(key, (keyRevisionsRef.current.get(key) ?? 0) + 1);
    for (const listener of keyListenersRef.current.get(key) ?? []) listener();
  };

  // Every path that destroys a browsing context funnels through here, so this
  // is the one place a reclaim can be observed without a second bookkeeping
  // surface drifting out of sync with the pool's own state. The reason is
  // passed in rather than inferred: only the caller knows whether this was the
  // LRU bound, a project switch, or a teardown.
  const removeEntry = (key: string, reason: PreviewPhaseReclaimReason): boolean => {
    const entry = entriesRef.current.get(key);
    if (!entry) return false;
    const wasActive = activeKeysRef.current.has(key);
    entry.element.remove();
    entriesRef.current.delete(key);
    activeKeysRef.current.delete(key);
    if (wasActive) invalidateKey(key);
    if (!keyListenersRef.current.has(key)) keyRevisionsRef.current.delete(key);
    // No-ops unless this key was registered as a preview document. The pool
    // stays generic; the preview mapping lives in the preview-owned module.
    reportPreviewPoolReclaim({
      cacheKey: key,
      reason,
      retainedMs: Math.max(0, Date.now() - entry.createdAt),
      reuseCount: Math.max(0, entry.attachCount - 1),
      retainedEntryCount: entriesRef.current.size,
      evictedEntryCount: 1,
    });
    return wasActive;
  };

  const enforceLimit = () => {
    const inactive = Array.from(entriesRef.current.values())
      .filter((entry) => !activeKeysRef.current.has(entry.key))
      .sort((a, b) => a.lastUsedAt - b.lastUsedAt);
    while (entriesRef.current.size > maxEntriesRef.current && inactive.length > 0) {
      const evicted = inactive.shift();
      if (!evicted) break;
      removeEntry(evicted.key, 'lru_budget');
    }
  };

  const pool = useMemo<IframeKeepAlivePoolValue>(() => ({
    attach(key, host, create) {
      let entry = entriesRef.current.get(key);
      if (!entry) {
        const { projectId, fileName } = parseKeepAliveKey(key);
        entry = {
          key,
          projectId,
          fileName,
          element: create(),
          lastUsedAt: Date.now(),
          createdAt: Date.now(),
          attachCount: 0,
        };
        entriesRef.current.set(key, entry);
      }
      entry.lastUsedAt = Date.now();
      entry.attachCount += 1;
      activeKeysRef.current.add(key);
      if (moveIframeElement(host, entry.element)) {
        preservedOnLastAttach.add(entry.element);
      } else {
        preservedOnLastAttach.delete(entry.element);
      }
      // A project switch can leave parked entries behind immediately before
      // the next project's viewers attach. Enforce the bound here as well as
      // on release so a newly attached frame cannot temporarily push the pool
      // above maxEntries while evictable inactive frames still exist.
      enforceLimit();
      return entry.element;
    },
    release(key) {
      const entry = entriesRef.current.get(key);
      const parkedHost = parkedHostRef.current;
      activeKeysRef.current.delete(key);
      if (entry && parkedHost) {
        parkIframeElement(entry.element);
        moveIframeElement(parkedHost, entry.element);
        preservedOnLastAttach.delete(entry.element);
      }
      enforceLimit();
    },
    evict(key) {
      removeEntry(key, 'version_superseded');
    },
    evictFrame(frame) {
      for (const entry of entriesRef.current.values()) {
        if (entry.element !== frame) continue;
        removeEntry(entry.key, 'version_superseded');
        return;
      }
    },
    evictProject(projectId, options) {
      for (const entry of Array.from(entriesRef.current.values())) {
        if (
          entry.projectId === projectId
          && (options?.includeActive || !activeKeysRef.current.has(entry.key))
        ) {
          removeEntry(entry.key, 'project_switch');
        }
      }
    },
    evictMatching(predicate, options) {
      for (const entry of Array.from(entriesRef.current.values())) {
        if (
          (options?.includeActive || !activeKeysRef.current.has(entry.key))
          && predicate(entry)
        ) {
          removeEntry(entry.key, 'manual');
        }
      }
    },
    subscribe(key, listener) {
      const listeners = keyListenersRef.current.get(key) ?? new Set<() => void>();
      listeners.add(listener);
      keyListenersRef.current.set(key, listeners);
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        keyListenersRef.current.delete(key);
        if (!entriesRef.current.has(key)) keyRevisionsRef.current.delete(key);
      };
    },
    revision(key) {
      return keyRevisionsRef.current.get(key) ?? 0;
    },
  }), []);

  useEffect(() => {
    enforceLimit();
  }, [maxEntries]);

  useEffect(() => () => {
    for (const key of Array.from(entriesRef.current.keys())) {
      removeEntry(key, 'session_closed');
    }
  }, []);

  const { track } = useAnalytics();
  // Bind preview phase telemetry to the consent-gated analytics channel. This
  // provider is mounted once, above every preview surface and inside
  // AnalyticsProvider, which makes it the only place in the tree that can hand
  // the whole preview runtime a live `track` without a second context.
  //
  // Declared last on purpose: React runs effect cleanups in declaration order,
  // so the teardown above must get to report its reclaims before this one
  // removes the sink they report through.
  useEffect(() => {
    setPreviewPhaseSink((event, properties) => track(event, properties));
    return () => setPreviewPhaseSink(null);
  }, [track]);

  return (
    <IframeKeepAliveContext.Provider value={pool}>
      {children}
      <div
        ref={parkedHostRef}
        className="iframe-keep-alive-pool"
        aria-hidden="true"
      />
    </IframeKeepAliveContext.Provider>
  );
}

export function useIframeKeepAlivePool(): IframeKeepAlivePoolValue {
  const pool = useContext(IframeKeepAliveContext);
  const fallbackEntriesRef = useRef<Map<string, PoolEntry>>(new Map());
  const fallbackActiveKeysRef = useRef<Set<string>>(new Set());
  const fallbackPool = useMemo<IframeKeepAlivePoolValue>(() => {
    const removeFallbackEntry = (key: string) => {
      const entry = fallbackEntriesRef.current.get(key);
      if (!entry) return;
      entry.element.remove();
      fallbackEntriesRef.current.delete(key);
      fallbackActiveKeysRef.current.delete(key);
    };
    return {
      attach(key, host, create) {
        let entry = fallbackEntriesRef.current.get(key);
        if (!entry) {
          const { projectId, fileName } = parseKeepAliveKey(key);
          entry = {
            key,
            projectId,
            fileName,
            element: create(),
            lastUsedAt: Date.now(),
            createdAt: Date.now(),
            attachCount: 0,
          };
          fallbackEntriesRef.current.set(key, entry);
        }
        entry.lastUsedAt = Date.now();
        entry.attachCount += 1;
        fallbackActiveKeysRef.current.add(key);
        host.appendChild(entry.element);
        return entry.element;
      },
      release(key) {
        removeFallbackEntry(key);
      },
      evict(key) {
        removeFallbackEntry(key);
      },
      evictFrame(frame) {
        for (const entry of fallbackEntriesRef.current.values()) {
          if (entry.element !== frame) continue;
          removeFallbackEntry(entry.key);
          return;
        }
      },
      evictProject(projectId) {
        for (const entry of Array.from(fallbackEntriesRef.current.values())) {
          if (entry.projectId === projectId) removeFallbackEntry(entry.key);
        }
      },
      evictMatching(predicate, _options) {
        // Fallback pool only attaches a single active entry at a time and
        // never parks, so includeActive is a no-op here — we always
        // remove any matching entry regardless.
        for (const entry of Array.from(fallbackEntriesRef.current.values())) {
          if (predicate(entry)) removeFallbackEntry(entry.key);
        }
      },
      subscribe() {
        return () => {};
      },
      revision() {
        return 0;
      },
    };
  }, []);
  useEffect(() => () => {
    for (const key of Array.from(fallbackEntriesRef.current.keys())) {
      const entry = fallbackEntriesRef.current.get(key);
      entry?.element.remove();
      fallbackEntriesRef.current.delete(key);
      fallbackActiveKeysRef.current.delete(key);
    }
  }, []);
  if (!pool) {
    return fallbackPool;
  }
  return pool;
}

type PooledIframeProps = ComponentPropsWithoutRef<'iframe'> & {
  cacheKey: string;
  src: string;
  'data-od-active'?: 'true' | 'false';
};

function setForwardedRef(ref: Ref<HTMLIFrameElement> | undefined, value: HTMLIFrameElement | null) {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref) {
    (ref as { current: HTMLIFrameElement | null }).current = value;
  }
}

function propNameToAttributeName(name: string): string {
  if (name === 'className') return 'class';
  if (name === 'htmlFor') return 'for';
  if (name === 'srcDoc') return 'srcdoc';
  if (name === 'tabIndex') return 'tabindex';
  if (name.startsWith('data-') || name.startsWith('aria-')) return name;
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).toLowerCase();
}

function setAttribute(frame: HTMLIFrameElement, name: string, value: unknown) {
  if (value == null || value === false) {
    frame.removeAttribute(name);
    return;
  }
  if (value === true) {
    frame.setAttribute(name, '');
    return;
  }
  const next = String(value);
  if (frame.getAttribute(name) !== next) frame.setAttribute(name, next);
}

function syncStyle(
  frame: HTMLIFrameElement,
  style: CSSProperties | undefined,
  appliedStyleKeys: Set<string>,
) {
  if (!style) {
    frame.removeAttribute('style');
    appliedStyleKeys.clear();
    return;
  }
  for (const key of Array.from(appliedStyleKeys)) {
    if (!(key in style)) {
      frame.style.setProperty(key, '');
      appliedStyleKeys.delete(key);
    }
  }
  for (const [key, value] of Object.entries(style)) {
    const cssKey = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    appliedStyleKeys.add(cssKey);
    if (value == null) {
      frame.style.setProperty(cssKey, '');
    } else {
      frame.style.setProperty(cssKey, String(value));
    }
  }
}

function syncIframeProps(
  frame: HTMLIFrameElement,
  props: PooledIframeProps,
  appliedAttributes: Set<string>,
  appliedStyleKeys: Set<string>,
) {
  if (props['data-od-active'] === 'false') blurIframeIfFocused(frame);
  // A pooled srcDoc frame carries `src="about:blank"` as its parking URL.
  // Set that URL before srcdoc on a fresh DOM node. Reversing this order starts
  // the real about:srcdoc navigation and then immediately cancels it with the
  // parking URL, which Electron reports as ERR_ABORTED and users see as a
  // white preview when opening or reattaching a file tab.
  setAttribute(frame, 'src', props.src);
  const nextAttributes = new Set<string>();
  for (const [name, value] of Object.entries(props)) {
    if (
      name === 'cacheKey'
      || name === 'src'
      || name === 'style'
      || name === 'children'
      || name === 'dangerouslySetInnerHTML'
      || name.startsWith('on')
    ) {
      continue;
    }
    const attributeName = propNameToAttributeName(name);
    nextAttributes.add(attributeName);
    setAttribute(frame, attributeName, value);
  }

  for (const previous of Array.from(appliedAttributes)) {
    if (!nextAttributes.has(previous)) frame.removeAttribute(previous);
  }
  appliedAttributes.clear();
  for (const attribute of nextAttributes) appliedAttributes.add(attribute);

  syncStyle(frame, props.style, appliedStyleKeys);
  frame.onload = props.onLoad
    ? (event) => props.onLoad?.(event as unknown as SyntheticEvent<HTMLIFrameElement>)
    : null;
}

export const PooledIframe = forwardRef<HTMLIFrameElement, PooledIframeProps>(function PooledIframe({
  cacheKey,
  src,
  ...props
}, forwardedRef) {
  const isServerRender = useIsServerRender();
  if (isServerRender) return <iframe {...props} src={src} />;
  return (
    <ClientPooledIframe
      ref={forwardedRef}
      cacheKey={cacheKey}
      src={src}
      {...props}
    />
  );
});

const ClientPooledIframe = forwardRef<HTMLIFrameElement, PooledIframeProps>(function ClientPooledIframe({
  cacheKey,
  src,
  ...props
}, forwardedRef) {
  const pool = useIframeKeepAlivePool();
  const poolKeyRevision = useSyncExternalStore(
    useMemo(() => (listener: () => void) => pool.subscribe(cacheKey, listener), [cacheKey, pool]),
    useMemo(() => () => pool.revision(cacheKey), [cacheKey, pool]),
    getServerRevision,
  );
  const hostRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const appliedForwardedRefRef = useRef<{
    ref: Ref<HTMLIFrameElement> | undefined;
    frame: HTMLIFrameElement;
  } | null>(null);
  const propsRef = useRef<PooledIframeProps>({ cacheKey, src, ...props });
  const appliedAttributesRef = useRef<Set<string>>(new Set());
  const appliedStyleKeysRef = useRef<Set<string>>(new Set());
  propsRef.current = { cacheKey, src, ...props };

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const frame = pool.attach(cacheKey, host, () => document.createElement('iframe'));
    iframeRef.current = frame;
    return () => {
      const applied = appliedForwardedRefRef.current;
      if (applied?.frame === frame) {
        setForwardedRef(applied.ref, null);
        appliedForwardedRefRef.current = null;
      }
      iframeRef.current = null;
      pool.release(cacheKey);
    };
  }, [cacheKey, pool, poolKeyRevision]);

  useLayoutEffect(() => {
    const frame = iframeRef.current;
    if (!frame) return;
    syncIframeProps(
      frame,
      propsRef.current,
      appliedAttributesRef.current,
      appliedStyleKeysRef.current,
    );
    const applied = appliedForwardedRefRef.current;
    if (applied?.ref === forwardedRef && applied.frame === frame) return;
    if (applied) setForwardedRef(applied.ref, null);
    setForwardedRef(forwardedRef, frame);
    appliedForwardedRefRef.current = { ref: forwardedRef, frame };
  });

  return (
    <span ref={hostRef} className="pooled-iframe-host" />
  );
});
