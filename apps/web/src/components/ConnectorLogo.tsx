import {
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ConnectorDetail } from '@open-design/contracts';

const COMPOSIO_LOGO_SLUG_OVERRIDES: Record<string, string> = {
  google_drive: 'googledrive',
};

/**
 * Composio publishes per-toolkit logos at `logos.composio.dev`, keyed by the
 * lowercased toolkit slug (`AIRTABLE` -> `airtable`, `ZOHO_BOOKS` ->
 * `zoho_books`). Our connector ids are mostly already that shape. A small
 * override map handles CDN exceptions such as Google Drive, whose logo slug
 * is `googledrive` even though the toolkit id remains `google_drive`.
 */
function composioLogoSlug(connector: ConnectorDetail): string {
  const normalized = connector.id.toLowerCase().replace(/[^a-z0-9_]/g, '');
  return COMPOSIO_LOGO_SLUG_OVERRIDES[normalized] ?? normalized;
}

/**
 * Build the Composio logo URL for a given connector + theme. Returns `null`
 * when the slug normalizes to empty so the fallback tile renders without a
 * pointless 404 round trip.
 */
function composioLogoUrl(
  connector: ConnectorDetail,
  theme: 'light' | 'dark',
): string | null {
  const slug = composioLogoSlug(connector);
  if (!slug) return null;
  return `/api/connectors/logos/${encodeURIComponent(slug)}?theme=${theme}`;
}

/**
 * Resolve the live theme from `<html data-theme>`, falling back to the OS
 * preference when the user is on the implicit "system" mode (no attribute
 * set). Lightweight on purpose — the color of an icon doesn't deserve a
 * full theme provider/context here. The hook listens for both the data
 * attribute changing and the OS-level `prefers-color-scheme` toggling so
 * the logo stays in lockstep with the rest of the chrome.
 */
export function useResolvedTheme(): 'light' | 'dark' {
  const read = (): 'light' | 'dark' => {
    if (typeof document === 'undefined') return 'dark';
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  };
  const [theme, setTheme] = useState<'light' | 'dark'>(read);
  useEffect(() => {
    const update = () => setTheme(read());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener?.('change', update);
    return () => {
      observer.disconnect();
      media?.removeEventListener?.('change', update);
    };
  }, []);
  return theme;
}

/**
 * Tiny hash -> palette index. Stable across reloads so a connector's
 * fallback tile keeps the same hue, which makes the catalog feel coherent
 * even when many logos are missing (e.g. dev fixtures, network blocked).
 */
function fallbackPaletteIndex(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 6;
}

function fallbackInitials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/\s+/u);
  if (parts.length === 1) {
    const single = parts[0]!;
    return (single[0] ?? '').toUpperCase() + (single[1] ?? '').toLowerCase();
  }
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? '';
  return (first + second).toUpperCase();
}

/**
 * Connector brand mark. Tries the Composio logo CDN first (theme-aware) and
 * gracefully degrades to a colored initials tile if the request fails or no
 * slug is derivable. Decorative by default — the surrounding caption (card
 * title / drawer heading) is the accessible label, so the image carries an
 * empty alt and `aria-hidden="true"`.
 */
export function ConnectorLogo({
  connector,
  theme,
  size = 'sm',
}: {
  connector: ConnectorDetail;
  theme: 'light' | 'dark';
  /** `sm` for compact rows/cards, `lg` for the detail drawer mark. */
  size?: 'sm' | 'lg';
}) {
  const url = composioLogoUrl(connector, theme);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [state, setState] = useState<'pending' | 'loaded' | 'error'>(
    url ? 'pending' : 'error',
  );
  useEffect(() => {
    if (!url) {
      setState('error');
      return;
    }
    setState('pending');
    const image = imageRef.current;
    if (image?.complete) {
      setState(image.naturalWidth > 0 ? 'loaded' : 'error');
    }
  }, [url]);
  const initials = fallbackInitials(connector.name);
  const palette = fallbackPaletteIndex(connector.id || connector.name);
  const showImage = url !== null && state !== 'error';
  return (
    <span
      className={`connector-logo size-${size} state-${state}${showImage ? '' : ' is-fallback'}`}
      data-palette={palette}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          key={url}
          ref={imageRef}
          className="connector-logo-img"
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
        />
      ) : null}
      <span className="connector-logo-fallback">{initials}</span>
    </span>
  );
}
