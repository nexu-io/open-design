import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { BrowserInput, WebPageState } from '../../../shared/browser';
import { useI18n } from '../i18n/I18n';

export type WebBrowserHandle = { command: (action: 'back' | 'forward' | 'reload' | 'stop' | 'navigate', url?: string) => Promise<void> };
export const browserEndpoint = (session: string, tab: string) => `/design-api/sessions/${encodeURIComponent(session)}/browser/${encodeURIComponent(tab)}`;
export async function browserRequest(endpoint: string, data?: unknown, method = 'POST') {
  const response = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
  return value as WebPageState;
}

/** Only pixels and whitelisted input cross this boundary; web documents never run in the workspace DOM. */
export const WebBrowser = forwardRef<WebBrowserHandle, { sessionId: string; tabId: string; url: string; onState: (state: WebPageState) => void }>(function WebBrowser({ sessionId, tabId, url, onState }, ref) {
  const { t } = useI18n();
  const endpoint = browserEndpoint(sessionId, tabId);
  const surface = useRef<HTMLDivElement>(null), keyboard = useRef<HTMLTextAreaElement>(null);
  const picture = useRef<HTMLImageElement>(null), ready = useRef(false), queue = useRef(Promise.resolve());
  const report = useRef(onState), initialUrl = useRef(url), composing = useRef(false), pointerTime = useRef(0);
  report.current = onState;
  initialUrl.current = url;
  const [error, setError] = useState(''), [hasFrame, setHasFrame] = useState(false), [attempt, setAttempt] = useState(0);
  useImperativeHandle(ref, () => ({ command: async (action, address) => {
    if (!ready.current) throw new Error(t('Browser is connecting. Please try again.'));
    setError(''); await browserRequest(`${endpoint}/command`, { action, url: address });
  } }), [endpoint, t]);
  function input(event: BrowserInput) {
    if (!ready.current) return;
    queue.current = queue.current.then(async () => { await browserRequest(`${endpoint}/input`, event); }).catch(reason => setError(reason.message));
  }
  useEffect(() => {
    let disposed = false, events: EventSource | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    let observer: ResizeObserver | undefined;
    ready.current = false; setError(''); setHasFrame(false);
    void (async () => {
      await browserRequest(endpoint, { url: initialUrl.current });
      if (disposed) return;
      if (attempt > 0) await browserRequest(`${endpoint}/command`, { action: 'navigate', url: initialUrl.current });
      ready.current = true;
      events = new EventSource(`${endpoint}/events`);
      events.addEventListener('state', event => {
        if (disposed) return;
        const state: WebPageState = JSON.parse((event as MessageEvent).data);
        report.current(state); setError(state.error || '');
      });
      events.addEventListener('frame', event => {
        if (disposed || !picture.current) return;
        picture.current.src = `data:image/jpeg;base64,${JSON.parse((event as MessageEvent).data).data}`;
        setHasFrame(true);
      });
      events.onerror = () => { if (!disposed) setError(t('Browser connection interrupted. Retry to reconnect.')); };
      const resize = () => {
        clearTimeout(timer); timer = setTimeout(() => {
          const bounds = surface.current?.getBoundingClientRect();
          if (bounds && !disposed) void browserRequest(`${endpoint}/resize`, { width: bounds.width, height: bounds.height }).catch(reason => setError(reason.message));
        }, 100);
      };
      observer = new ResizeObserver(resize); observer.observe(surface.current!); resize();
    })().catch(reason => { if (!disposed) setError(reason.message); });
    return () => { disposed = true; ready.current = false; events?.close(); observer?.disconnect(); clearTimeout(timer); };
  }, [endpoint, attempt, t]);
  const point = (x: number, y: number) => {
    const bounds = picture.current!.getBoundingClientRect();
    return { x: (x - bounds.left) * picture.current!.naturalWidth / bounds.width, y: (y - bounds.top) * picture.current!.naturalHeight / bounds.height };
  };
  useEffect(() => {
    const node = surface.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1;
      input({ type: 'wheel', ...point(event.clientX, event.clientY), deltaX: event.deltaX * unit, deltaY: event.deltaY * unit });
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [endpoint]); // Input queue is scoped to this tab's mount.
  return <div className="motion-web-browser" ref={surface} aria-label={t('Web page')}>
    <img ref={picture} className="motion-web-page" alt={t('Web page')} draggable={false} hidden={!hasFrame}
      onContextMenu={event => event.preventDefault()}
      onPointerDown={event => { event.preventDefault(); keyboard.current?.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId); input({ type: 'pointer', event: 'down', ...point(event.clientX, event.clientY), button: event.button === 2 ? 'right' : event.button === 1 ? 'middle' : 'left', clickCount: event.detail }); }}
      onPointerUp={event => input({ type: 'pointer', event: 'up', ...point(event.clientX, event.clientY), button: event.button === 2 ? 'right' : event.button === 1 ? 'middle' : 'left', clickCount: event.detail })}
      onPointerMove={event => { if (Date.now() - pointerTime.current < 60) return; pointerTime.current = Date.now(); input({ type: 'pointer', event: 'move', ...point(event.clientX, event.clientY), button: 'left' }); }} />
    <textarea ref={keyboard} className="motion-browser-keyboard" aria-label={t('Web page keyboard')} autoComplete="off" autoCapitalize="off" spellCheck={false}
      onCompositionStart={() => { composing.current = true; }} onCompositionEnd={event => { composing.current = false; input({ type: 'text', text: event.currentTarget.value }); event.currentTarget.value = ''; }}
      onInput={event => { if (!composing.current && event.currentTarget.value) { input({ type: 'text', text: event.currentTarget.value }); event.currentTarget.value = ''; } }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || composing.current) return;
        if (['Enter', 'Backspace', 'Tab', 'Escape', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a')) {
          event.preventDefault(); input({ type: 'key', key: event.key.toLowerCase() === 'a' ? 'a' : event.key, modifiers: (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0) });
        }
      }} />
    {!hasFrame && !error && <div className="motion-browser-feedback" role="status">{t('Loading…')}</div>}
    {error && <div className="motion-browser-feedback" role="alert"><span>{error}</span><button className="motion-button" onClick={() => setAttempt(value => value + 1)}>{t('Retry')}</button></div>}
  </div>;
});
