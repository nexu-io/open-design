/**
 * Deterministic canonical XML tree for prompt payloads.
 *
 * Prompt bytes are an identity: the same logical input must serialize to the
 * same string forever, and a string read back from storage must either parse to
 * the identical tree or fail closed. That rules out a general XML parser, whose
 * accepted forms are many-to-one. Instead this module defines exactly one legal
 * encoding per tree and parses by consuming that encoding literally.
 *
 * Pure and synchronous by contract: no Node, filesystem, browser, or crypto
 * dependency. Callers that need a digest hash the returned string themselves.
 */

/** A leaf carrying opaque text. Text is always CDATA-wrapped, never entity-escaped. */
export interface CanonicalXmlTextNode {
  kind: 'text';
  tag: string;
  attributes?: ReadonlyArray<readonly [string, string]>;
  text: string;
}

/** A branch carrying ordered child nodes and no text of its own. */
export interface CanonicalXmlElementNode {
  kind: 'element';
  tag: string;
  attributes?: ReadonlyArray<readonly [string, string]>;
  children: ReadonlyArray<CanonicalXmlNode>;
}

/** A presence marker: the tag and its attributes are the whole payload. */
export interface CanonicalXmlMarkerNode {
  kind: 'marker';
  tag: string;
  attributes?: ReadonlyArray<readonly [string, string]>;
}

export type CanonicalXmlNode =
  | CanonicalXmlTextNode
  | CanonicalXmlElementNode
  | CanonicalXmlMarkerNode;

const INDENT_UNIT = '  ';
const TAG_PATTERN = /^[a-z][a-z0-9_]*$/;
const ATTRIBUTE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const XML_ATTRIBUTE_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
};

/**
 * Reject every code point XML 1.0 forbids and normalize newlines, so the same
 * logical text cannot produce two different byte strings.
 */
export function assertCanonicalXmlText(value: string, field: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(field + ' must be a string.');
  }
  const normalized = value.replace(/\r\n?/g, '\n');
  for (const character of normalized) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint === 0x09
      || codePoint === 0x0a
      || (codePoint >= 0x20 && codePoint <= 0xd7ff)
      || (codePoint >= 0xe000 && codePoint <= 0xfffd)
      || (codePoint >= 0x10000 && codePoint <= 0x10ffff)
    ) {
      continue;
    }
    throw new TypeError(field + ' contains a character forbidden by XML 1.0.');
  }
  return normalized;
}

function assertTag(tag: string, field: string): string {
  if (!TAG_PATTERN.test(tag)) {
    throw new TypeError(field + ' must be a lowercase snake_case XML tag.');
  }
  return tag;
}

