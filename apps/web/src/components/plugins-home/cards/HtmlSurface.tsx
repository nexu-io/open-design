// Sandboxed HTML preview surface — used for `examples/*` plugins
// and any scenario plugin that ships a runnable `od.preview.entry`.
//
// The iframe is mounted only after the card scrolls into view. We
// further guard the iframe behind a one-shot pointer hover (`armed`)
// for tiles that contain heavy interactive content; once armed it
// stays mounted so cursor flicker doesn't tear down the preview.
//
// The iframe is rendered tiny inside the card and visually scaled
// up via CSS `transform: scale(...)` so a full-size HTML doc reads
// as a thumbnail without needing a server-rendered screenshot. The
// daemon already enforces a strict CSP on the asset response.
//
// Reachability probe
// ------------------
// Some bundled plugins declare an `od.preview.entry` that doesn't
// resolve on disk (the daemon falls back to assets/*.html, but if
// nothing in the curated list exists the route 404s and the iframe
// renders the JSON error envelope as a blank white tile). To avoid
// blank cards in the home gallery, we issue a single HEAD probe
// before mounting the iframe and swap in a typographic fallback
// when the URL is unreachable. Results are cached per-URL so
// scrolling doesn't re-probe the same plugin.

import { useEffect, useState } from 'react';
import type { HtmlPreviewSpec } from '../preview';

interface Props {
  preview: HtmlPreviewSpec;
  pluginId: string;
  pluginTitle: string;
  inView: boolean;
}

type ProbeState = 'idle' | 'probing' | 'ok' | 'unreachable';

const probeCache = new Map<string, 'ok' | 'unreachable'>();
const inflight = new Map<string, Promise<'ok' | 'unreachable'>>();

async function probe(url: string): Promise<'ok' | 'unreachable'> {
  const cached = probeCache.get(url);
  if (cached) return cached;
  const existing = inflight.get(url);
  if (existing) return existing;
  const run = (async () => {
    try {
      const head = await fetch(url, { method: 'HEAD' });
      if (head.ok) return 'ok' as const;
      // Fall back to a normal GET — the daemon's asset routes only
      // handle GET, so HEAD may legitimately 404 even when the entry
      // exists. Use a Range request to keep the response tiny.
      const res = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
      });
      return res.ok || res.status === 206 ? ('ok' as const) : ('unreachable' as const);
    } catch {
      return 'unreachable' as const;
    }
  })();
  inflight.set(url, run);
  const result = await run;
  probeCache.set(url, result);
  inflight.delete(url);
  return result;
}

export function HtmlSurface({ preview, pluginId, pluginTitle, inView }: Props) {
  const [armed, setArmed] = useState(false);
  const [probeState, setProbeState] = useState<ProbeState>(() => {
    const cached = probeCache.get(preview.src);
    return cached ?? 'idle';
  });

  // Kick off the probe on first in-view. We deliberately keep this
  // effect's deps narrow (just `inView` + `preview.src`) so the
  // subsequent `setProbeState(result)` does not cancel the in-flight
  // promise via a re-run cleanup. The module-level cache also makes
  // the probe a no-op if another tile already resolved the same URL.
  useEffect(() => {
    if (!inView) return;
    if (probeCache.has(preview.src)) {
      setProbeState(probeCache.get(preview.src)!);
      return;
    }
    let cancelled = false;
    setProbeState('probing');
    probe(preview.src).then((result) => {
      if (!cancelled) setProbeState(result);
    });
    return () => {
      cancelled = true;
    };
  }, [inView, preview.src]);

  // Arm the iframe after a short visibility window so the user can
  // scroll past tiles without paying for an iframe per tile, but tiles
  // that linger get the live preview without requiring hover.
  useEffect(() => {
    if (probeState !== 'ok') return;
    const id = window.setTimeout(() => setArmed(true), 280);
    return () => window.clearTimeout(id);
  }, [probeState]);

  if (probeState === 'unreachable') {
    return <UnreachableFallback pluginId={pluginId} pluginTitle={pluginTitle} preview={preview} />;
  }

  return (
    <div
      className="plugins-home__html"
      data-plugin-id={pluginId}
      onMouseEnter={() => {
        if (probeState === 'ok') setArmed(true);
      }}
    >
      <div className="plugins-home__html-frame">
        {armed ? (
          <iframe
            title={`${pluginTitle} preview`}
            src={preview.src}
            sandbox="allow-scripts"
            loading="lazy"
            tabIndex={-1}
            aria-hidden
            className="plugins-home__html-iframe"
          />
        ) : (
          <div className="plugins-home__html-skeleton" aria-hidden>
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
      <div className="plugins-home__html-chrome" aria-hidden>
        <span className="plugins-home__html-dot" />
        <span className="plugins-home__html-dot" />
        <span className="plugins-home__html-dot" />
        <span className="plugins-home__html-url">{preview.label}</span>
      </div>
    </div>
  );
}

interface UnreachableFallbackProps {
  pluginId: string;
  pluginTitle: string;
  preview: HtmlPreviewSpec;
}

// Stable colour from the plugin id so adjacent fallback tiles stay
// visually distinct without flickering on re-renders.
function hueFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

function UnreachableFallback({ pluginId, pluginTitle, preview }: UnreachableFallbackProps) {
  const trimmed = pluginTitle.trim();
  const cp = trimmed.codePointAt(0) ?? 0x2022;
  const glyph = cp === 0x2022 ? '·' : String.fromCodePoint(cp).toUpperCase();
  const hue = hueFor(pluginId);
  const style = {
    background: `linear-gradient(135deg, hsl(${hue} 60% 18%), hsl(${(hue + 24) % 360} 50% 9%))`,
  };
  return (
    <div
      className="plugins-home__html plugins-home__html--fallback"
      data-plugin-id={pluginId}
      data-testid="plugins-home-html-fallback"
      style={style}
      aria-hidden
    >
      <div className="plugins-home__html-fallback-glyph">{glyph}</div>
      <div className="plugins-home__html-chrome">
        <span className="plugins-home__html-dot" />
        <span className="plugins-home__html-dot" />
        <span className="plugins-home__html-dot" />
        <span className="plugins-home__html-url">{preview.label}</span>
      </div>
    </div>
  );
}

// Test seam — exposed so unit tests can reset the probe cache between
// scenarios without leaking state across files.
export function __resetHtmlSurfaceProbeCacheForTests(): void {
  probeCache.clear();
  inflight.clear();
}
