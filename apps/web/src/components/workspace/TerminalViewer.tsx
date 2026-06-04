import { useCallback, useEffect, useRef, useState } from 'react';
import type { ITheme, Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { TerminalDataEvent, TerminalExitEvent } from '@open-design/contracts';
import { useT } from '../../i18n';
import { Icon } from '../Icon';
import {
  createTerminal,
  killTerminal,
  resizeTerminal,
  sendTerminalStdin,
  terminalStreamUrl,
} from '../../state/projects';
import styles from './TerminalViewer.module.css';

interface Props {
  /** PTY session id (the `terminal:<id>` tab's suffix). */
  terminalId: string;
  projectId: string;
  /** Close the owning workspace tab (the close button / no-restart paths). */
  onClose: () => void;
  /**
   * Report the live PTY session id to the host whenever it changes. The tab id
   * stays constant but Restart rebinds the surface to a fresh session, so the
   * host can't derive the live id from the tab alone — it needs this to kill
   * the right PTY on an explicit Close. The PTY now OUTLIVES unmount (tab
   * switches keep it running for cheap reattach via Last-Event-ID), so an
   * explicit Close is the only place it gets killed.
   */
  onSessionIdChange?: (terminalId: string, sessionId: string) => void;
}

type Phase = 'connecting' | 'live' | 'reconnecting' | 'ended' | 'unavailable';
type CssTerminalThemeKey = Exclude<keyof ITheme, 'extendedAnsi'>;

const TERMINAL_THEME_VARS = {
  foreground: '--terminal-fg',
  background: '--terminal-bg',
  cursor: '--terminal-cursor',
  cursorAccent: '--terminal-cursor-accent',
  selectionBackground: '--terminal-selection-bg',
  selectionForeground: '--terminal-selection-fg',
  selectionInactiveBackground: '--terminal-selection-inactive-bg',
  black: '--terminal-ansi-black',
  red: '--terminal-ansi-red',
  green: '--terminal-ansi-green',
  yellow: '--terminal-ansi-yellow',
  blue: '--terminal-ansi-blue',
  magenta: '--terminal-ansi-magenta',
  cyan: '--terminal-ansi-cyan',
  white: '--terminal-ansi-white',
  brightBlack: '--terminal-ansi-bright-black',
  brightRed: '--terminal-ansi-bright-red',
  brightGreen: '--terminal-ansi-bright-green',
  brightYellow: '--terminal-ansi-bright-yellow',
  brightBlue: '--terminal-ansi-bright-blue',
  brightMagenta: '--terminal-ansi-bright-magenta',
  brightCyan: '--terminal-ansi-bright-cyan',
  brightWhite: '--terminal-ansi-bright-white',
} as const satisfies Record<CssTerminalThemeKey, string>;

const FALLBACK_TERMINAL_THEME: Required<Pick<ITheme, CssTerminalThemeKey>> = {
  foreground: '#e6e1d9',
  background: '#1e1e1e',
  cursor: '#e6e1d9',
  cursorAccent: '#1e1e1e',
  selectionBackground: 'rgba(96, 165, 250, 0.32)',
  selectionForeground: '#ffffff',
  selectionInactiveBackground: 'rgba(148, 163, 184, 0.22)',
  black: '#1f2328',
  red: '#ff7b72',
  green: '#7ee787',
  yellow: '#d29922',
  blue: '#79c0ff',
  magenta: '#d2a8ff',
  cyan: '#56d4dd',
  white: '#e6edf3',
  brightBlack: '#6e7681',
  brightRed: '#ffa198',
  brightGreen: '#7ee787',
  brightYellow: '#e3b341',
  brightBlue: '#a5d6ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#7ee7f2',
  brightWhite: '#ffffff',
};

function terminalThemeFromCss(element: HTMLElement): ITheme {
  const styles = getComputedStyle(element);
  const theme: ITheme = {};
  for (const key of Object.keys(TERMINAL_THEME_VARS) as Array<keyof typeof TERMINAL_THEME_VARS>) {
    theme[key] = styles.getPropertyValue(TERMINAL_THEME_VARS[key]).trim() || FALLBACK_TERMINAL_THEME[key];
  }
  return theme;
}

function subscribeToAppearanceChanges(onChange: () => void): () => void {
  const root = document.documentElement;
  const media =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
  let frame: number | null = null;
  const cancelScheduled = () => {
    if (frame == null) return;
    if (typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(frame);
    } else {
      window.clearTimeout(frame);
    }
    frame = null;
  };
  const schedule = () => {
    cancelScheduled();
    frame =
      typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame(onChange)
        : window.setTimeout(onChange, 0);
  };
  const observer = new MutationObserver(schedule);
  // Watch only `data-theme` — the terminal palette is driven by that attribute
  // (plus the prefers-color-scheme media query below), never by the host root's
  // inline style. Observing `style` would re-run a full getComputedStyle theme
  // recompute on every unrelated inline-style write to <html>.
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  if (media && typeof media.addEventListener === 'function') {
    media.addEventListener('change', schedule);
  } else if (media) {
    media.addListener(schedule);
  }

  return () => {
    cancelScheduled();
    observer.disconnect();
    if (media && typeof media.removeEventListener === 'function') {
      media.removeEventListener('change', schedule);
    } else if (media) {
      media.removeListener(schedule);
    }
  };
}

/**
 * xterm.js surface bound to a daemon PTY session (Stage 3, `terminal:<id>` tab).
 *
 * Transport mirrors the chat-run lifecycle: output arrives over SSE
 * (`GET .../stream`, with EventSource's built-in `Last-Event-ID` replay on
 * reconnect), while keystrokes and resizes flow back up over plain POST
 * (`.../stdin`, `.../resize`). The PTY itself is created by the launcher action
 * (or `od shell`) BEFORE the tab opens, so this component attaches to an
 * existing session id and tears it down on unmount.
 *
 * xterm is imported lazily on mount (see the effect): its bundle references
 * `self` at module-eval time, which is undefined in the SSR/test (jsdom)
 * environment, so a static import would break any suite that transitively
 * imports this component. Lazy-loading also code-splits the heavy terminal lib
 * out of the main bundle — it only loads when a terminal tab is actually opened.
 *
 * Terminal states:
 * - `reconnecting`: a transient SSE drop (EventSource is still CONNECTING and
 *   retrying on its own).
 * - `ended`: the daemon emitted the single `exit` event (shell exited).
 * - `unavailable`: the session is gone — EventSource hit a non-2xx (e.g. the
 *   daemon restarted and dropped the in-memory session) and CLOSED permanently
 *   with no auto-retry, or a Restart could not spawn a fresh PTY. Both `ended`
 *   and `unavailable` offer Restart (spawn a new PTY in place) and Close.
 */
export function TerminalViewer({ terminalId, projectId, onClose, onSessionIdChange }: Props) {
  const t = useT();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [phase, setPhase] = useState<Phase>('connecting');
  // The live PTY session this surface is attached to. Starts as the tab's
  // session id; Restart spawns a fresh PTY and rebinds in place (the tab id is
  // just a stable container, so we don't churn OpenTabsState).
  const [sessionId, setSessionId] = useState(terminalId);

  // Keep the id of the most-recently-applied resize so the ResizeObserver
  // doesn't spam identical POSTs on every layout tick.
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);

  // Resync if the tab's backing id changes (shouldn't normally — the tab is
  // keyed by it — but keeps the surface honest if it ever does).
  useEffect(() => {
    setSessionId(terminalId);
  }, [terminalId]);

  // Surface the live session id to the host so an explicit Close kills the
  // correct PTY even after a Restart rebound this surface to a new session.
  useEffect(() => {
    onSessionIdChange?.(terminalId, sessionId);
  }, [terminalId, sessionId, onSessionIdChange]);

  const applyFit = useCallback(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    try {
      fit.fit();
    } catch {
      // fit throws if the container has zero size (e.g. tab not yet visible);
      // the ResizeObserver will fire again once it has real dimensions.
      return;
    }
    const { cols, rows } = term;
    const last = lastSizeRef.current;
    if (last && last.cols === cols && last.rows === rows) return;
    lastSizeRef.current = { cols, rows };
    void resizeTerminal(projectId, sessionId, cols, rows);
  }, [projectId, sessionId]);

  useEffect(() => {
    const container = surfaceRef.current;
    if (!container) return;

    let disposed = false;
    let observer: ResizeObserver | null = null;
    let source: EventSource | null = null;
    let dataSub: { dispose: () => void } | null = null;
    let appearanceCleanup: (() => void) | null = null;

    void (async () => {
      // Lazy import — see the component docblock for why xterm must not be
      // evaluated at module-import time.
      const mods = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ]).catch(() => null);
      if (disposed || !surfaceRef.current || !mods) {
        if (!disposed) setPhase('unavailable');
        return;
      }
      const [{ Terminal }, { FitAddon }] = mods;

      const xterm = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
        theme: terminalThemeFromCss(container),
        // The daemon owns scrollback semantics via PTY output; a generous local
        // buffer keeps long sessions scrollable without a round-trip.
        scrollback: 5000,
      });
      const fit = new FitAddon();
      xterm.loadAddon(fit);
      xterm.open(container);
      termRef.current = xterm;
      fitRef.current = fit;
      appearanceCleanup = subscribeToAppearanceChanges(() => {
        const nextContainer = surfaceRef.current;
        if (!nextContainer) return;
        xterm.options.theme = terminalThemeFromCss(nextContainer);
      });

      // Initial fit, then sync the PTY to the measured geometry.
      applyFit();

      // Keystrokes / pasted text → PTY stdin. Coalesce within a microtask so a
      // multi-KB paste (or a fast key burst) flushes as ONE POST instead of
      // fragmenting into a request per chunk.
      let stdinBuffer = '';
      let stdinScheduled = false;
      const flushStdin = () => {
        stdinScheduled = false;
        if (!stdinBuffer) return;
        const data = stdinBuffer;
        stdinBuffer = '';
        void sendTerminalStdin(projectId, sessionId, data);
      };
      dataSub = xterm.onData((data: string) => {
        stdinBuffer += data;
        if (!stdinScheduled) {
          stdinScheduled = true;
          queueMicrotask(flushStdin);
        }
      });

      // Reflow on container resize (tab switches, window resize, split changes).
      observer = new ResizeObserver(() => applyFit());
      observer.observe(container);

      // SSE down. EventSource auto-reconnects with Last-Event-ID, so the daemon
      // replays buffered output we missed during a transient gap.
      const es = new EventSource(terminalStreamUrl(projectId, sessionId));
      source = es;
      es.addEventListener('open', () => {
        setPhase((prev) => (prev === 'ended' ? prev : 'live'));
      });
      es.addEventListener('data', (evt) => {
        try {
          const payload = JSON.parse((evt as MessageEvent).data) as TerminalDataEvent;
          if (typeof payload.data === 'string') xterm.write(payload.data);
        } catch {
          // Ignore malformed chunks — more output will follow.
        }
      });
      es.addEventListener('exit', (evt) => {
        let payload: TerminalExitEvent | null = null;
        try {
          payload = JSON.parse((evt as MessageEvent).data) as TerminalExitEvent;
        } catch {
          payload = null;
        }
        const code = payload?.code ?? null;
        // The daemon closes the stream right after `exit`; mark the session
        // done so the error handler below doesn't flip us to "reconnecting".
        setPhase('ended');
        xterm.write(
          `\r\n\x1b[2m${t('workspace.terminalSessionEnded')}${
            code != null ? ` (${code})` : ''
          }\x1b[0m\r\n`,
        );
        es.close();
      });
      es.addEventListener('error', () => {
        // A non-2xx (e.g. the session no longer exists after a daemon restart)
        // permanently CLOSES EventSource — there is no auto-reconnect, so
        // surface an "unavailable" state (Restart/Close) instead of a perpetual
        // spinner. A transient drop leaves readyState === CONNECTING; show
        // "reconnecting".
        setPhase((prev) => {
          if (prev === 'ended') return prev;
          return es.readyState === EventSource.CLOSED ? 'unavailable' : 'reconnecting';
        });
      });
    })();

    return () => {
      disposed = true;
      dataSub?.dispose();
      observer?.disconnect();
      source?.close();
      appearanceCleanup?.();
      termRef.current?.dispose();
      termRef.current = null;
      fitRef.current = null;
      lastSizeRef.current = null;
      // Deliberately DO NOT kill the PTY here. Unmount happens on every tab
      // switch, and the daemon owns the session with Last-Event-ID replay, so
      // keeping it alive lets a tab switch (or page reload) reattach cheaply
      // instead of SIGTERM-ing a running `yarn build` and losing scrollback.
      // The PTY is killed only on an explicit Close (FileWorkspace.closeTab)
      // or when the daemon shuts down.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sessionId]);

  // Re-fit when the banner appears/disappears so the surface reclaims the row.
  useEffect(() => {
    applyFit();
  }, [phase, applyFit]);

  // Spawn a fresh PTY and rebind this surface to it (the tab id is unchanged).
  const restart = useCallback(async () => {
    setPhase('connecting');
    // Abandon the previous PTY before rebinding. Restart is only reachable from
    // the ended/unavailable states (old session already gone), so this is
    // usually a no-op — but since unmount no longer kills, it's the guard that
    // stops a stale session from lingering on the daemon if that ever changes.
    void killTerminal(projectId, sessionId, { keepalive: true });
    const next = await createTerminal(projectId);
    if (next?.id) {
      lastSizeRef.current = null;
      setSessionId(next.id);
    } else {
      setPhase('unavailable');
    }
  }, [projectId, sessionId]);

  const stopped = phase === 'ended' || phase === 'unavailable';
  const connecting = phase === 'connecting';
  const reconnecting = phase === 'reconnecting';

  return (
    <div className={styles.root} data-testid="terminal-viewer">
      <div
        ref={surfaceRef}
        className={`${styles.surface} ${connecting ? styles.surfaceConnecting : ''}`}
      />
      {connecting ? (
        <div
          className={styles.loading}
          role="status"
          aria-live="polite"
          data-testid="terminal-loading"
        >
          <div className={styles.loadingStack}>
            <div className={styles.loadingPromptLine} aria-hidden>
              <span className={styles.loadingPrompt}>$</span>
              <span className={styles.loadingCommand}>open-design shell</span>
              <span className={styles.loadingCursor} />
            </div>
            <div className={styles.loadingCopy}>
              <span className={styles.loadingTitle}>{t('workspace.terminalStarting')}</span>
              <span className={styles.loadingDescription}>
                {t('workspace.terminalStartingDescription')}
              </span>
            </div>
            <div className={styles.loadingRows} aria-hidden>
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      ) : null}
      {stopped ? (
        <div className={styles.banner} role="status">
          <span className={styles.bannerIcon} aria-hidden>
            <Icon name="terminal" size={14} />
          </span>
          <span className={styles.bannerLabel}>
            {t(
              phase === 'unavailable'
                ? 'workspace.terminalStartFailed'
                : 'workspace.terminalSessionEnded',
            )}
          </span>
          <button
            type="button"
            className={styles.restartBtn}
            data-testid="terminal-restart"
            onClick={() => void restart()}
          >
            <Icon name="reload" size={12} />
            {t('workspace.terminalRestart')}
          </button>
          <button
            type="button"
            className={styles.restartBtn}
            data-testid="terminal-close"
            onClick={onClose}
          >
            <Icon name="close" size={12} />
            {t('workspace.closeTab')}
          </button>
        </div>
      ) : reconnecting ? (
        <div className={styles.banner} role="status">
          <span className={styles.bannerIcon} aria-hidden>
            <Icon name="spinner" size={14} />
          </span>
          <span className={styles.bannerLabel}>{t('workspace.terminalReconnecting')}</span>
        </div>
      ) : null}
    </div>
  );
}