function escapeAttribute(value: string, field: string): string {
  return assertCanonicalXmlText(value, field)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function unescapeAttribute(value: string, field: string): string {
  if (/&(?!amp;|apos;|gt;|lt;|quot;)/.test(value)) {
    throw new TypeError(field + ' contains an unsupported or unescaped XML entity.');
  }
  const decoded = value.replace(/&([a-z]+);/g, (_whole, entity: string) => {
    const replacement = XML_ATTRIBUTE_ENTITIES[entity];
    if (replacement === undefined) {
      throw new TypeError(field + ' contains an unsupported XML entity.');
    }
    return replacement;
  });
  return assertCanonicalXmlText(decoded, field);
}

/**
 * A newline inside an attribute would survive escaping but break the
 * one-attribute-list-per-line canonical form, so it is rejected outright.
 */
function renderAttributes(
  attributes: ReadonlyArray<readonly [string, string]> | undefined,
  field: string,
): string {
  if (!attributes || attributes.length === 0) return '';
  const seen = new Set<string>();
  return attributes
    .map(([name, value]) => {
      if (!ATTRIBUTE_NAME_PATTERN.test(name)) {
        throw new TypeError(field + ' has a non-canonical attribute name: ' + name + '.');
      }
      if (seen.has(name)) {
        throw new TypeError(field + ' repeats attribute ' + name + '.');
      }
      seen.add(name);
      const escaped = escapeAttribute(value, field + '@' + name);
      if (escaped.includes('\n')) {
        throw new TypeError(field + '@' + name + ' must not contain a newline.');
      }
      return ' ' + name + '="' + escaped + '"';
    })
    .join('');
}

/**
 * Split `]]>` across two adjacent CDATA sections. The parser rejoins adjacent
 * sections, so the round trip is lossless and no content can close the section
 * early.
 */
function renderCdata(value: string, field: string): string {
  const text = assertCanonicalXmlText(value, field);
  return '<![CDATA[' + text.replaceAll(']]>', ']]]]><![CDATA[>') + ']]>';
}

/**
 * Identity of a child within its parent: the tag plus its attribute list. Two
 * siblings may share a tag as long as their attributes differ, which is what
 * makes keyed lists (`<stage name>`, `<atom name>`) expressible.
 */
function childSignature(node: CanonicalXmlNode): string {
  const attributes = (node.attributes ?? [])
    .map(([name, value]) => name + '=' + value)
    .join(' ');
  return attributes ? node.tag + '[' + attributes + ']' : node.tag;
}

function renderNode(node: CanonicalXmlNode, depth: number, path: string): string {
  const indent = INDENT_UNIT.repeat(depth);
  const tag = assertTag(node.tag, path);
  const attributes = renderAttributes(node.attributes, path);
  if (node.kind === 'marker') {
    return indent + '<' + tag + attributes + ' />';
  }
  if (node.kind === 'text') {
    return indent + '<' + tag + attributes + '>\n'
      + indent + INDENT_UNIT + renderCdata(node.text, path) + '\n'
      + indent + '</' + tag + '>';
  }
  if (node.children.length === 0) {
    throw new TypeError(
      path + ' is an element with no children; use a marker node instead.',
    );
  }
  const seen = new Set<string>();
  const children = node.children.map((child, index) => {
    // Repeated tags are legal for keyed lists such as `stage`/`atom`, which are
    // distinguished by their attributes. Only an exact head collision — same
    // tag and same attributes — is ambiguous.
    const signature = childSignature(child);
    if (seen.has(signature)) {
      throw new TypeError(path + ' repeats child ' + signature + '.');
    }
    seen.add(signature);
    return renderNode(child, depth + 1, path + '/' + (child.tag || '[' + index + ']'));
  });
  return indent + '<' + tag + attributes + '>\n'
    + children.join('\n') + '\n'
    + indent + '</' + tag + '>';
}

/** Serialize a tree to its single legal encoding. */
export function serializeCanonicalXml(root: CanonicalXmlNode): string {
  return renderNode(root, 0, root.tag);
}

/**
 * Literal-consuming cursor. Every `expect` is an exact byte match, so leading
 * whitespace, drifted indentation, reordered attributes, or a second root all
 * fail rather than being silently accepted.
 */
class CanonicalXmlCursor {
  private offset = 0;

  constructor(private readonly source: string) {}

  get position(): number {
    return this.offset;
  }

  get done(): boolean {
    return this.offset >= this.source.length;
  }

  expect(literal: string): void {
    if (!this.source.startsWith(literal, this.offset)) {
      throw new TypeError(
        'Non-canonical XML at offset ' + this.offset + '; expected ' + JSON.stringify(literal) + '.',
      );
    }
    this.offset += literal.length;
  }

  peek(literal: string): boolean {
    return this.source.startsWith(literal, this.offset);
  }

  readUntil(suffix: string, field: string): string {
    const end = this.source.indexOf(suffix, this.offset);
    if (end < 0) throw new TypeError(field + ' is missing its closing delimiter.');
    const value = this.source.slice(this.offset, end);
    this.offset = end + suffix.length;
    return value;
  }

  readCdata(field: string): string {
    const chunks: string[] = [];
    do {
      this.expect('<![CDATA[');
      const end = this.source.indexOf(']]>', this.offset);
      if (end < 0) throw new TypeError(field + ' has an unterminated CDATA section.');
      chunks.push(this.source.slice(this.offset, end));
      this.offset = end + 3;
    } while (this.peek('<![CDATA['));
    return assertCanonicalXmlText(chunks.join(''), field);
  }
}

function parseAttributes(
  raw: string,
  field: string,
): ReadonlyArray<readonly [string, string]> {
  if (raw === '') return [];
  const attributes: Array<readonly [string, string]> = [];
  let rest = raw;
  while (rest !== '') {
    const match = /^ ([a-z][a-z0-9_]*)="([^"]*)"/.exec(rest);
    if (!match) {
      throw new TypeError(field + ' has a non-canonical attribute list.');
    }
    attributes.push([match[1]!, unescapeAttribute(match[2]!, field + '@' + match[1])]);
    rest = rest.slice(match[0].length);
  }
  return attributes;
}

