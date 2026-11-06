import type { BoundedJsonObject } from './schema.js';

export const LIVE_ARTIFACT_RENDER_FORMAT = 'html_template_v1' as const;
export const LIVE_ARTIFACT_TEMPLATE_ENTRY = 'template.html' as const;
export const LIVE_ARTIFACT_DATA_ENTRY = 'data.json' as const;
export const LIVE_ARTIFACT_GENERATED_PREVIEW_ENTRY = 'index.html' as const;

export interface LiveArtifactRenderInput {
  templateHtml: string;
  dataJson: BoundedJsonObject;
}

export interface LiveArtifactRenderOutput {
  html: string;
}

const TEMPLATE_INTERPOLATION = /{{\s*([^{}]+?)\s*}}/g;
const RAW_TEMPLATE_INTERPOLATION = /{{{[^{}]*}}}|{{\s*&[^{}]*}}/;
const TEMPLATE_PATH = /^(?:data|[A-Za-z_][A-Za-z0-9_]*)(?:\.(?:[A-Za-z_][A-Za-z0-9_-]*|\d+))*$/;
// `data-od-repeat="item in data.items"` — one loop variable over one `data.*` array.
const REPEAT_DIRECTIVE = /\s*\bdata-od-repeat\s*=\s*"([^"]*)"/i;
const REPEAT_DIRECTIVE_SPEC = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(data(?:\.(?:[A-Za-z_][A-Za-z0-9_-]*|\d+))*)\s*$/;
const EXECUTABLE_TEMPLATE_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /<\s*script\b/i, message: 'script elements are not supported in live artifact previews' },
  { pattern: /<\s*iframe\b/i, message: 'iframe elements are not supported in live artifact previews' },
  { pattern: /\bsrcdoc\s*=/i, message: 'srcdoc attributes are not supported in live artifact previews' },
  { pattern: /\son[a-z][a-z0-9_-]*\s*=/i, message: 'event handler attributes are not supported in live artifact previews' },
  { pattern: /(?:href|src|action|formaction)\s*=\s*['"]?\s*javascript\s*:/i, message: 'javascript: URLs are not supported in live artifact previews' },
  { pattern: /\bdata-od-(?:html|raw|bind-html)\b/i, message: 'raw HTML insertion directives are not supported' },
];

export function validateHtmlTemplateV1Security(templateHtml: string): void {
  for (const { pattern, message } of EXECUTABLE_TEMPLATE_PATTERNS) {
    if (pattern.test(templateHtml)) throw new Error(message);
  }
}

export function escapeHtmlTemplateValue(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * A binding resolver for one scope. Given a trimmed binding path (e.g.
 * `data.title` or a loop variable path like `item.label`) it returns the
 * already-escaped scalar string to substitute, or throws for an unsupported
 * path. Loop scopes delegate non-matching heads (including `data.*`) to their
 * parent so global bindings keep working inside a repeat.
 */
type BindingResolver = (binding: string) => string;

function walkPath(root: unknown, segments: string[], rawPath: string): unknown {
  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || current === undefined) return '';
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) throw new Error(`invalid array segment in template binding path: ${rawPath}`);
      current = current[Number(segment)];
      continue;
    }
    if (typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[segment];
  }
  return current ?? '';
}

function readTemplatePath(dataJson: BoundedJsonObject, rawPath: string): unknown {
  const segments = rawPath.split('.');
  if (segments.shift() !== 'data') throw new Error(`unsupported template binding path: ${rawPath}`);
  return walkPath(dataJson, segments, rawPath);
}

function scalarOrThrow(value: unknown, binding: string): string {
  if (Array.isArray(value) || (value !== null && typeof value === 'object')) {
    throw new Error(`template binding must resolve to a scalar: ${binding}`);
  }
  return escapeHtmlTemplateValue(value);
}

function rootResolver(dataJson: BoundedJsonObject): BindingResolver {
  return (binding) => {
    if (!TEMPLATE_PATH.test(binding) || !binding.startsWith('data')) {
      throw new Error(`invalid template binding path: ${binding}`);
    }
    return scalarOrThrow(readTemplatePath(dataJson, binding), binding);
  };
}

function childResolver(parent: BindingResolver, varName: string, item: unknown): BindingResolver {
  return (binding) => {
    if (!TEMPLATE_PATH.test(binding)) throw new Error(`invalid template binding path: ${binding}`);
    const segments = binding.split('.');
    if (segments[0] !== varName) return parent(binding);
    return scalarOrThrow(walkPath(item, segments.slice(1), binding), binding);
  };
}

function interpolateScalars(fragment: string, resolve: BindingResolver): string {
  return fragment.replace(TEMPLATE_INTERPOLATION, (_match, rawBinding: string) => resolve(rawBinding.trim()));
}

/** Index of the `>` that closes the tag opening at `start`, respecting quotes. */
function findTagEnd(html: string, start: number): number {
  let quote: string | null = null;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '>') return i;
  }
  throw new Error('unterminated tag in live artifact template');
}

/** Index just past the `</tagName>` that matches the element opened at `openTagEnd`. */
/**
 * Whether `index` falls inside an HTML comment. Comment text is authored
 * content: neither repeat directives nor same-tag tokens inside `<!-- -->`
 * count as structure anywhere the renderer scans. Returns the position just
 * past the comment so scanners can resume after it.
 */
function insideComment(html: string, index: number): { resumeAt: number } | null {
  const start = html.lastIndexOf('<!--', index);
  if (start === -1) return null;
  const end = html.indexOf('-->', start);
  if (end !== -1 && end < index) return null;
  return { resumeAt: end === -1 ? html.length : end + 3 };
}

