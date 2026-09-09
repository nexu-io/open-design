import {
  MANUAL_EDIT_DISCOVERY_SELECTOR,
  MANUAL_EDIT_GENERATED_SOURCE_PATH_ATTR,
  MANUAL_EDIT_SOURCE_PATH_ATTR,
} from './manual-edit.js';

const DISCOVERY_TAGS = new Set(
  MANUAL_EDIT_DISCOVERY_SELECTOR.split(',').map((selector) => selector.trim().toLowerCase()),
);
const RAW_TEXT_TAGS = new Set([
  'iframe',
  'noembed',
  'noframes',
  'noscript',
  'script',
  'style',
  'textarea',
  'title',
  'xmp',
]);
const SOURCE_PATH_ATTRIBUTE_PATTERN = new RegExp(
  `\\s${MANUAL_EDIT_SOURCE_PATH_ATTR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|=|/?>)`,
  'i',
);
const MAX_BUFFERED_TAG_BYTES = 64 * 1024;

interface OversizedTagState {
  quote: '"' | "'" | null;
  tagName: string;
}

/**
 * Incrementally adds stable, source-order identities to editable authored
 * elements without parsing or retaining the complete HTML document.
 *
 * The annotator deliberately ignores markup-looking text inside comments,
 * raw-text elements, and template contents. A single malformed start tag can
 * retain at most MAX_BUFFERED_TAG_BYTES; after that limit it is passed through
 * unchanged while the scanner continues looking for its closing `>`.
 */
export class ManualEditSourceAnnotator {
  private buffer = '';
  private comment = false;
  private rawTextTag: string | null = null;
  private templateDepth = 0;
  private nextOrdinal = 0;
  private oversizedTag: OversizedTagState | null = null;

  push(chunk: string, final = false): string {
    this.buffer += chunk;
    let output = '';

    while (this.buffer) {
      if (this.oversizedTag) {
        const consumed = consumeOversizedTag(this.buffer, this.oversizedTag.quote);
        output += this.buffer.slice(0, consumed.length);
        this.buffer = this.buffer.slice(consumed.length);
        this.oversizedTag.quote = consumed.quote;
        if (!consumed.closed) break;
        const tagName = this.oversizedTag.tagName;
        this.oversizedTag = null;
        this.enterElementContent(tagName);
        continue;
      }

      if (this.comment) {
        const end = this.buffer.indexOf('-->');
        if (end >= 0) {
          output += this.buffer.slice(0, end + 3);
          this.buffer = this.buffer.slice(end + 3);
          this.comment = false;
          continue;
        }
        if (final) {
          output += this.buffer;
          this.buffer = '';
        } else {
          const safeLength = Math.max(0, this.buffer.length - 2);
          output += this.buffer.slice(0, safeLength);
          this.buffer = this.buffer.slice(safeLength);
        }
        break;
      }

      if (this.rawTextTag) {
        const close = findRawTextClose(this.buffer, this.rawTextTag);
        if (close >= 0) {
          output += this.buffer.slice(0, close);
          this.buffer = this.buffer.slice(close);
          this.rawTextTag = null;
          continue;
        }
        if (final) {
          output += this.buffer;
          this.buffer = '';
        } else {
          const safeLength = Math.max(0, this.buffer.length - this.rawTextTag.length - 3);
          output += this.buffer.slice(0, safeLength);
          this.buffer = this.buffer.slice(safeLength);
        }
        break;
      }

      const tagStart = this.buffer.indexOf('<');
      if (tagStart < 0) {
        output += this.buffer;
        this.buffer = '';
        break;
      }
      if (tagStart > 0) {
        output += this.buffer.slice(0, tagStart);
        this.buffer = this.buffer.slice(tagStart);
        continue;
      }

      if (isPotentialCommentPrefix(this.buffer) && this.buffer.length < 4 && !final) break;
      if (this.buffer.startsWith('<!--')) {
        output += '<!--';
        this.buffer = this.buffer.slice(4);
        this.comment = true;
        continue;
      }

      const tagEnd = findTagEnd(this.buffer);
      if (tagEnd < 0) {
        if (final) {
          output += this.buffer;
          this.buffer = '';
          break;
        }
        if (this.buffer.length <= MAX_BUFFERED_TAG_BYTES) break;

        const startTag = readStartTagName(this.buffer) ?? '';
        if (startTag && this.templateDepth === 0 && DISCOVERY_TAGS.has(startTag)) this.nextOrdinal += 1;
        const consumed = consumeOversizedTag(this.buffer, null);
        output += this.buffer.slice(0, consumed.length);
        this.buffer = this.buffer.slice(consumed.length);
        if (consumed.closed) {
          if (startTag) this.enterElementContent(startTag);
        } else {
          this.oversizedTag = { quote: consumed.quote, tagName: startTag };
        }
        continue;
      }

      const tag = this.buffer.slice(0, tagEnd + 1);
      this.buffer = this.buffer.slice(tagEnd + 1);
      output += this.transformTag(tag);
    }

    return output;
  }

