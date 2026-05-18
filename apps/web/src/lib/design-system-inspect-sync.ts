'use client';

/**
 * Materialize inspect color tweaks on design-system showcase.html into real
 * inline styles, then mirror swatch hexes into DESIGN.md.
 * Browser-only DOM APIs — must not import jsdom or other Node built-ins.
 */

export type InspectOverrideEntry = {
  selector: string;
  props: Record<string, string>;
};
export type InspectOverrideMap = Record<string, InspectOverrideEntry>;

const SWATCH_SELECTOR = [
  '.swatches .swatch',
  '.swatches [class*="swatch"]',
  '[data-ds-swatch]',
  '[data-od-id^="ds-color-"]',
].join(', ');

function parseHtmlDocument(html: string): Document | null {
  try {
    if (typeof DOMParser !== 'undefined') {
      return new DOMParser().parseFromString(html, 'text/html');
    }
    if (typeof document !== 'undefined') {
      const doc = document.implementation.createHTMLDocument('');
      doc.documentElement.innerHTML = html;
      return doc;
    }
  } catch {
    // fall through
  }
  return null;
}

export function normalizeHex(value: string): string | null {
  const raw = String(value || '').trim();
  const m = /^#?([0-9a-fA-F]{3,8})$/.exec(raw);
  const captured = m?.[1];
  if (!captured) return null;
  let hex = captured.toLowerCase();
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  if (hex.length !== 6 && hex.length !== 8) return null;
  return `#${hex}`;
}

function parseInlineStyle(style: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const chunk of style.split(';')) {
    const idx = chunk.indexOf(':');
    if (idx <= 0) continue;
    const key = chunk.slice(0, idx).trim().toLowerCase();
    const value = chunk.slice(idx + 1).trim();
    if (key) map.set(key, value);
  }
  return map;
}

function serializeInlineStyle(map: Map<string, string>): string {
  return [...map.entries()].map(([k, v]) => `${k}: ${v}`).join('; ');
}

function pickFillColor(props: Record<string, string>): string | null {
  const bg = props['background-color'] ?? props.background;
  const color = props.color;
  return normalizeHex(bg ?? '') ?? normalizeHex(color ?? '');
}

function serializeHtmlDocument(doc: Document): string {
  const doctype = doc.doctype
    ? `<!DOCTYPE ${doc.doctype.name}${doc.doctype.publicId ? ` PUBLIC "${doc.doctype.publicId}"` : ''}${doc.doctype.systemId ? ` "${doc.doctype.systemId}"` : ''}>`
    : '';
  return `${doctype}${doc.documentElement.outerHTML}`;
}

function stripInspectOverrideBlocks(doc: Document): void {
  doc.querySelectorAll('style[data-od-inspect-overrides]').forEach((el) => el.remove());
}

function applyPropsToInlineStyle(el: Element, props: Record<string, string>): void {
  const styleMap = parseInlineStyle(el.getAttribute('style') ?? '');
  for (const [rawName, rawValue] of Object.entries(props)) {
    const name = rawName.toLowerCase();
    const value = String(rawValue ?? '').trim();
    if (!value) {
      styleMap.delete(name);
      if (name === 'background-color') styleMap.delete('background');
      continue;
    }
    styleMap.set(name, value);
    if (name === 'background-color') {
      styleMap.set('background', value);
    }
  }
  const serialized = serializeInlineStyle(styleMap);
  if (serialized) el.setAttribute('style', serialized);
  else el.removeAttribute('style');
  const fill = pickFillColor(props);
  if (fill) el.setAttribute('data-ds-color-hex', fill);
}

