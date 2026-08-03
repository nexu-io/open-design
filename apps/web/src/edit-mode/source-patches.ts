import { emptyManualEditStyles, MANUAL_EDIT_STYLE_PROPS, type ManualEditFields, type ManualEditPatch, type ManualEditStyles } from './types';

const MANUAL_EDIT_RUNTIME_OVERRIDES_ID = 'od-manual-edit-runtime-overrides';
const MANUAL_EDIT_RUNTIME_APPLY_ID = 'od-manual-edit-runtime-apply';
const RUNTIME_OVERRIDE_APPLIER_SOURCE = `
(function () {
  function readOverrides() {
    var node = document.getElementById('od-manual-edit-runtime-overrides');
    if (!node) return {};
    try {
      var parsed = JSON.parse(node.textContent || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }
  function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/"/g, '\\\\"');
  }
  function byId(id) {
    return document.querySelector('[data-od-id="' + cssEscape(id) + '"]');
  }
  function textValue(value) {
    return value == null ? '' : String(value);
  }
  function applyAll() {
    var data = readOverrides();
    Object.keys(data.text || {}).forEach(function (id) {
      var el = byId(id);
      var value = textValue(data.text[id]);
      if (el && el.textContent !== value) el.textContent = value;
    });
    Object.keys(data.links || {}).forEach(function (id) {
      var el = byId(id);
      var value = data.links[id] || {};
      if (!el) return;
      var text = textValue(value.text);
      var href = textValue(value.href);
      if (el.textContent !== text) el.textContent = text;
      if (href && el.getAttribute('href') !== href) el.setAttribute('href', href);
    });
    Object.keys(data.images || {}).forEach(function (id) {
      var el = byId(id);
      var value = data.images[id] || {};
      if (!el) return;
      var src = textValue(value.src);
      var alt = textValue(value.alt);
      if (src && el.getAttribute('src') !== src) el.setAttribute('src', src);
      if (el.getAttribute('alt') !== alt) el.setAttribute('alt', alt);
    });
    Object.keys(data.attrs || {}).forEach(function (id) {
      var el = byId(id);
      var attrs = data.attrs[id] || {};
      if (!el) return;
      Object.keys(attrs).forEach(function (name) {
        if (!/^[a-zA-Z_:][a-zA-Z0-9_:.-]*$/.test(name)) return;
        if (/^data-od-/.test(name)) return;
        var value = textValue(attrs[name]);
        if (value.trim() === '') {
          if (el.hasAttribute(name)) el.removeAttribute(name);
        } else if (el.getAttribute(name) !== value) {
          el.setAttribute(name, value);
        }
      });
    });
    Object.keys(data.innerHtml || {}).forEach(function (id) {
      var el = byId(id);
      if (!el) return;
      var value = textValue(data.innerHtml[id]);
      if (el.innerHTML !== value) el.innerHTML = value;
    });
    Object.keys(data.html || {}).forEach(function (id) {
      var el = byId(id);
      if (!el) return;
      var template = document.createElement('template');
      template.innerHTML = textValue(data.html[id]);
      if (template.content.children.length !== 1) return;
      var next = template.content.children[0];
      if (!next.getAttribute('data-od-id')) next.setAttribute('data-od-id', id);
      if (el.outerHTML === next.outerHTML) return;
      el.replaceWith(next);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyAll, { once: true });
  else applyAll();
  var root = document.getElementById('root') || document.body;
  if (window.MutationObserver && root) {
    var pending = 0;
    new MutationObserver(function () {
      if (pending) return;
      pending = window.setTimeout(function () {
        pending = 0;
        applyAll();
      }, 0);
    }).observe(root, { childList: true, subtree: true });
  }
})();`;
interface RuntimeContentOverrides {
  text?: Record<string, string>;
  links?: Record<string, { text: string; href: string }>;
  images?: Record<string, { src: string; alt: string }>;
  attrs?: Record<string, Record<string, string>>;
  innerHtml?: Record<string, string>;
  html?: Record<string, string>;
}