  finish(): string {
    return this.push('', true);
  }

  private transformTag(tag: string): string {
    const endTag = readEndTagName(tag);
    if (endTag) {
      if (endTag === 'template' && this.templateDepth > 0) this.templateDepth -= 1;
      return tag;
    }

    const startTag = readStartTagName(tag);
    if (!startTag) return tag;

    let transformed = tag;
    if (this.templateDepth === 0 && DISCOVERY_TAGS.has(startTag)) {
      const ordinal = this.nextOrdinal++;
      if (!SOURCE_PATH_ATTRIBUTE_PATTERN.test(tag)) {
        transformed = tag.replace(
          /(\s*\/?>)$/u,
          ` ${MANUAL_EDIT_SOURCE_PATH_ATTR}="source-${ordinal}" ${MANUAL_EDIT_GENERATED_SOURCE_PATH_ATTR}$1`,
        );
      }
    }

    this.enterElementContent(startTag);
    return transformed;
  }

  private enterElementContent(tagName: string): void {
    if (tagName === 'template') {
      this.templateDepth += 1;
      return;
    }
    if (RAW_TEXT_TAGS.has(tagName)) this.rawTextTag = tagName;
  }
}

export function annotateManualEditSourceOrdinals(source: string): string {
  const annotator = new ManualEditSourceAnnotator();
  return annotator.push(source, true);
}

function isPotentialCommentPrefix(value: string): boolean {
  return '<!--'.startsWith(value);
}

function readStartTagName(tag: string): string | null {
  const match = /^<\s*([a-zA-Z][^\s/>]*)/u.exec(tag);
  return match?.[1]?.toLowerCase() ?? null;
}

function readEndTagName(tag: string): string | null {
  const match = /^<\s*\/\s*([a-zA-Z][^\s/>]*)/u.exec(tag);
  return match?.[1]?.toLowerCase() ?? null;
}

function findTagEnd(value: string): number {
  let quote: '"' | "'" | null = null;
  for (let index = 1; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return index;
    }
  }
  return -1;
}

function consumeOversizedTag(
  value: string,
  initialQuote: '"' | "'" | null,
): { closed: boolean; length: number; quote: '"' | "'" | null } {
  let quote = initialQuote;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return { closed: true, length: index + 1, quote: null };
    }
  }
  return { closed: false, length: value.length, quote };
}

function findRawTextClose(value: string, tagName: string): number {
  const lower = value.toLowerCase();
  let offset = 0;
  const prefix = `</${tagName}`;
  while (offset < lower.length) {
    const candidate = lower.indexOf(prefix, offset);
    if (candidate < 0) return -1;
    const boundary = lower[candidate + prefix.length];
    if (boundary !== undefined && /[\s/>]/u.test(boundary)) return candidate;
    offset = candidate + prefix.length;
  }
  return -1;
}
