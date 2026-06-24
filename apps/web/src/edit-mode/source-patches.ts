import { emptyManualEditStyles, MANUAL_EDIT_STYLE_PROPS, type ManualEditFields, type ManualEditPatch, type ManualEditStyles } from './types';

export interface ManualEditPatchResult {
  ok: boolean;
  source: string;
  error?: string;
}

export function applyManualEditPatch(source: string, patch: ManualEditPatch): ManualEditPatchResult {
  if (patch.kind === 'set-full-source') return { ok: true, source: patch.source };

  const doc = parseSource(source);
  if (!doc) return { ok: false, source, error: 'Could not parse source.' };

  if (patch.kind === 'set-token') {
    const changed = setCssToken(doc, patch.token, patch.value);
    return changed
      ? { ok: true, source: serializeSource(doc, source) }
      : { ok: false, source, error: `Token not found: ${patch.token}` };
  }

  const el = findEditableElement(doc, patch.id);
  if (!el) {
    const dynamic = applyDynamicBrandKitPatch(doc, patch);
    return dynamic.ok
      ? { ok: true, source: serializeSource(doc, source) }
      : { ok: false, source, error: `Target not found: ${patch.id}` };
  }

  if (patch.kind === 'set-text') {
    if (hasElementChildren(el)) {
      return { ok: false, source, error: 'This element contains nested markup. Use the HTML tab instead.' };
    }
    el.textContent = patch.value;
  } else if (patch.kind === 'set-link') {
    if (hasElementChildren(el)) {
      const currentText = el.textContent?.trim() ?? '';
      if (patch.text.trim() !== currentText) {
        return { ok: false, source, error: 'This link contains nested markup. Use the HTML tab to change its label.' };
      }
    } else {
      el.textContent = patch.text;
    }
    el.setAttribute('href', patch.href);
  } else if (patch.kind === 'set-image') {
    el.setAttribute('src', patch.src);
    el.setAttribute('alt', patch.alt);
  } else if (patch.kind === 'set-style') {
    setInlineStyles(el as HTMLElement, patch.styles);
  } else if (patch.kind === 'set-attributes') {
    setAttributes(el, patch.attributes);
  } else if (patch.kind === 'set-outer-html') {
    const replaced = replaceOuterHtml(doc, el, patch.html);
    if (!replaced.ok) {
      return {
        ok: false,
        source,
        error: 'error' in replaced ? replaced.error : 'Could not replace element HTML.',
      };
    }
  } else if (patch.kind === 'remove-element') {
    if (!el.parentElement) {
      return { ok: false, source, error: 'Cannot remove the root element.' };
    }
    if (el.parentElement === doc.body && doc.body.children.length === 1) {
      return { ok: false, source, error: 'Cannot remove the last element in the document.' };
    }
    el.remove();
  }

  return { ok: true, source: serializeSource(doc, source) };
}

export function readManualEditFields(source: string, id: string): ManualEditFields {
  const doc = parseSource(source);
  const el = doc ? findEditableElement(doc, id) : null;
  if (!el) return {};
  const kind = inferKind(el);
  if (kind === 'link') {
    return {
      text: el.textContent?.trim() ?? '',
      href: el.getAttribute('href') ?? '',
    };
  }
  if (kind === 'image') {
    return {
      src: el.getAttribute('src') ?? '',
      alt: el.getAttribute('alt') ?? '',
    };
  }
  return { text: el.textContent?.trim() ?? '' };
}

export function readManualEditStyles(source: string, id: string): ManualEditStyles {
  const doc = parseSource(source);
  const el = doc ? findEditableElement(doc, id) : null;
  if (!el) return emptyManualEditStyles();
  const style = (el as HTMLElement).style;
  return MANUAL_EDIT_STYLE_PROPS.reduce<ManualEditStyles>((acc, key) => {
    acc[key] = (style[key as unknown as keyof CSSStyleDeclaration] as string | undefined) ?? '';
    return acc;
  }, {} as ManualEditStyles);
}

export function readManualEditAttributes(source: string, id: string): Record<string, string> {
  const doc = parseSource(source);
  const el = doc ? findEditableElement(doc, id) : null;
  if (!el) return {};
  const attrs: Record<string, string> = {};
  Array.from(el.attributes).forEach((attr) => {
    if (attr.name === 'data-od-runtime-id') return;
    attrs[attr.name] = attr.value;
  });
  return attrs;
}

export function readManualEditOuterHtml(source: string, id: string): string {
  const doc = parseSource(source);
  return (doc ? findEditableElement(doc, id)?.outerHTML : '') ?? '';
}

function parseSource(source: string): Document | null {
  if (typeof DOMParser !== 'undefined') {
    return new DOMParser().parseFromString(source, 'text/html');
  }
  if (typeof document !== 'undefined') {
    const doc = document.implementation.createHTMLDocument('');
    doc.documentElement.innerHTML = source;
    return doc;
  }
  return null;
}

