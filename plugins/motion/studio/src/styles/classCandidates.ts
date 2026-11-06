// Pulls Tailwind class candidates out of a TS/TSX file: only strings unambiguously used as class lists
// (className/class attributes, cn/clsx/cva-style calls, `*class` properties, identifiers those use,
// `*Styles`/`*Classes` bindings). Bare strings are ignored so prose and paths never become "classes".
// Pure: text in, candidates out.

import { escapeRegex } from "../utils/sourcePatcher";

/** A class candidate and where it came from. */
export interface ClassCandidate {
  /** The utility with its variant prefixes removed (`hover:bg-x` -> `bg-x`). */
  readonly base: string;
  /** The token exactly as it was written, for the failure message. */
  readonly raw: string;
  /** True when the utility carries a bracketed arbitrary value. */
  readonly arbitrary: boolean;
}

const OPEN: Record<string, string> = { "{": "}", "(": ")", "[": "]" };

// Index of the last char of the non-code span (string, template, line or block comment) starting at
// `i`, else -1. Known limit: a regex literal containing a quote reads as a string; the cost is a
// spurious candidate, which the gate reports.
function endOfSpan(text: string, i: number): number {
  const ch = text[i];
  if (ch === '"' || ch === "'" || ch === "`") {
    return Math.min(endOfString(text, i), text.length - 1);
  }
  if (ch !== "/") return -1;
  if (text[i + 1] === "/") {
    const end = text.indexOf("\n", i);
    return end === -1 ? text.length - 1 : end - 1;
  }
  if (text[i + 1] === "*") {
    const end = text.indexOf("*/", i + 2);
    return end === -1 ? text.length - 1 : end + 1;
  }
  return -1;
}

// Index just past the region starting at `start` (an opening bracket), skipping strings, templates
// and comments; `text.length` when it never closes.
function endOfRegion(text: string, start: number): number {
  const stack: string[] = [];
  for (let i = start; i < text.length; i += 1) {
    const span = endOfSpan(text, i);
    if (span >= i) {
      i = span;
      continue;
    }
    const ch = text[i];
    if (OPEN[ch]) {
      stack.push(OPEN[ch]);
    } else if (stack.length > 0 && ch === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return i + 1;
    }
  }
  return text.length;
}

/** Index of the closing quote of the string that opens at `start`. */
function endOfString(text: string, start: number): number {
  const quote = text[start];
  for (let i = start + 1; i < text.length; i += 1) {
    if (text[i] === "\\") {
      i += 1;
      continue;
    }
    if (text[i] === quote) return i;
    if (quote === "`" && text[i] === "$" && text[i + 1] === "{") {
      i = endOfRegion(text, i + 1) - 1;
    }
  }
  return text.length;
}

// Splits a template literal body into safe chunks. A chunk touching an interpolation is dropped at
// that edge (`w-${size}` claims no class `w-`) unless whitespace separates it from the hole.
function templateChunks(body: string): string[] {
  const chunks: string[] = [];
  let cursor = 0;
  let precededByHole = false;
  while (cursor <= body.length) {
    const hole = body.indexOf("${", cursor);
    const end = hole === -1 ? body.length : hole;
    let chunk = body.slice(cursor, end);
    if (precededByHole && !/^\s/.test(chunk)) chunk = chunk.replace(/^\S+/, "");
    if (hole !== -1 && !/\s$/.test(chunk)) chunk = chunk.replace(/\S+$/, "");
    chunks.push(chunk);
    if (hole === -1) break;
    cursor = endOfRegion(body, hole + 1);
    precededByHole = true;
  }
  return chunks;
}

// A same-length copy with comment and string bodies blanked, so offsets line up. Anchors match
// against it to keep out prose (one apostrophe in a comment opens a string that swallows the rest)
// and generated code (`captions/generator.ts` writes `x.className = 'word'` into a string).
function maskLiterals(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const span = endOfSpan(text, i);
    if (span < i) {
      out += text[i];
      continue;
    }
    // A comment goes entirely, newlines kept so line numbers survive. A string
    // keeps its quotes, so the region scan still finds where it ends.
    const body = " ".repeat(span - i - 1);
    out +=
      text[i] === "/"
        ? text.slice(i, span + 1).replace(/[^\n]/g, " ")
        : text[i] + body + text[span];
    i = span;
  }
  return out;
}

