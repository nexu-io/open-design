import type { DeliverableSyntaxSafeFixRule } from '@open-design/contracts';
import { parse, type Token } from 'acorn';

const MAX_LITERAL_LENGTH = 4096;
const MAX_BOUNDARIES = 16;
const MAX_LITERAL_EDITS = 16;
const QUOTE_DIAGNOSTICS = new Set([
  'JS_UNTERMINATED_STRING', 'JS_MISSING_SEMICOLON', 'JS_UNEXPECTED_TOKEN',
]);

interface ParsedPrefix {
  tokens: Token[];
  errorOffset: number | null;
}

function parsedPrefix(source: string): ParsedPrefix {
  const tokens: Token[] = [];
  try {
    parse(source, {
      ecmaVersion: 'latest', sourceType: 'module',
      allowReturnOutsideFunction: true, onToken: tokens,
    });
    return { tokens, errorOffset: null };
  } catch (error) {
    return {
      tokens,
      errorOffset: error instanceof SyntaxError
        ? (error as SyntaxError & { pos?: number }).pos ?? -1 : -1,
    };
  }
}

function inTemplate(tokens: Token[]): boolean {
  const stack: string[] = [];
  for (const token of tokens) {
    const label = token.type.label;
    if (label === '`') {
      if (stack.at(-1) === '`') stack.pop();
      else stack.push(label);
    } else if (['${', '(', '[', '{'].includes(label)) {
      stack.push(label);
    } else if ([')', ']', '}'].includes(label)) {
      stack.pop();
    }
  }
  return stack.includes('`') || stack.includes('${');
}

/**
 * Recognize static HTML tag fragments, not JavaScript expressions pretending
 * to be text. Fragments need not form a DOM tree (string concatenation may
 * split elements), but every tag/attribute is lexically complete. Quotes are
 * allowed only as paired attribute delimiters. No script-bearing attributes,
 * raw-text elements, comments, escapes or template expressions are accepted.
 */
function staticHtmlFragment(text: string): boolean {
  if (!text.includes('<') || /[\\`\r\n\u2028\u2029]/u.test(text)) return false;
  let cursor = 0;
  while (cursor < text.length) {
    if (text[cursor] !== '<') {
      if (/['"+{}();]/u.test(text[cursor]!)) return false;
      cursor += 1;
      continue;
    }
    const tag = /^<(\/?)([a-z][a-z0-9-]*)/iu.exec(text.slice(cursor));
    if (!tag || /^(?:script|style|iframe|object|embed|template)$/iu.test(tag[2]!)) return false;
    cursor += tag[0].length;
    const closing = tag[1] === '/';
    const names = new Set<string>();
    while (true) {
      const whitespace = /^[\t ]*/u.exec(text.slice(cursor))![0];
      cursor += whitespace.length;
      if (text[cursor] === '>') { cursor += 1; break; }
      if (!closing && text.startsWith('/>', cursor)) { cursor += 2; break; }
      if (closing || whitespace.length === 0) return false;
      const attribute = /^[a-z_:][a-z0-9_:.-]*/iu.exec(text.slice(cursor));
      if (!attribute) return false;
      const name = attribute[0].toLowerCase();
      if (/^on/iu.test(name) || name === 'srcdoc' || names.has(name)) return false;
      names.add(name);
      cursor += attribute[0].length;
      const afterName = cursor;
      cursor += /^[\t ]*/u.exec(text.slice(cursor))![0].length;
      if (text[cursor] !== '=') { cursor = afterName; continue; }
      cursor += 1;
      cursor += /^[\t ]*/u.exec(text.slice(cursor))![0].length;
      const quote = text[cursor];
      if (quote !== "'" && quote !== '"') return false;
      const end = text.indexOf(quote, cursor + 1);
      if (end < 0) return false;
      const value = text.slice(cursor + 1, end);
      // An opposite quote plus concatenation may be live JS, not attribute
      // text. Never absorb e.g. data-x="' + lookup() + '" into one literal.
      // Static CSS var(...) / declarations remain allowed; interpolation and
      // quoted or concatenated attribute payloads are deliberately unsupported.
      if (/[<>`\\'"+{}]/u.test(value) || /javascript:/iu.test(value)) return false;
      cursor = end + 1;
    }
  }
  return true;
}

