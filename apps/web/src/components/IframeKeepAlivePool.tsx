import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type Ref,
  type SyntheticEvent,
} from 'react';

export const OD_PREVIEW_KEEP_ALIVE =
  typeof process === 'undefined' || process.env.OD_PREVIEW_KEEP_ALIVE !== '0';
export const DEFAULT_IFRAME_KEEP_ALIVE_POOL_SIZE = 5;

interface PoolEntry {
  key: string;
  projectId: string;
  fileName: string;
  element: HTMLIFrameElement;
  lastUsedAt: number;
}

interface IframeKeepAlivePoolValue {
  attach(key: string, host: HTMLElement, create: () => HTMLIFrameElement): HTMLIFrameElement;
  release(key: string): void;
  evict(key: string): void;
  evictProject(projectId: string, options?: { includeActive?: boolean }): void;
  evictMatching(
    predicate: (entry: PoolEntry) => boolean,
    options?: { includeActive?: boolean },
  ): void;
}

const IframeKeepAliveContext = createContext<IframeKeepAlivePoolValue | null>(null);
const subscribeToNoopStore = () => () => {};
const getClientSnapshot = () => false;
const getServerSnapshot = () => true;

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

function parkIframeElement(frame: HTMLIFrameElement) {
  frame.onload = null;
  frame.removeAttribute('data-testid');
  frame.setAttribute('data-od-active', 'false');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('tabindex', '-1');
}

function parseKeepAliveKey(key: string): { projectId: string; fileName: string } {
  const separator = key.indexOf('\0');
  if (separator < 0) return { projectId: key, fileName: '' };
  return {
    projectId: key.slice(0, separator),
    fileName: key.slice(separator + 1),
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
  const [poolRevision, bumpPoolRevision] = useState(0);

  const removeEntry = (key: string): boolean => {
    const entry = entriesRef.current.get(key);
    if (!entry) return false;
    const wasActive = activeKeysRef.current.has(key);
    entry.element.remove();
    entriesRef.current.delete(key);
    activeKeysRef.current.delete(key);
    return wasActive;
  };

  const enforceLimit = () => {
    const inactive = Array.from(entriesRef.current.values())
      .filter((entry) => !activeKeysRef.current.has(entry.key))
      .sort((a, b) => a.lastUsedAt - b.lastUsedAt);
    while (entriesRef.current.size > maxEntries && inactive.length > 0) {
      const evicted = inactive.shift();
      if (!evicted) break;
      removeEntry(evicted.key);
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
        };
        entriesRef.current.set(key, entry);
      }
      entry.lastUsedAt = Date.now();
      activeKeysRef.current.add(key);
      host.appendChild(entry.element);
      return entry.element;
    },
    release(key) {
      const entry = entriesRef.current.get(key);
      const parkedHost = parkedHostRef.current;
      activeKeysRef.current.delete(key);
      if (entry && parkedHost) {
        parkIframeElement(entry.element);
        parkedHost.appendChild(entry.element);
      }
      enforceLimit();
    },
    evict(key) {
      if (removeEntry(key)) bumpPoolRevision((value) => value + 1);
    },
    evictProject(projectId, options) {
      let removedActive = false;
      for (const entry of Array.from(entriesRef.current.values())) {
        if (
          entry.projectId === projectId
          && (options?.includeActive || !activeKeysRef.current.has(entry.key))
        ) {
          removedActive = removeEntry(entry.key) || removedActive;
        }
      }
      if (removedActive) bumpPoolRevision((value) => value + 1);
    },
    evictMatching(predicate, options) {
      let removedActive = false;
      for (const entry of Array.from(entriesRef.current.values())) {
        if (
          (options?.includeActive || !activeKeysRef.current.has(entry.key))
          && predicate(entry)
        ) {
          removedActive = removeEntry(entry.key) || removedActive;
        }
      }
      if (removedActive) bumpPoolRevision((value) => value + 1);
    },
  }), [maxEntries, poolRevision]);

  useEffect(() => () => {
    for (const key of Array.from(entriesRef.current.keys())) removeEntry(key);
  }, []);

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
          };
          fallbackEntriesRef.current.set(key, entry);
        }
        entry.lastUsedAt = Date.now();
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
  setAttribute(frame, 'src', props.src);
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
  const hostRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
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
      setForwardedRef(forwardedRef, null);
      iframeRef.current = null;
      pool.release(cacheKey);
    };
  }, [cacheKey, pool, forwardedRef]);

  useLayoutEffect(() => {
    const frame = iframeRef.current;
    if (!frame) return;
    syncIframeProps(
      frame,
      propsRef.current,
      appliedAttributesRef.current,
      appliedStyleKeysRef.current,
    );
    setForwardedRef(forwardedRef, frame);
  });

  return (
    <span ref={hostRef} className="pooled-iframe-host" />
  );
});