// `activeTool === "razor" ? a : b` inside a `className=` region: the operand
// of a comparison is a value being tested, never a class list.
const COMPARISON = /(?:[=!]==?|\bcase)\s*$/;
// A class list never carries a declaration, so `position: absolute; ...` in a
// constant called `visualStyles` is a stylesheet, not classes.
const CSS_TEXT = /[a-z-]+\s*:\s*[^;]+;/;
// The calls whose arguments are class lists.
const CLASS_BUILDER = /^(?:cn|clsx|classnames|classNames|twMerge|twJoin|cva|tv)$/;

// Written with escapes, not literal quotes: `maskLiterals` reads a quote in
// a regular-expression literal as the start of a string, and this file is
// one of the files the gate scans.
const CLOSE = /[)\]}]/;
const QUOTE = /[\u0022\u0027\u0060]/;

/**
 * A string is a class list unless it is being compared against or is a sheet
 * of CSS text.
 */
function isClassList(mask: string, start: number, i: number, body: string): boolean {
  return !COMPARISON.test(mask.slice(Math.max(start, i - 8), i)) && !CSS_TEXT.test(body);
}

/**
 * Does a string inside the bracket that opens at `i` hold classes? A bracket opened by a
 * non-class-builder name closes the door: `T[f.inlineStyles["font-weight"]]` has a lookup key.
 */
function opensClassContext(mask: string, from: number, i: number): boolean {
  const name = /([A-Za-z_$][\w$]*)\s*$/.exec(mask.slice(Math.max(from, i - 40), i))?.[1];
  return name === undefined || CLASS_BUILDER.test(name);
}

/**
 * Every string and template body inside a source region. Where the strings are
 * is decided on the mask; what they contain is read from the real text.
 */
function stringsIn(text: string, mask: string, start: number, end: number): string[] {
  const found: string[] = [];
  const classy: boolean[] = [];
  for (let i = start; i < end; i += 1) {
    const ch = mask[i];
    if (OPEN[ch]) classy.push(opensClassContext(mask, start, i));
    else if (CLOSE.test(ch)) classy.pop();
    else if (QUOTE.test(ch)) {
      const close = endOfString(mask, i);
      const body = text.slice(i + 1, close);
      if (classy.at(-1) !== false && isClassList(mask, start, i, body)) {
        found.push(...(ch === "`" ? templateChunks(body) : [body]));
      }
      i = close;
    }
  }
  return found;
}

/** Split on `:` that sits outside brackets, so `[&:hover]:x` yields `x`. */
function stripVariants(token: string): string {
  let depth = 0;
  let last = 0;
  for (let i = 0; i < token.length; i += 1) {
    const ch = token[i];
    if (ch === "[" || ch === "(") depth += 1;
    else if (ch === "]" || ch === ")") depth -= 1;
    else if (ch === ":" && depth === 0) last = i + 1;
  }
  return token.slice(last);
}