function plainStaticText(text: string): boolean {
  return text.length > 0 && /^[\p{L}\p{N}\p{M}\p{Zs}.,!?，。！？:：%¥€£\-_/]*$/u.test(text);
}

export interface LocalStringQuotePatch {
  content: string;
  rule: DeliverableSyntaxSafeFixRule;
  editCount: number;
}

/**
 * A bounded local correction, not general error recovery or a semantic proof.
 * Acorn must agree with the strict checker's first failure. A candidate must
 * become exactly one string token with the intended static payload, preserve
 * every preceding token, and parse past its closing boundary. Later original
 * errors may remain; the caller still requires a full strict recheck before
 * any bytes reach disk. Multiple eligible candidates are refused.
 */
export function proposeLocalStringQuotePatch(
  source: string, offset: number, diagnosticCode: string,
): LocalStringQuotePatch | null {
  if (!QUOTE_DIAGNOSTICS.has(diagnosticCode)) return null;
  const original = parsedPrefix(source);
  if (original.errorOffset !== offset) return null;
  const last = original.tokens.at(-1);
  const start = diagnosticCode === 'JS_UNTERMINATED_STRING'
    ? offset : last?.type.label === 'string' && last.end === offset ? last.start : -1;
  const opening = source[start];
  if (start < 0 || (opening !== "'" && opening !== '"')) return null;
  const before = original.tokens.filter((token) => token.end <= start);
  if (inTemplate(before)) return null;
  const lineEndMatch = /[\r\n\u2028\u2029]/u.exec(source.slice(start));
  const lineEnd = lineEndMatch ? start + lineEndMatch.index : source.length;
  const limit = Math.min(lineEnd, start + MAX_LITERAL_LENGTH + 2);
  const candidates: LocalStringQuotePatch[] = [];
  let parseableBoundaries = 0;
  let boundaryCount = 0;
  for (let end = start + 1; end < limit; end += 1) {
    const closing = source[end];
    if (closing !== "'" && closing !== '"') continue;
    if (!/^[\t ]*(?:[+,:;?)\]}]|$)/u.test(source.slice(end + 1, lineEnd))) continue;
    boundaryCount += 1;
    if (boundaryCount > MAX_BOUNDARIES) return null;
    const payload = source.slice(start + 1, end);
    if (/[\\`\r\n\u2028\u2029]/u.test(payload)) continue;
    let replacement: string;
    let rule: DeliverableSyntaxSafeFixRule;
    let editCount: number;
    let supportedPayload = true;
    if (closing !== opening && diagnosticCode === 'JS_UNTERMINATED_STRING') {
      if (payload.includes(opening)) continue;
      // Count alternative parseable boundaries even when their payload is not
      // in our allowlist. Otherwise 'a" + "b" could be guessed as either a
      // concatenation or one larger literal merely by filtering the latter out.
      supportedPayload = plainStaticText(payload) || staticHtmlFragment(payload);
      replacement = opening + payload + opening;
      rule = 'normalize_mismatched_string_quote';
      editCount = 1;
    } else if (closing === opening && payload.includes(opening) && staticHtmlFragment(payload)) {
      editCount = payload.split(opening).length - 1;
      if (editCount > MAX_LITERAL_EDITS) continue;
      replacement = opening + payload.replaceAll(opening, `\\${opening}`) + opening;
      rule = 'normalize_html_attribute_quotes';
    } else {
      continue;
    }
    const content = source.slice(0, start) + replacement + source.slice(end + 1);
    const parsed = parsedPrefix(content);
    const newEnd = start + replacement.length;
    if (parsed.errorOffset !== null && parsed.errorOffset <= newEnd) continue;
    const literal = parsed.tokens.find((token) => token.start === start);
    if (literal?.type.label !== 'string' || literal.end !== newEnd
      || !('value' in literal) || literal.value !== payload) continue;
    const prefix = parsed.tokens.filter((token) => token.end <= start);
    if (prefix.length !== before.length || prefix.some((token, index) => (
      token.start !== before[index]!.start || token.end !== before[index]!.end
      || token.type.label !== before[index]!.type.label
    ))) continue;
    parseableBoundaries += 1;
    if (supportedPayload) candidates.push({ content, rule, editCount });
  }
  return parseableBoundaries === 1 && candidates.length === 1 ? candidates[0]! : null;
}
