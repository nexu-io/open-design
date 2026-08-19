// Extract FigModifyOptions from diff between original and modified HTML render output.
// Parses `data-od-id="sessionID:localID"` elements and reads their inline CSS props.

import type { FigModifyOptions } from './convert-to-fig';

interface ElementState {
  id: string;
  name: string;
  type: string;
  left: number;
  top: number;
  width: number;
  height: number;
  text: string;
  fillColor: string;
  borderRadius: number;
  opacity: number;
  rotation: number;
  fontSize: number;
  fontWeight: number;
}

// ponytail: single-pass parse, O(html length), fast enough
function parseElements(html: string): ElementState[] {
  const els: ElementState[] = [];
  // Find all elements with data-od-id and data-od-name attributes
  const regex = /<(\w+)\s+([^>]*data-od-id="([^"]+)"[^>]*data-od-name="([^"]+)"[^>]*(?:data-type="([^"]*)")?[^>]*)>((?:(?!<\/\1>)[\s\S])*?)<\/\1>/gi;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(html)) !== null) {
    const tag = m[1]!;
    const attrStr = m[2]!;
    const id = m[3]!;
    const name = m[4]!;
    const dataType = m[5] || tag;
    const content = m[6] || '';

    // Parse inline style
    const styleStr = (attrStr.match(/style="([^"]*)"/) || [])[1] || '';
    const styles: Record<string, string> = {};
    styleStr.split(';').forEach((pair) => {
      const [k, v] = pair.split(':').map((s) => s.trim());
      if (k && v) styles[k] = v;
    });

    const el: ElementState = {
      id,
      name,
      type: dataType,
      left: parsePx(styles.left) ?? 0,
      top: parsePx(styles.top) ?? 0,
      width: parsePx(styles.width) ?? 0,
      height: parsePx(styles.height) ?? 0,
      text: extractTextContent(content, tag),
      fillColor: extractFillColor(styles),
      borderRadius: parsePx(styles['border-radius']) ?? 0,
      opacity: parseFloat(styles.opacity) || 1,
      rotation: extractRotationDeg(styles.transform),
      fontSize: parsePx(styles['font-size']) ?? 0,
      fontWeight: parseInt(styles['font-weight'], 10) || 0,
    };
    els.push(el);
  }
  return els;
}

function parsePx(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function extractFillColor(styles: Record<string, string>): string {
  // Look for background:rgb(R,G,B) or background:rgba(R,G,B,A)
  const bg = styles['background'] || styles['background-color'] || '';
  const rgbMatch = bg.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const hex = [rgbMatch[1], rgbMatch[2], rgbMatch[3]]
      .map((c) => parseInt(c, 10).toString(16).padStart(2, '0')).join('');
    // Filter out obvious placeholder backgrounds (transparent, rgba(0,0,0,0.x))
    if (hex === '000000' && bg.includes('rgba(0,0,0,0.')) return '';
    return '#' + hex;
  }
  // text color
  const tc = styles['color'] || '';
  const tcMatch = tc.match(/rgb\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)/);
  if (tcMatch) {
    return '#' + [tcMatch[1], tcMatch[2], tcMatch[3]]
      .map((c) => parseInt(c, 10).toString(16).padStart(2, '0')).join('');
  }
  return '';
}

function extractRotationDeg(transform: string | undefined): number {
  if (!transform) return 0;
  const m = transform.match(/rotate\((-?[0-9.]+)deg\)/);
  return m ? parseFloat(m[1]) : 0;
}

function extractTextContent(inner: string, tag: string): string {
  if (tag.toLowerCase() !== 'span') return '';
  // Strip HTML tags from inner content
  return inner.replace(/<[^>]*>/g, '').trim();
}

function buildIdMap(els: ElementState[]): Map<string, ElementState> {
  const map = new Map<string, ElementState>();
  for (const el of els) map.set(el.id, el);
  return map;
}

export function diffHtmlPatches(originalHtml: string, modifiedHtml: string): FigModifyOptions {
  const orig = parseElements(originalHtml);
  const mod = parseElements(modifiedHtml);

  const origMap = buildIdMap(orig);
  const modMap = buildIdMap(mod);

  const opts: FigModifyOptions = {
    fillColor: {},
    cornerRadius: {},
    position: {},
    size: {},
    text: {},
    opacity: {},
    rotation: {},
    fontSize: {},
    fontWeight: {},
    rename: {},
    removeNodes: [],
  };

  // Deleted elements (in original but not in modified)
  for (const o of orig) {
    if (!modMap.has(o.id)) {
      (opts.removeNodes ?? (opts.removeNodes = [])).push(o.id);
    }
  }

  // Changed elements (in both, but properties differ)
  for (const m of mod) {
    const o = origMap.get(m.id);
    if (!o) continue; // new element, skip for now

    if (m.left !== o.left || m.top !== o.top) {
      (opts.position ?? (opts.position = {}))[m.id] = { x: m.left, y: m.top };
    }
    if (m.width !== o.width || m.height !== o.height) {
      (opts.size ?? (opts.size = {}))[m.id] = { w: m.width, h: m.height };
    }
    if (m.fillColor && m.fillColor !== o.fillColor) {
      (opts.fillColor ?? (opts.fillColor = {}))[m.id] = m.fillColor;
    }
    if (m.borderRadius !== o.borderRadius) {
      (opts.cornerRadius ?? (opts.cornerRadius = {}))[m.id] = m.borderRadius;
    }
    if (m.opacity !== o.opacity) {
      (opts.opacity ?? (opts.opacity = {}))[m.id] = m.opacity;
    }
    if (m.rotation !== o.rotation) {
      (opts.rotation ?? (opts.rotation = {}))[m.id] = m.rotation;
    }
    if (m.fontSize && m.fontSize !== o.fontSize) {
      (opts.fontSize ?? (opts.fontSize = {}))[m.id] = m.fontSize;
    }
    if (m.fontWeight && m.fontWeight !== o.fontWeight) {
      (opts.fontWeight ?? (opts.fontWeight = {}))[m.id] = m.fontWeight;
    }
    if (m.text && m.text !== o.text) {
      (opts.text ?? (opts.text = {}))[m.id] = m.text;
    }
    if (m.name !== o.name) {
      (opts.rename ?? (opts.rename = {}))[m.id] = m.name;
    }
  }

  return pruneEmptyOptions(opts);
}

function pruneEmptyOptions(opts: FigModifyOptions): FigModifyOptions {
  const result: FigModifyOptions = {};
  for (const [key, value] of Object.entries(opts)) {
    if (value == null) continue;
    if (typeof value === 'object' && Object.keys(value as object).length === 0) continue;
    (result as any)[key] = value;
  }
  return result;
}