function serializeSource(doc: Document, originalSource: string): string {
  if (!isManualEditFullHtmlDocument(originalSource)) return doc.body.innerHTML;
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

export function isManualEditFullHtmlDocument(source: string): boolean {
  const normalized = firstSourceToken(source).slice(0, 32).toLowerCase();
  return normalized.startsWith('<!doctype') || normalized.startsWith('<html');
}

function firstSourceToken(source: string): string {
  let rest = source.trimStart();
  while (rest.startsWith('<!--') || rest.startsWith('<?')) {
    const close = rest.startsWith('<!--') ? '-->' : '?>';
    const end = rest.indexOf(close);
    if (end === -1) return rest;
    rest = rest.slice(end + close.length).trimStart();
  }
  return rest;
}

function inferKind(el: Element): 'text' | 'link' | 'image' | 'container' {
  const explicit = el.getAttribute('data-od-edit');
  if (explicit === 'text' || explicit === 'link' || explicit === 'image' || explicit === 'container') return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return 'link';
  if (tag === 'img') return 'image';
  if (['section', 'main', 'nav', 'div', 'article', 'header', 'footer'].includes(tag)) return 'container';
  return 'text';
}

function findEditableElement(doc: Document, id: string): Element | null {
  if (id === '__body__') return doc.body;
  return (
    doc.querySelector(`[data-od-id="${cssEscape(id)}"]`) ??
    doc.querySelector(`[data-od-runtime-id="${cssEscape(id)}"]`) ??
    doc.querySelector(`[data-od-source-path="${cssEscape(id)}"]`) ??
    findElementByPath(doc, id)
  );
}

function applyDynamicBrandKitPatch(doc: Document, patch: ManualEditPatch): { ok: boolean } {
  if (!doc.getElementById('od-brand-payload')) return { ok: false };
  if (patch.kind === 'set-style') {
    setRuntimeStyleOverride(doc, patch.id, patch.styles);
    return { ok: true };
  }
  if (patch.kind === 'remove-element') {
    setRuntimeStyleOverride(doc, patch.id, { display: 'none' } as Partial<ManualEditStyles>);
    return { ok: true };
  }
  return updateBrandKitPayload(doc, patch);
}

function updateBrandKitPayload(doc: Document, patch: ManualEditPatch): { ok: boolean } {
  const script = doc.getElementById('od-brand-payload');
  if (!script) return { ok: false };
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(script.textContent || '{}') as Record<string, unknown>;
  } catch {
    return { ok: false };
  }
  const brand = ensureRecord(payload, 'brand');
  let changed = false;
  if (patch.kind === 'set-text') {
    changed = setBrandKitTextValue(brand, patch.id, patch.value);
  } else if (patch.kind === 'set-link' && patch.id === 'brand-source') {
    brand.sourceUrl = patch.href;
    changed = true;
  } else if (patch.kind === 'set-image') {
    changed = setBrandKitImageValue(brand, patch.id, patch.src, patch.alt);
  }
  if (!changed) return { ok: false };
  script.textContent = safeJsonForScript(payload);
  return { ok: true };
}

function setBrandKitTextValue(brand: Record<string, unknown>, id: string, value: string): boolean {
  if (id === 'brand-name') {
    brand.name = value;
    return true;
  }
  if (id === 'brand-tagline') {
    brand.tagline = value;
    return true;
  }
  if (id === 'brand-description') {
    brand.description = value;
    return true;
  }
  if (id === 'brand-source') {
    brand.sourceUrl = value;
    return true;
  }
  if (id === 'brand-logo-notes') {
    ensureRecord(brand, 'logo').notes = value;
    return true;
  }
  if (id === 'brand-voice-tone') {
    ensureRecord(brand, 'voice').tone = value;
    return true;
  }
  if (id === 'brand-imagery-style') {
    ensureRecord(brand, 'imagery').style = value;
    return true;
  }
  if (id === 'brand-imagery-treatment') {
    ensureRecord(brand, 'imagery').treatment = value;
    return true;
  }
  const colorMatch = id.match(/^brand-color-(hex|name|role|usage)-(\d+)$/);
  if (colorMatch) {
    const colors = ensureArray(brand, 'colors');
    const entry = ensureArrayRecord(colors, Number(colorMatch[2]));
    entry[colorMatch[1]!] = value;
    return true;
  }
  const imageMatch = id.match(/^brand-image-(caption|kind)-(\d+)$/);
  if (imageMatch) {
    const imagery = ensureRecord(brand, 'imagery');
    const samples = ensureArray(imagery, 'samples');
    const entry = ensureArrayRecord(samples, Number(imageMatch[2]));
    entry[imageMatch[1]!] = value;
    return true;
  }
  return false;
}

function setBrandKitImageValue(brand: Record<string, unknown>, id: string, src: string, alt: string): boolean {
  if (id === 'brand-logo-img') {
    const logo = ensureRecord(brand, 'logo');
    logo.primary = src;
    if (alt) logo.notes = alt;
    return true;
  }
  const imageMatch = id.match(/^brand-image-img-(\d+)$/);
  if (!imageMatch) return false;
  const imagery = ensureRecord(brand, 'imagery');
  const samples = ensureArray(imagery, 'samples');
  const entry = ensureArrayRecord(samples, Number(imageMatch[1]));
  entry.file = src;
  if (alt) entry.caption = alt;
  return true;
}

function ensureRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const current = parent[key];
  if (current && typeof current === 'object' && !Array.isArray(current)) return current as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  parent[key] = next;
  return next;
}

function ensureArray(parent: Record<string, unknown>, key: string): unknown[] {
  const current = parent[key];
  if (Array.isArray(current)) return current;
  const next: unknown[] = [];
  parent[key] = next;
  return next;
}

function ensureArrayRecord(array: unknown[], index: number): Record<string, unknown> {
  while (array.length <= index) array.push({});
  const current = array[index];
  if (current && typeof current === 'object' && !Array.isArray(current)) return current as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  array[index] = next;
  return next;
}

function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/<\//g, '<\\/')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function setRuntimeStyleOverride(doc: Document, id: string, styles: Partial<ManualEditStyles>): void {
  const style = runtimeStyleElement(doc);
  const selector = `[data-od-id="${cssStringEscape(id)}"]`;
  const cleaned = removeRuntimeStyleRule(style.textContent ?? '', selector);
  const body = Object.entries(styles)
    .map(([name, value]) => {
      if (typeof value !== 'string' || value.trim() === '') return '';
      return `  ${camelToKebab(name)}: ${value.trim()} !important;`;
    })
    .filter(Boolean)
    .join('\n');
  style.textContent = body ? `${cleaned}\n${selector} {\n${body}\n}\n`.trimStart() : cleaned.trim();
}

function runtimeStyleElement(doc: Document): HTMLStyleElement {
  const existing = doc.querySelector<HTMLStyleElement>('style[data-od-manual-edit-runtime-overrides]');
  if (existing) return existing;
  const style = doc.createElement('style');
  style.setAttribute('data-od-manual-edit-runtime-overrides', '');
  (doc.head || doc.documentElement).appendChild(style);
  return style;
}

function removeRuntimeStyleRule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.replace(new RegExp(`\\n?${escaped}\\s*\\{[^}]*\\}\\s*`, 'g'), '\n').trim();
}

function findElementByPath(doc: Document, id: string): Element | null {
  if (!id.startsWith('path-')) return null;
  const indexes = id
    .slice('path-'.length)
    .split('-')
    .map((part) => Number(part));
  if (indexes.some((index) => !Number.isInteger(index) || index < 0)) return null;
  let current: Element | null = doc.body;
  for (const index of indexes) {
    current = current?.children.item(index) ?? null;
    if (!current) return null;
  }
  return current;
}

function hasElementChildren(el: Element): boolean {
  return Array.from(el.children).some((child) => child.nodeType === 1);
}

function setInlineStyles(el: HTMLElement, styles: Partial<ManualEditStyles>): void {
  for (const [name, value] of Object.entries(styles)) {
    const cssName = camelToKebab(name);
    if (typeof value !== 'string' || value.trim() === '') el.style.removeProperty(cssName);
    else el.style.setProperty(cssName, value.trim());
  }
}

function setAttributes(el: Element, attributes: Record<string, string>): void {
  const protectedAttrs = new Set(['data-od-id', 'data-od-edit', 'data-od-label', 'data-od-runtime-id']);
  for (const [name, value] of Object.entries(attributes)) {
    if (!isSafeAttributeName(name) || protectedAttrs.has(name)) continue;
    if (value.trim() === '') el.removeAttribute(name);
    else el.setAttribute(name, value);
  }
}

function replaceOuterHtml(doc: Document, el: Element, html: string): { ok: true } | { ok: false; error: string } {
  const template = doc.createElement('template');
  template.innerHTML = html.trim();
  const elements = Array.from(template.content.children);
  if (elements.length !== 1) return { ok: false, error: 'Replacement HTML must contain exactly one root element.' };
  const next = elements[0]!;
  if (el.getAttribute('data-od-id') && !next.getAttribute('data-od-id')) {
    next.setAttribute('data-od-id', el.getAttribute('data-od-id') ?? '');
  }
  if (el.getAttribute('data-od-edit') && !next.getAttribute('data-od-edit')) {
    next.setAttribute('data-od-edit', el.getAttribute('data-od-edit') ?? '');
  }
  el.replaceWith(next);
  return { ok: true };
}

function setCssToken(doc: Document, token: string, value: string): boolean {
  const styles = Array.from(doc.querySelectorAll('style'));
  const pattern = new RegExp(`(${escapeRegExp(token)}\\s*:\\s*)([^;]+)(;)`);
  for (const style of styles) {
    const text = style.textContent ?? '';
    if (!pattern.test(text)) continue;
    style.textContent = text.replace(pattern, `$1${value}$3`);
    return true;
  }
  return false;
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
  return value.replace(/"/g, '\\"');
}

function cssStringEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function camelToKebab(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function isSafeAttributeName(value: string): boolean {
  return /^[a-zA-Z_:][a-zA-Z0-9_:.-]*$/.test(value);
}