function parseNode(
  cursor: CanonicalXmlCursor,
  depth: number,
  path: string,
): CanonicalXmlNode {
  const indent = INDENT_UNIT.repeat(depth);
  cursor.expect(indent + '<');
  const head = cursor.readUntil('>', path);
  const marker = head.endsWith(' /');
  const body = marker ? head.slice(0, -2) : head;
  const nameEnd = body.search(/[ ]/);
  const tag = assertTag(nameEnd < 0 ? body : body.slice(0, nameEnd), path);
  const attributes = parseAttributes(nameEnd < 0 ? '' : body.slice(nameEnd), path + '<' + tag + '>');
  const nodePath = path === tag ? tag : path;
  if (marker) {
    return attributes.length > 0
      ? { kind: 'marker', tag, attributes }
      : { kind: 'marker', tag };
  }
  cursor.expect('\n');
  if (cursor.peek(indent + INDENT_UNIT + '<![CDATA[')) {
    cursor.expect(indent + INDENT_UNIT);
    const text = cursor.readCdata(nodePath);
    cursor.expect('\n' + indent + '</' + tag + '>');
    return attributes.length > 0
      ? { kind: 'text', tag, attributes, text }
      : { kind: 'text', tag, text };
  }
  const children: CanonicalXmlNode[] = [];
  const seen = new Set<string>();
  for (;;) {
    const child = parseNode(cursor, depth + 1, nodePath + '/*');
    const signature = childSignature(child);
    if (seen.has(signature)) {
      throw new TypeError(nodePath + ' repeats child ' + signature + '.');
    }
    seen.add(signature);
    children.push(child);
    if (cursor.peek('\n' + indent + '</' + tag + '>')) break;
    cursor.expect('\n');
  }
  cursor.expect('\n' + indent + '</' + tag + '>');
  return attributes.length > 0
    ? { kind: 'element', tag, attributes, children }
    : { kind: 'element', tag, children };
}

/**
 * Parse the single legal encoding, then prove canonicality by re-serializing:
 * anything the cursor tolerated but that would not round-trip is rejected here.
 */
export function parseCanonicalXml(source: string): CanonicalXmlNode {
  if (typeof source !== 'string') {
    throw new TypeError('Canonical XML source must be a string.');
  }
  const cursor = new CanonicalXmlCursor(source);
  const root = parseNode(cursor, 0, 'root');
  if (!cursor.done) {
    throw new TypeError('Canonical XML has bytes outside its root at offset ' + cursor.position + '.');
  }
  if (serializeCanonicalXml(root) !== source) {
    throw new TypeError('Canonical XML is not in canonical form.');
  }
  return root;
}

/** Narrow a node to a text leaf, or throw naming the offending path. */
export function requireCanonicalXmlText(
  node: CanonicalXmlNode | undefined,
  field: string,
): CanonicalXmlTextNode {
  if (!node || node.kind !== 'text') {
    throw new TypeError(field + ' must be a text node.');
  }
  return node;
}

/** Narrow a node to a branch, or throw naming the offending path. */
export function requireCanonicalXmlElement(
  node: CanonicalXmlNode | undefined,
  field: string,
): CanonicalXmlElementNode {
  if (!node || node.kind !== 'element') {
    throw new TypeError(field + ' must be an element node.');
  }
  return node;
}

/** Read one attribute value, or throw naming the offending path. */
export function requireCanonicalXmlAttribute(
  node: CanonicalXmlNode,
  name: string,
  field: string,
): string {
  const found = node.attributes?.find(([attribute]) => attribute === name);
  if (!found) {
    throw new TypeError(field + ' is missing the ' + name + ' attribute.');
  }
  return found[1];
}

/** Index a branch's children by tag, rejecting any tag outside `allowed`. */
export function indexCanonicalXmlChildren(
  node: CanonicalXmlElementNode,
  allowed: ReadonlyArray<string>,
  field: string,
): ReadonlyMap<string, CanonicalXmlNode> {
  const permitted = new Set(allowed);
  const index = new Map<string, CanonicalXmlNode>();
  let previous = -1;
  for (const child of node.children) {
    if (!permitted.has(child.tag)) {
      throw new TypeError(field + ' has an unexpected child: ' + child.tag + '.');
    }
    const position = allowed.indexOf(child.tag);
    if (position <= previous) {
      throw new TypeError(field + ' children are out of canonical order at ' + child.tag + '.');
    }
    previous = position;
    index.set(child.tag, child);
  }
  return index;
}