type ManualEditElementPatch = Extract<ManualEditPatch, { id: string }>;

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
    if (patch.kind === 'insert-html' || patch.kind === 'duplicate-element') {
      return {
        ok: false,
        source,
        error: 'Structural edits are not supported for runtime-rendered targets.',
      };
    }
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
  } else if (patch.kind === 'set-inner-html') {
    el.innerHTML = sanitizeInnerHtml(doc, patch.html);
  } else if (patch.kind === 'insert-html') {
    const pasted = parseInsertableElement(doc, patch.html);
    if (!pasted) {
      return { ok: false, source, error: 'Pasted HTML must contain exactly one root element.' };
    }
    // A `__body__` anchor appends to the end of the page; every element
    // anchor pastes as the anchor's next sibling (the duplicate-element
    // position contract, so path-id selection hand-off works the same way).
    if (el === doc.body) {
      el.appendChild(pasted);
    } else if (el.parentElement) {
      el.insertAdjacentElement('afterend', pasted);
    } else {
      return { ok: false, source, error: 'Cannot paste next to the root element.' };
    }
  } else if (patch.kind === 'duplicate-element') {
    if (!el.parentElement) {
      return { ok: false, source, error: 'Cannot duplicate the root element.' };
    }
    el.insertAdjacentElement('afterend', cloneWithoutManualEditIdentity(el));
  } else if (patch.kind === 'remove-element') {
    if (!el.parentElement) {
      return { ok: false, source, error: 'Cannot remove the root element.' };
    }
    if (el.parentElement === doc.body && isLastRenderableBodyChild(doc, el)) {
      return { ok: false, source, error: 'Cannot remove the last rendered element in the document.' };
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

export function manualEditTargetHasNestedMarkup(source: string, id: string): boolean {
  const doc = parseSource(source);
  const el = doc ? findEditableElement(doc, id) : null;
  return Boolean(el && hasElementChildren(el));
}

export function readManualEditStyles(source: string, id: string): ManualEditStyles {
  const doc = parseSource(source);
  const el = doc ? findEditableElement(doc, id) : null;
  if (!el) return emptyManualEditStyles();
  return readElementInlineStyles(el);
}

/**
 * The style values SOURCE persists for a target, wherever they live: the
 * element's inline `style` attribute when the target exists in the saved DOM,
 * otherwise the `style[data-od-manual-edit-runtime-overrides]` rule that
 * `set-style` patches write for runtime-only targets (brand-kit ids have no
 * saved markup). History replay must read through this so undo/redo restores
 * the persisted values instead of treating runtime targets as unstyled.
 */
export function readManualEditSavedStyles(source: string, id: string): ManualEditStyles {
  const doc = parseSource(source);
  if (!doc) return emptyManualEditStyles();
  const el = findEditableElement(doc, id);
  if (el) return readElementInlineStyles(el);
  return readRuntimeStyleOverride(doc, id);
}

function readElementInlineStyles(el: Element): ManualEditStyles {
  const style = (el as HTMLElement).style;
  return MANUAL_EDIT_STYLE_PROPS.reduce<ManualEditStyles>((acc, key) => {
    acc[key] = (style[key as unknown as keyof CSSStyleDeclaration] as string | undefined) ?? '';
    return acc;
  }, {} as ManualEditStyles);
}

/** Whether SOURCE is a runtime-rendered brand-kit document — the pages whose
 * manual-edit targets can exist only in the runtime DOM. Saves for such
 * targets persist through the payload or override rules, so an empty
 * saved-markup read must never be classified as "target vanished". This is
 * independent of whether the target currently owns an override rule: clearing
 * a target's last declaration legitimately deletes its rule. */
export function isManualEditRuntimeRenderedSource(source: string): boolean {
  const doc = parseSource(source);
  return Boolean(doc?.getElementById('od-brand-payload'));
}

/** Whether SOURCE persists a runtime style-override rule for the target —
 * the persistence a `set-style` save leaves behind when the target has no
 * saved markup (runtime-only brand-kit ids). */
export function hasManualEditRuntimeStyleOverride(source: string, id: string): boolean {
  const doc = parseSource(source);
  return doc ? runtimeStyleRuleBody(doc, id) != null : false;
}

function runtimeStyleRuleBody(doc: Document, id: string): string | null {
  const css = doc.querySelector('style[data-od-manual-edit-runtime-overrides]')?.textContent ?? '';
  if (!css) return null;
  const selector = `[data-od-id="${cssStringEscape(id)}"]`;
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? null;
}

function readRuntimeStyleOverride(doc: Document, id: string): ManualEditStyles {
  const styles = emptyManualEditStyles();
  for (const [name, value] of parseRuntimeStyleDeclarations(runtimeStyleRuleBody(doc, id))) {
    const key = MANUAL_EDIT_STYLE_PROPS.find((prop) => camelToKebab(prop) === name);
    if (key) styles[key] = value;
  }
  return styles;
}

function parseRuntimeStyleDeclarations(body: string | null): Map<string, string> {
  const declarations = new Map<string, string>();
  if (!body) return declarations;
  for (const declaration of body.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    const name = declaration.slice(0, colon).trim();
    const value = declaration.slice(colon + 1).replace(/!important\s*$/i, '').trim();
    if (name && value) declarations.set(name, value);
  }
  return declarations;
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

/** Read the sanitized rich-text override persisted for a runtime-only target. */
export function readManualEditRuntimeInnerHtml(source: string, id: string): string | null {
  const doc = parseSource(source);
  return doc ? readRuntimeContentOverrides(doc).innerHtml?.[id] ?? null : null;
}

/**
 * Read the exact element markup the reload-time runtime override applier will
 * render. Runtime replacements retain their semantic id even when the user's
 * edited outerHTML omits it, so the live fast path stays addressable too.
 */
export function readManualEditRuntimeOuterHtml(source: string, id: string): string | null {
  const doc = parseSource(source);
  if (!doc) return null;
  const html = readRuntimeContentOverrides(doc).html?.[id];
  if (html == null) return null;
  const template = doc.createElement('template');
  template.innerHTML = html;
  if (template.content.children.length !== 1) return null;
  const next = template.content.children[0]!;
  if (!next.getAttribute('data-od-id')) next.setAttribute('data-od-id', id);
  return next.outerHTML;
}

/**
 * Positional path id (`path-a-b-c`) of an element in a parsed SOURCE document
 * — mirror of `findElementByPath` in reverse, and of the srcDoc build-time
 * annotators. The source is clean (no injected host nodes), so plain
 * `parent.children` indexes are the canonical positions.
 */
function manualEditPositionalPathId(el: Element): string {
  const parts: number[] = [];
  let node: Element | null = el;
  while (node && node !== node.ownerDocument.body) {
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    parts.unshift(Array.prototype.indexOf.call(parent.children, node));
    node = parent;
  }
  return parts.length ? `path-${parts.join('-')}` : '';
}

/** The id a freshly saved element will be addressed by: an authored
 * `data-od-id` when present, otherwise its positional path. */
function manualEditElementId(el: Element): string {
  return el.getAttribute('data-od-id') || manualEditPositionalPathId(el);
}

/**
 * Reads back the element that an `insert-html` / `duplicate-element` patch
 * just placed into the SAVED source: the anchor's next sibling, or the last
 * body child for a `__body__` append. Returns its addressable id (for the
 * selection hand-off) and its saved outerHTML (for the in-place DOM insert),
 * so the live DOM can be reconciled to exactly what the source now holds.
 */
export function readManualEditInsertedSibling(
  source: string,
  anchorId: string,
): { id: string; html: string } | null {
  const doc = parseSource(source);
  if (!doc) return null;
  const inserted = anchorId === '__body__'
    ? doc.body.lastElementChild
    : findEditableElement(doc, anchorId)?.nextElementSibling ?? null;
  if (!inserted) return null;
  const id = manualEditElementId(inserted);
  if (!id) return null;
  return { id, html: inserted.outerHTML };
}

/**
 * How to put a removed element back without reloading the iframe (undo of
 * `remove-element`): read the element from the BEFORE source and describe the
 * insertion. Direct body children retain their exact source child index, so
 * leading non-renderable siblings such as scripts/styles stay ahead of the
 * restored node. Nested nodes restore after their previous sibling when one
 * exists, or at the start of their parent. Returns null when the element
 * cannot be located, in which case the caller falls back to the always-correct
 * frozen-source reload.
 */
export function readManualEditRestoreDescriptor(
  source: string,
  removedId: string,
):
  | { op: 'insert-after' | 'prepend-child'; anchorId: string; html: string }
  | { op: 'insert-at-index'; anchorId: '__body__'; index: number; html: string }
  | null {
  const doc = parseSource(source);
  const el = doc ? findEditableElement(doc, removedId) : null;
  if (!el || el === doc?.body) return null;
  const parent = el.parentElement;
  if (!parent) return null;
  if (parent === doc?.body) {
    const index = Array.prototype.indexOf.call(parent.children, el) as number;
    if (index < 0) return null;
    return { op: 'insert-at-index', anchorId: '__body__', index, html: el.outerHTML };
  }
  const previous = el.previousElementSibling;
  if (previous) {
    const anchorId = manualEditElementId(previous);
    if (!anchorId) return null;
    return { op: 'insert-after', anchorId, html: el.outerHTML };
  }
  const anchorId = manualEditElementId(parent);
  if (!anchorId) return null;
  return { op: 'prepend-child', anchorId, html: el.outerHTML };
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
  if (!manualEditPatchHasId(patch)) return { ok: false };
  return updateBrandKitPayload(doc, patch);
}

function updateBrandKitPayload(doc: Document, patch: ManualEditElementPatch): { ok: boolean } {
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
  if (!changed) return setRuntimeContentOverride(doc, patch);
  clearRuntimeContentOverride(doc, patch.id);
  script.textContent = safeJsonForScript(payload);
  return { ok: true };
}

function manualEditPatchHasId(patch: ManualEditPatch): patch is ManualEditElementPatch {
  return 'id' in patch;
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
  if (id === 'brand-imagery-subjects') {
    ensureRecord(brand, 'imagery').subjects = splitBrandListValue(value);
    return true;
  }
  if (id === 'brand-imagery-avoid') {
    ensureRecord(brand, 'imagery').avoid = splitBrandListValue(value);
    return true;
  }
  const adjectiveMatch = id.match(/^brand-voice-adjective-(\d+)$/);
  if (adjectiveMatch) {
    const voice = ensureRecord(brand, 'voice');
    const adjectives = ensureArray(voice, 'adjectives');
    adjectives[Number(adjectiveMatch[1])] = value;
    return true;
  }
  const pillarMatch = id.match(/^brand-voice-pillar-(\d+)$/);
  if (pillarMatch) {
    const voice = ensureRecord(brand, 'voice');
    const pillars = ensureArray(voice, 'messagingPillars');
    pillars[Number(pillarMatch[1])] = value;
    return true;
  }
  if (id === 'brand-voice-vocab-use' || id === 'brand-voice-vocab-avoid') {
    const vocabulary = ensureRecord(ensureRecord(brand, 'voice'), 'vocabulary');
    vocabulary[id === 'brand-voice-vocab-use' ? 'use' : 'avoid'] = splitBrandListValue(value);
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
  if (id === 'brand-hero-img') {
    const imagery = ensureRecord(brand, 'imagery');
    const samples = ensureArray(imagery, 'samples');
    const entry = ensureArrayRecord(samples, 0);
    entry.file = src;
    if (alt) entry.caption = alt;
    return true;
  }
  const logoThumbMatch = id.match(/^brand-logo-thumb-(\d+)$/);
  if (logoThumbMatch) {
    const logo = ensureRecord(brand, 'logo');
    const index = Number(logoThumbMatch[1]);
    if (index === 0) {
      logo.primary = src;
      if (alt) logo.notes = alt;
      return true;
    }
    const alternates = ensureArray(logo, 'alternates');
    alternates[index - 1] = src;
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

function splitBrandListValue(value: string): string[] {
  return value
    .split(/\s*(?:·|,|，)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function setRuntimeContentOverride(doc: Document, patch: ManualEditPatch): { ok: boolean } {
  const overrides = readRuntimeContentOverrides(doc);
  if (patch.kind === 'set-text') {
    delete overrides.innerHtml?.[patch.id];
    overrides.text = { ...(overrides.text ?? {}), [patch.id]: patch.value };
  } else if (patch.kind === 'set-link') {
    delete overrides.innerHtml?.[patch.id];
    overrides.links = { ...(overrides.links ?? {}), [patch.id]: { text: patch.text, href: patch.href } };
  } else if (patch.kind === 'set-image') {
    overrides.images = { ...(overrides.images ?? {}), [patch.id]: { src: patch.src, alt: patch.alt } };
  } else if (patch.kind === 'set-attributes') {
    overrides.attrs = { ...(overrides.attrs ?? {}), [patch.id]: patch.attributes };
  } else if (patch.kind === 'set-inner-html') {
    delete overrides.text?.[patch.id];
    overrides.innerHtml = {
      ...(overrides.innerHtml ?? {}),
      [patch.id]: sanitizeInnerHtml(doc, patch.html),
    };
  } else if (patch.kind === 'set-outer-html') {
    overrides.html = { ...(overrides.html ?? {}), [patch.id]: patch.html };
  } else {
    return { ok: false };
  }
  writeRuntimeContentOverrides(doc, overrides);
  return { ok: true };
}

function clearRuntimeContentOverride(doc: Document, id: string): void {
  const existing = doc.getElementById(MANUAL_EDIT_RUNTIME_OVERRIDES_ID);
  if (!existing) return;
  const overrides = readRuntimeContentOverrides(doc);
  delete overrides.text?.[id];
  delete overrides.links?.[id];
  delete overrides.images?.[id];
  delete overrides.attrs?.[id];
  delete overrides.innerHtml?.[id];
  delete overrides.html?.[id];
  writeRuntimeContentOverrides(doc, overrides);
}

function readRuntimeContentOverrides(doc: Document): RuntimeContentOverrides {
  const script = doc.getElementById(MANUAL_EDIT_RUNTIME_OVERRIDES_ID);
  if (!script) return {};
  try {
    const parsed = JSON.parse(script.textContent || '{}') as RuntimeContentOverrides;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeRuntimeContentOverrides(doc: Document, overrides: RuntimeContentOverrides): void {
  const script = runtimeOverridesElement(doc);
  script.textContent = safeJsonForScript(pruneRuntimeContentOverrides(overrides));
  ensureRuntimeOverrideApplier(doc);
}

function pruneRuntimeContentOverrides(overrides: RuntimeContentOverrides): RuntimeContentOverrides {
  const next: RuntimeContentOverrides = {};
  if (overrides.text && Object.keys(overrides.text).length > 0) next.text = overrides.text;
  if (overrides.links && Object.keys(overrides.links).length > 0) next.links = overrides.links;
  if (overrides.images && Object.keys(overrides.images).length > 0) next.images = overrides.images;
  if (overrides.attrs && Object.keys(overrides.attrs).length > 0) next.attrs = overrides.attrs;
  if (overrides.innerHtml && Object.keys(overrides.innerHtml).length > 0) next.innerHtml = overrides.innerHtml;
  if (overrides.html && Object.keys(overrides.html).length > 0) next.html = overrides.html;
  return next;
}

function runtimeOverridesElement(doc: Document): HTMLScriptElement {
  const existing = doc.getElementById(MANUAL_EDIT_RUNTIME_OVERRIDES_ID);
  if (existing?.tagName.toLowerCase() === 'script') return existing as HTMLScriptElement;
  const script = doc.createElement('script');
  script.id = MANUAL_EDIT_RUNTIME_OVERRIDES_ID;
  script.type = 'application/json';
  const payload = doc.getElementById('od-brand-payload');
  if (payload?.parentNode) payload.parentNode.insertBefore(script, payload.nextSibling);
  else (doc.head || doc.documentElement).appendChild(script);
  return script;
}

function ensureRuntimeOverrideApplier(doc: Document): void {
  if (doc.getElementById(MANUAL_EDIT_RUNTIME_APPLY_ID)) return;
  const script = doc.createElement('script');
  script.id = MANUAL_EDIT_RUNTIME_APPLY_ID;
  script.textContent = RUNTIME_OVERRIDE_APPLIER_SOURCE;
  (doc.body || doc.documentElement).appendChild(script);
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

/**
 * Persist a `set-style` patch for a runtime-only target by MERGING it into the
 * target's existing override rule. Toolbar autosaves send only the touched
 * properties, so declarations an earlier save persisted must survive a later
 * partial patch; an incoming empty value deletes that declaration only. The
 * rule disappears once its last declaration is deleted.
 */
function setRuntimeStyleOverride(doc: Document, id: string, styles: Partial<ManualEditStyles>): void {
  const style = runtimeStyleElement(doc);
  const selector = `[data-od-id="${cssStringEscape(id)}"]`;
  const merged = parseRuntimeStyleDeclarations(runtimeStyleRuleBody(doc, id));
  for (const [name, value] of Object.entries(styles)) {
    const cssName = camelToKebab(name);
    if (typeof value !== 'string' || value.trim() === '') merged.delete(cssName);
    else merged.set(cssName, value.trim());
  }
  const cleaned = removeRuntimeStyleRule(style.textContent ?? '', selector);
  const body = Array.from(merged, ([name, value]) => `  ${name}: ${value} !important;`).join('\n');
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

const MANUAL_EDIT_IDENTITY_ATTRS = [
  'data-od-id',
  'data-od-runtime-id',
  'data-od-source-path',
  'data-od-edit-selected',
  'data-od-editing',
] as const;

function stripDomAndManualEditIdentity(root: Element | DocumentFragment): void {
  const descendants = Array.from(root.querySelectorAll('*'));
  const nodes = root.nodeType === 1 ? [root as Element, ...descendants] : descendants;
  for (const node of nodes) {
    node.removeAttribute('id');
    for (const attr of MANUAL_EDIT_IDENTITY_ATTRS) node.removeAttribute(attr);
  }
}

/**
 * Deep-clone an element for `duplicate-element`, stripping ordinary HTML ids
 * and every manual-edit identity attribute from the clone and its descendants.
 * Duplicate HTML ids can retarget CSS, scripts, and anchor links, while shared
 * `data-od-id` values make every later patch ambiguous. Freshly stripped clones
 * get re-annotated with stable manual-edit ids on the next preview build.
 */
function cloneWithoutManualEditIdentity(el: Element): Element {
  const clone = el.cloneNode(true) as Element;
  stripDomAndManualEditIdentity(clone);
  return clone;
}

/**
 * Parse the single element an `insert-html` patch pastes, sanitized like an
 * innerHTML commit and stripped of every manual-edit identity attribute so
 * the pasted block can never alias an existing target's ids. Returns null
 * when the HTML does not contain exactly one root element.
 */
function parseInsertableElement(doc: Document, html: string): Element | null {
  const template = doc.createElement('template');
  template.innerHTML = sanitizeInnerHtml(doc, html.trim());
  const elements = Array.from(template.content.children);
  if (elements.length !== 1) return null;
  return cloneWithoutManualEditIdentity(elements[0]!);
}

/**
 * Sanitize an innerHTML commit coming back from the iframe's inline text
 * session. The session only produces text plus inline formatting, so anything
 * executable (scripts, inline handlers, javascript: URLs) is hostile input —
 * strip it rather than persist it into the artifact.
 */
function sanitizeInnerHtml(doc: Document, html: string): string {
  const template = doc.createElement('template');
  template.innerHTML = html;
  for (const node of Array.from(template.content.querySelectorAll('script, style, iframe, object, embed, link, meta'))) {
    node.remove();
  }
  for (const node of Array.from(template.content.querySelectorAll('*'))) {
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) node.removeAttribute(attr.name);
      else if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) node.removeAttribute(attr.name);
    }
  }
  stripDomAndManualEditIdentity(template.content);
  return template.innerHTML;
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

function isLastRenderableBodyChild(doc: Document, el: Element): boolean {
  const renderableBodyChildren = Array.from(doc.body.children).filter((child) => {
    if (child === el) return true;
    return !isNonRenderableBodyChild(child);
  });
  return renderableBodyChildren.length === 1 && renderableBodyChildren[0] === el;
}

function isNonRenderableBodyChild(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  return tag === 'script' || tag === 'style' || tag === 'template' || tag === 'noscript';
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