function findElementEnd(html: string, tagName: string, openTagEnd: number): number {
  const re = new RegExp(`<(/?)${tagName}(?=[\\s/>])`, 'gi');
  re.lastIndex = openTagEnd;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const comment = insideComment(html, m.index);
    if (comment) {
      re.lastIndex = comment.resumeAt;
      continue;
    }
    const tagEnd = findTagEnd(html, m.index);
    if (m[1] === '/') {
      depth -= 1;
      if (depth === 0) return tagEnd + 1;
    } else if (html[tagEnd - 1] !== '/') {
      depth += 1;
    }
    re.lastIndex = tagEnd + 1;
  }
  throw new Error(`unbalanced data-od-repeat element <${tagName}>`);
}

/** Reads a `data-od-repeat` source path to its array, always from the data root. */
type ArrayReader = (arrayPath: string) => unknown[];

/**
 * Render one template fragment against a binding scope, expanding
 * `data-od-repeat` elements left to right. Each repeat element is emitted
 * fully rendered (all its bindings resolved) so substituted data values are
 * never re-scanned by a later interpolation pass — a single-pass invariant
 * that keeps data-supplied `{{...}}`-looking text inert. One level only:
 * a `data-od-repeat` nested inside another is rejected, matching the
 * documented html_template_v1 contract.
 */
/**
 * Locate the next REAL `data-od-repeat` directive at or after `from`. A match
 * is a directive only when it sits inside an element's open tag: the nearest
 * `<` to its left starts a named tag that has not closed yet. Literal
 * `data-od-repeat="..."` text — prose, code samples, comments — is content
 * per the html_template_v1 contract and is skipped, wherever it appears
 * (top level or inside a repeated element's body).
 */
function findRepeatDirective(
  html: string,
  from = 0,
): { openTagStart: number; tagName: string; spec: string; matchEnd: number } | null {
  let cursor = from;
  while (cursor < html.length) {
    const match = REPEAT_DIRECTIVE.exec(html.slice(cursor));
    if (!match) return null;
    const directiveIndex = cursor + match.index;
    const matchEnd = directiveIndex + match[0].length;
    const openTagStart = html.lastIndexOf('<', directiveIndex);
    const nameMatch =
      openTagStart >= 0 ? /^<([A-Za-z][A-Za-z0-9_-]*)/.exec(html.slice(openTagStart)) : null;
    const tagName = nameMatch?.[1];
    // Inside an HTML comment nothing is a directive, even text that looks
    // like a whole `<div data-od-repeat="...">` tag.
    const inComment = insideComment(html, directiveIndex) !== null;
    // Within the open tag, the attribute must start at the top level — a
    // match inside another attribute's quoted value (title='... data-od-
    // repeat="x in y"') is authored text, not a directive.
    const inQuotedAttrValue =
      tagName !== undefined &&
      (() => {
        let quote: string | null = null;
        for (let i = openTagStart; i < directiveIndex; i += 1) {
          const ch = html[i];
          if (quote) {
            if (ch === quote) quote = null;
          } else if (ch === '"' || ch === "'") {
            quote = ch;
          }
        }
        return quote !== null;
      })();
    if (
      tagName &&
      !inComment &&
      !inQuotedAttrValue &&
      !html.slice(openTagStart, directiveIndex).includes('>')
    ) {
      return { openTagStart, tagName, spec: match[1] ?? '', matchEnd };
    }
    cursor = matchEnd;
  }
  return null;
}

function renderFragment(html: string, resolve: BindingResolver, readArray: ArrayReader): string {
  let out = '';
  let cursor = 0;
  while (cursor < html.length) {
    const directive = findRepeatDirective(html, cursor);
    if (!directive) {
      out += interpolateScalars(html.slice(cursor), resolve);
      break;
    }
    const { openTagStart, tagName } = directive;

    const spec = REPEAT_DIRECTIVE_SPEC.exec(directive.spec);
    if (!spec?.[1] || !spec[2]) throw new Error(`invalid data-od-repeat directive: "${directive.spec}" (expected "item in data.path")`);
    const varName = spec[1];
    const arrayPath = spec[2];

    const openTagEnd = findTagEnd(html, openTagStart);
    const selfClosed = html[openTagEnd - 1] === '/';
    const elementEnd = selfClosed ? openTagEnd + 1 : findElementEnd(html, tagName, openTagEnd + 1);
    const element = html.slice(openTagStart, elementEnd);

    // Strip only this element's own directive from its opening tag; a REAL
    // directive anywhere in what remains means a nested repeat, which the
    // contract does not support. Literal mentions inside the repeated body
    // stay inert — same rule as the top-level scan.
    const itemTemplate = element.replace(REPEAT_DIRECTIVE, '');
    if (findRepeatDirective(itemTemplate)) {
      throw new Error('nested data-od-repeat is not supported');
    }

    out += interpolateScalars(html.slice(cursor, openTagStart), resolve);
    for (const item of readArray(arrayPath)) {
      out += renderFragment(itemTemplate, childResolver(resolve, varName, item), readArray);
    }
    cursor = elementEnd;
  }
  return out;
}

export function renderHtmlTemplateV1(input: LiveArtifactRenderInput): LiveArtifactRenderOutput {
  validateHtmlTemplateV1Security(input.templateHtml);

  if (RAW_TEMPLATE_INTERPOLATION.test(input.templateHtml)) {
    throw new Error('raw template interpolation is not supported');
  }

  const resolve = rootResolver(input.dataJson);
  const readArray: ArrayReader = (arrayPath) => {
    const value = readTemplatePath(input.dataJson, arrayPath);
    if (!Array.isArray(value)) throw new Error(`data-od-repeat source is not an array: ${arrayPath}`);
    return value;
  };

  return { html: renderFragment(input.templateHtml, resolve, readArray) };
}
