export const OPEN_DESIGN_ATTRIBUTION_TEXT = 'Made with Open Design';
export const OPEN_DESIGN_ATTRIBUTION_SITE = 'open-design.ai';
export const OPEN_DESIGN_ATTRIBUTION_REMIX_LABEL = 'Remix';
export const OPEN_DESIGN_ATTRIBUTION_URL = 'https://open-design.ai/';
export const OPEN_DESIGN_ATTRIBUTION_REMIX_URL =
  'https://open-design.ai/plugins/templates/?utm_source=artifact_watermark&utm_medium=export&utm_campaign=made_with_open_design';

export interface OpenDesignAttributionOptions {
  remixUrl?: string;
}

export function openDesignAttributionPlainText(): string {
  return `${OPEN_DESIGN_ATTRIBUTION_TEXT} · ${OPEN_DESIGN_ATTRIBUTION_SITE} · ${OPEN_DESIGN_ATTRIBUTION_REMIX_LABEL}`;
}

export function injectOpenDesignAttribution(
  html: string,
  options: OpenDesignAttributionOptions = {},
): string {
  const source = String(html ?? '');
  if (/\sdata-open-design-attribution(?:=|\s|>)/i.test(source)) return source;

  const remixUrl = normalizeAttributionUrl(options.remixUrl) || OPEN_DESIGN_ATTRIBUTION_REMIX_URL;
  const attribution = buildAttributionMarkup(remixUrl);

  if (/<\/body\s*>/i.test(source)) {
    return source.replace(/<\/body\s*>/i, `${attribution}</body>`);
  }
  return `${source}${attribution}`;
}

function buildAttributionMarkup(remixUrl: string): string {
  return `<div data-open-design-attribution="true" style="position:fixed;right:14px;bottom:14px;z-index:2147483647;display:flex;align-items:center;gap:6px;max-width:calc(100vw - 28px);padding:7px 10px;border:1px solid rgba(15,23,42,.14);border-radius:999px;background:rgba(255,255,255,.92);box-shadow:0 10px 30px rgba(15,23,42,.14);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#0f172a;font:500 11px/1.25 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:0;text-decoration:none;white-space:nowrap;pointer-events:auto;print-color-adjust:exact;-webkit-print-color-adjust:exact"><span>${OPEN_DESIGN_ATTRIBUTION_TEXT}</span><span aria-hidden="true" style="opacity:.45">·</span><a href="${escapeHtmlAttribute(OPEN_DESIGN_ATTRIBUTION_URL)}" target="_blank" rel="noopener noreferrer" style="color:#0f172a;text-decoration:none">${OPEN_DESIGN_ATTRIBUTION_SITE}</a><span aria-hidden="true" style="opacity:.45">·</span><a href="${escapeHtmlAttribute(remixUrl)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:none">${OPEN_DESIGN_ATTRIBUTION_REMIX_LABEL}</a></div>`;
}

function normalizeAttributionUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