// A utility starts with a letter, a digit, `-` (negative), `@` (container
// query) or `[` (fully arbitrary), and never contains a quote or a backslash.
// The quotes are written as escapes so this file can be read by its own
// comment stripper, which treats a quote in a regex literal as a string.
const TOKEN = /^[-@[a-z0-9][^\s\u0022\u0027\u0060\\]*$/;

// Class contexts: each anchor's balanced region is read for strings. The first `CLASS_POSITIONS` are
// places a class lands, so identifiers used inside them are followed to their bindings.
const ANCHORS = [
  // className={...} / className="..." / class="..."
  /\bclass(?:Name)?\s*=\s*/g,
  // cn("..."), clsx(...), twMerge(...), cva(...)
  /\b(?:cn|clsx|classnames|classNames|twMerge|twJoin|cva|tv)\s*\(/g,
  // { className: "...", itemClass: "..." }
  /\b\w*[Cc]lass(?:Names?)?\s*:\s*/g,
  // const sizeStyles: Record<Size, string> = { ... } / baseClasses = "..." (exported maps used elsewhere)
  // Prefix and plural both required: bare `style=` is the JSX attribute, `fxPresetStyle` is CSS text.
  // The optional group is a type annotation; without it the gap spans `computedStyles["z-index"] !== "auto"`.
  /\b\w+(?:Styles|Classes|ClassNames?)\b(?:\s*:[^=;{}()[\]]*)?\s*=(?!=)\s*/g,
] as const;

const CLASS_POSITIONS = 3;

/** Bare identifiers in a region of the mask; property accesses excluded. */
const REFERENCE = /(?<![.\w$])[A-Za-z_$][\w$]*/g;

// A subscript, i.e. the `[variant]` of `variantStyles[variant]`. In
// `cn(variantStyles[variant])` the class list is the map; the key is a value
// being looked up, and `variant = "secondary"` is a default, not a class.
const SUBSCRIPT = /(?<=[\w$)\]])\s*\[[^[\]]*\]/g;

// End of the bracketed region or string at `at`, else -1: `const styles = getComputedStyle(el)`
// matches the binding-name anchor but is not a class list.
function regionAfter(mask: string, at: number): number {
  if (OPEN[mask[at]]) return endOfRegion(mask, at);
  if (QUOTE.test(mask[at])) return endOfString(mask, at) + 1;
  return -1;
}

/** Split one class list into candidates, keeping the first spelling of each. */
function collect(byRaw: Map<string, ClassCandidate>, list: string): void {
  for (const raw of list.split(/\s+/)) {
    if (raw === "" || !TOKEN.test(raw) || byRaw.has(raw)) continue;
    const base = stripVariants(raw);
    if (base === "") continue;
    byRaw.set(raw, { base, raw, arbitrary: base.includes("[") });
  }
}

// Every `[start, end)` an anchor opens. `lastIndex` jumps past each region so a nested `cn()`
// inside a `className=` is not read twice.
function regionsAfter(mask: string, anchor: RegExp): [number, number][] {
  const pattern = new RegExp(anchor.source, "g");
  const regions: [number, number][] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(mask)) !== null) {
    const start = match.index + match[0].length - (match[0].endsWith("(") ? 1 : 0);
    const end = regionAfter(mask, start);
    if (end <= start) continue;
    regions.push([start, end]);
    pattern.lastIndex = Math.max(pattern.lastIndex, end);
  }
  return regions;
}

// Every string bound to `name` by an assignment in this file. A name with no literal binding
// (parameter, import, call result) yields nothing, so an over-broad reference scan is safe.
function boundStrings(text: string, mask: string, name: string): string[] {
  const anchor = new RegExp(
    `(?<![\\w$])${escapeRegex(name)}(?![\\w$])(?:\\s*:[^=;{}()[\\]]*)?\\s*=(?!=)\\s*`,
  );
  return regionsAfter(mask, anchor).flatMap(([start, end]) => stringsIn(text, mask, start, end));
}

/** Every class candidate claimed by one source file. */
export function extractClassCandidates(source: string): ClassCandidate[] {
  // Anchors and region bounds come from the mask (code only); the strings
  // themselves are read back out of the real text.
  const mask = maskLiterals(source);
  const byRaw = new Map<string, ClassCandidate>();
  const referenced = new Set<string>();
  for (const [index, anchor] of ANCHORS.entries()) {
    for (const [start, end] of regionsAfter(mask, anchor)) {
      for (const text of stringsIn(source, mask, start, end)) collect(byRaw, text);
      if (index >= CLASS_POSITIONS) continue;
      const used = mask.slice(start, end).replace(SUBSCRIPT, "");
      for (const [name] of used.matchAll(REFERENCE)) referenced.add(name);
    }
  }
  for (const name of referenced) {
    for (const text of boundStrings(source, mask, name)) collect(byRaw, text);
  }
  return [...byRaw.values()];
}