function cssEscapeAttr(value: string): string {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Stable ids on palette swatches so inspect can target them in srcdoc. */
export function annotateShowcaseSwatches(html: string): string {
  try {
    const doc = parseHtmlDocument(html);
    if (!doc) return html;
    const swatches = doc.querySelectorAll(SWATCH_SELECTOR);
    let index = 0;
    swatches.forEach((el) => {
      if (el.hasAttribute('data-od-id')) return;
      const id = `ds-color-${index}`;
      el.setAttribute('data-od-id', id);
      el.setAttribute('data-ds-swatch', '');
      if (!el.hasAttribute('data-ds-color-index')) {
        el.setAttribute('data-ds-color-index', String(index));
      }
      index += 1;
    });
    return serializeHtmlDocument(doc);
  } catch {
    return html;
  }
}

/**
 * Apply inspect overrides as inline styles on matching nodes and remove the
 * transient <style data-od-inspect-overrides> block so saved HTML is portable.
 */
export function materializeInspectOverridesToShowcaseHtml(
  source: string,
  overrides: InspectOverrideMap,
): string {
  try {
    const html = annotateShowcaseSwatches(source);
    const doc = parseHtmlDocument(html);
    if (!doc) return source;
    stripInspectOverrideBlocks(doc);

    for (const [elementId, entry] of Object.entries(overrides)) {
      if (!entry?.props || !Object.keys(entry.props).length) continue;
      const el =
        doc.querySelector(`[data-od-id="${cssEscapeAttr(elementId)}"]`)
        ?? doc.querySelector(`[data-screen-label="${cssEscapeAttr(elementId)}"]`);
      if (!el) continue;
      applyPropsToInlineStyle(el, entry.props);
    }

    return serializeHtmlDocument(doc);
  } catch {
    return source;
  }
}

export type ShowcaseSwatchColor = {
  index: number;
  hex: string;
  odId: string | null;
};

/** Read swatch fill colors from showcase HTML in document order. */
export function collectSwatchColorsFromShowcase(html: string): ShowcaseSwatchColor[] {
  try {
    const doc = parseHtmlDocument(html);
    if (!doc) return [];
    const nodes = doc.querySelectorAll(SWATCH_SELECTOR);
    const out: ShowcaseSwatchColor[] = [];
    nodes.forEach((el, index) => {
      const fromAttr = normalizeHex(el.getAttribute('data-ds-color-hex') ?? '');
      const styleMap = parseInlineStyle(el.getAttribute('style') ?? '');
      const fromStyle =
        normalizeHex(styleMap.get('background') ?? '')
        ?? normalizeHex(styleMap.get('background-color') ?? '');
      const hex = fromAttr ?? fromStyle;
      if (!hex) return;
      out.push({
        index,
        hex,
        odId: el.getAttribute('data-od-id'),
      });
    });
    return out;
  } catch {
    return [];
  }
}

export type DesignMdColorLine = {
  lineIndex: number;
  hex: string;
};

/** Lines in DESIGN.md that declare a hex color, in file order. */
export function extractColorHexLinesFromDesignMd(raw: string): DesignMdColorLine[] {
  const lines = raw.split(/\r?\n/);
  const out: DesignMdColorLine[] = [];
  lines.forEach((line, lineIndex) => {
    const match = /#[0-9a-fA-F]{3,8}\b/.exec(line);
    if (!match) return;
    const hex = normalizeHex(match[0]);
    if (!hex) return;
    out.push({ lineIndex, hex });
  });
  return out;
}

/**
 * Replace hex values on color lines in DESIGN.md to match showcase swatches
 * (paired by order: first swatch → first color line with a hex, etc.).
 */
export function syncDesignMdFromShowcaseHtml(designMd: string, showcaseHtml: string): string {
  const swatches = collectSwatchColorsFromShowcase(showcaseHtml);
  const colorLines = extractColorHexLinesFromDesignMd(designMd);
  if (!swatches.length || !colorLines.length) return designMd;

  const lines = designMd.split(/\r?\n/);
  const count = Math.min(swatches.length, colorLines.length);
  for (let i = 0; i < count; i++) {
    const colorLine = colorLines[i];
    const swatch = swatches[i];
    if (!colorLine || !swatch) continue;
    const { lineIndex, hex: oldHex } = colorLine;
    const newHex = swatch.hex;
    if (normalizeHex(oldHex) === newHex) continue;
    const line = lines[lineIndex] ?? '';
    lines[lineIndex] = line.replace(
      new RegExp(oldHex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      newHex,
    );
  }
  return lines.join('\n');
}

export function isDesignSystemShowcaseFile(name: string): boolean {
  return name === 'showcase.html' || name.endsWith('/showcase.html');
}

export function isDesignMdFile(name: string): boolean {
  return name === 'DESIGN.md' || name.endsWith('/DESIGN.md');
}

export function projectTitleFromShowcaseHtml(html: string): string {
  const doc = parseHtmlDocument(html);
  const h1 = doc?.querySelector('main h1, .wrap h1, body h1')?.textContent?.trim();
  return h1 || 'Design system';
}
