// ---------------------------------------------------------------------------
// i18n / en.ts text-quality helpers
// ---------------------------------------------------------------------------
//
// Each helper below targets a specific style rule from the visual text audit
// (docs/visual-text-audit.md § "Style Rules I Inferred"). They all accept the
// raw source text of `apps/web/src/i18n/locales/en.ts` and return an array of
// Match objects describing violations.
//
// Scope is intentionally limited to en.ts. Other locale files are exempt
// because translator-judgment differs per language.

export type EnMatch = {
  /** 1-based line number in the source file where the violation was found. */
  line: number;
  /** The matching text that triggered the rule. */
  value: string;
  /** Short rule identifier for error messages. */
  rule: string;
};

// ---------------------------------------------------------------------------
// Internal: extract key-value pairs from en.ts source
// ---------------------------------------------------------------------------
// The file follows the pattern:
//   'key': 'value'                — single-line
//   'key':                        — value on the next line (possibly multi-line
//       'value continues here'      using string concatenation)
// We use a regex that matches the VALUE string (single or double quoted) so we
// can report the line number of the value, not the key.

type EnEntry = {
  key: string;
  value: string;
  /** 1-based line number of the value string's opening quote. */
  valueLine: number;
};

export function parseEnEntries(source: string): EnEntry[] {
  const lines = source.split('\n');
  const entries: EnEntry[] = [];

  // Regex matches: optional leading whitespace, a quoted key, a colon,
  // optional whitespace, then optionally a quoted value on the same line.
  //
  // We use separate patterns per value-delimiter type because JS regex character
  // classes cannot reference captured groups — [^'"\\] would incorrectly exclude
  // the opposite delimiter from value bodies (e.g. a single-quoted value that
  // contains a literal " would be silently skipped).
  const keyValueSameLine_SQ = /^\s*(['"])((?:[^'"\\]|\\.)*)\1\s*:\s*'((?:[^'\\]|\\.)*)'\s*,?\s*$/;
  const keyValueSameLine_DQ = /^\s*(['"])((?:[^'"\\]|\\.)*)\1\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$/;
  const keyOnly = /^\s*(['"])((?:[^'"\\]|\\.)*)\1\s*:\s*$/;
  const valueOnly_SQ = /^\s*'((?:[^'\\]|\\.)*)'\s*[+,]?\s*$/;
  const valueOnly_DQ = /^\s*"((?:[^"\\]|\\.)*)"\s*[+,]?\s*$/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';

    const sameLine = keyValueSameLine_SQ.exec(line) ?? keyValueSameLine_DQ.exec(line);
    if (sameLine) {
      const key = sameLine[2] ?? '';
      const value = sameLine[3] ?? '';
      entries.push({ key, value, valueLine: i + 1 });
      i += 1;
      continue;
    }

    const keyMatch = keyOnly.exec(line);
    if (keyMatch) {
      const key = keyMatch[2] ?? '';
      // Collect all following value lines (strings that start with a quote)
      let value = '';
      let valueLine = -1;
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j] ?? '';
        const valMatch = valueOnly_SQ.exec(nextLine) ?? valueOnly_DQ.exec(nextLine);
        if (valMatch) {
          if (valueLine === -1) valueLine = j + 1;
          value += valMatch[1] ?? '';
          j += 1;
          // Stop after first segment if next line is not a continuation
          const afterLine = lines[j] ?? '';
          if (!/^\s*\+/.test(afterLine) && !/^\s*['"]/.test(afterLine)) break;
          // If next line starts with '+', skip the '+' line (it's a concat op)
          // and continue to the next string segment
          if (/^\s*\+\s*['"]/.test(afterLine)) {
            // the '+' and opening quote are on the same line as value
            j += 1; // skip to the string line
          }
        } else {
          break;
        }
      }
      if (valueLine !== -1) {
        entries.push({ key, value, valueLine });
      }
      i = j;
      continue;
    }

    i += 1;
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Rule 1: No ASCII ellipsis `...` in string values
// ---------------------------------------------------------------------------
// Audit reference: Style Rule 7 — "Ellipsis in loading / search placeholders:
// Unicode `…` (U+2026), not ASCII `...`."
//
// Exceptions:
// - `...` inside template variable placeholders like `{...}` is allowed.
// - Keys matching `tasks.sample.*` are editorial markdown content and are
//   excluded per the sample-data exception noted in the audit.
// - `...` used as a literal UI text glyph referring to a "..." menu button
//   (the only such case is the Antigravity instruction string which wraps the
//   three dots in double-quotes: `"..."`). This appears inside a larger
//   single-quoted value as `"..."` and is excluded by checking that the `...`
//   is surrounded by double-quote characters.
export function collectAsciiEllipsisInEn(source: string): EnMatch[] {
  const entries = parseEnEntries(source);
  const matches: EnMatch[] = [];

  for (const entry of entries) {
    // Skip sample-data editorial content
    if (entry.key.startsWith('tasks.sample.')) continue;

    // Find all `...` occurrences in the value
    let idx = 0;
    while (idx < entry.value.length) {
      const pos = entry.value.indexOf('...', idx);
      if (pos === -1) break;

      // Allow `{...}` — ASCII ellipsis inside a template placeholder
      const before = entry.value[pos - 1];
      const after = entry.value[pos + 3];
      if (before === '{' && after === '}') {
        idx = pos + 3;
        continue;
      }

      // Allow `"..."` — literal menu-button glyph wrapped in double quotes
      if (before === '"' && after === '"') {
        idx = pos + 3;
        continue;
      }

      // Allow `...` inside backtick code spans (CLI syntax like `od run ...`)
      // Walk backwards to check if we are between backticks on the same value
      const valueUpToPos = entry.value.slice(0, pos);
      const backticksBefore = (valueUpToPos.match(/`/g) ?? []).length;
      if (backticksBefore % 2 === 1) {
        // Inside a backtick span
        idx = pos + 3;
        continue;
      }

      matches.push({ line: entry.valueLine, value: entry.value, rule: 'ascii-ellipsis' });
      break; // one match per value is enough
    }
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Rule 2: No Unicode escape sequences for `…` (…) or `—` (—)
// ---------------------------------------------------------------------------
// Audit reference: Batch 4 — "Unicode escape normalisation (ellipsis and
// em-dash only)." Also covers apostrophe escapes (’) since Batch 10
// normalised those in en.ts too.
//
// We scan the RAW source text for these escape sequences inside string values.
// Using raw source is necessary because the escapes appear as literal text in
// the .ts source (e.g. `…`), not as the actual Unicode character.
export function collectUnicodeEscapeInEn(source: string): EnMatch[] {
  const lines = source.split('\n');
  const matches: EnMatch[] = [];

  // These escapes are forbidden in en.ts values; use the literal character.
  // … = …  — = —  ’ = '  ‘ = '
  const escapePattern = /\\u(2026|2014|2019|2018)/gi;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    let m: RegExpExecArray | null;
    escapePattern.lastIndex = 0;
    while ((m = escapePattern.exec(line)) !== null) {
      matches.push({ line: i + 1, value: m[0], rule: 'unicode-escape' });
    }
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Rule 3: No curly apostrophe (U+2019) in string values
// ---------------------------------------------------------------------------
// Audit reference: Style Rule 8 and Batch 10 — "Apostrophes in running text:
// straight ASCII apostrophe (`'`) is the majority style."
//
// This rule applies to en.ts only. Other locale files are exempt.
export function collectCurlyApostropheInEn(source: string): EnMatch[] {
  const lines = source.split('\n');
  const matches: EnMatch[] = [];
  const CURLY_APOS = '’';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.includes(CURLY_APOS)) {
      matches.push({ line: i + 1, value: line.trim(), rule: 'curly-apostrophe' });
    }
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Rule 4: Acronyms must be uppercase in string values
// ---------------------------------------------------------------------------
// Audit reference: Style Rule 10 — "Acronyms: always all-caps: HTML, CSS,
// API, URL, MCP, CLI, ID, PDF, PPTX, SSE, IPC, TTS, SFX."
//
// Strategy: match the canonical acronyms case-insensitively and flag any
// occurrence whose casing is NOT the required uppercase form.
//
// Special case for `id`: it is a common English word stem. We only flag
// standalone `id` when it follows one of the specific noun phrases from the
// audit (model|project|run|task|asset|file|user|client|trace|span).
export function collectMiscasedAcronymInEn(source: string): EnMatch[] {
  const entries = parseEnEntries(source);
  const matches: EnMatch[] = [];

  // Acronyms with simple whole-word matching (flag if not already uppercase)
  const simpleAcronyms = ['HTML', 'CSS', 'JS', 'API', 'URL', 'PDF', 'PPTX', 'MCP', 'CLI', 'SSE', 'IPC', 'TTS', 'SFX'];

  // For each acronym, build a pattern that matches any casing variant
  // that is NOT the correct uppercase form.
  // We use word boundaries (\b) to avoid false positives inside other words.
  const simplePatterns: Array<{ acronym: string; pattern: RegExp }> = simpleAcronyms.map((a) => ({
    acronym: a,
    // Matches the acronym case-insensitively (will catch correct and wrong cases)
    pattern: new RegExp(`\\b${a}\\b`, 'gi'),
  }));

  // `ID` special: only flag `id` when preceded by a specific noun phrase
  const idContextPattern = /\b(model|project|run|task|asset|file|user|client|trace|span)\s+(id)\b/gi;

  for (const entry of entries) {
    const value = entry.value;

    // Skip sample-data editorial content (consistent with rule 1)
    if (entry.key.startsWith('tasks.sample.')) continue;

    for (const { acronym, pattern } of simplePatterns) {
      pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(value)) !== null) {
        if (m[0] !== acronym) {
          // Skip if inside a backtick span (CLI syntax)
          const valueUpToPos = value.slice(0, m.index);
          const backticksBefore = (valueUpToPos.match(/`/g) ?? []).length;
          if (backticksBefore % 2 === 1) continue;
          // Skip filename / dotted-identifier matches like `cli.js`,
          // `orbit_daily.html`, `Next.js`. Detected by a preceding `.`
          // or `/` (path/filename context).
          const charBefore = value[m.index - 1];
          if (charBefore === '.' || charBefore === '/') continue;
          matches.push({ line: entry.valueLine, value: m[0], rule: `miscased-acronym:${acronym}` });
        }
      }
    }

    // Check `id` only in noun-phrase context
    idContextPattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = idContextPattern.exec(value)) !== null) {
      const idPart = m[2]; // the `id` capture group
      if (idPart !== undefined && idPart !== 'ID') {
        matches.push({ line: entry.valueLine, value: m[0], rule: 'miscased-acronym:ID' });
      }
    }
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Rule 5: Hint strings should end with a period
// ---------------------------------------------------------------------------
// Audit reference: Style Rule 5 — "Hint / sub-label strings (longer
// descriptive text below a heading): Sentence case, ending with a period."
//
// A string value qualifies for this check when:
//   1. Its key ends with `Hint` or matches `*Hint` pattern.
//   2. The value starts with an uppercase letter (sentence-case indicator).
//   3. The value has more than 4 words (short noun-phrase hints are exempt).
//
// The value must end with `.` (period). Strings ending with `…`, `!`, `?`,
// or other terminal punctuation are also considered acceptable.
export function collectUnpunctuatedHintInEn(source: string): EnMatch[] {
  const entries = parseEnEntries(source);
  const matches: EnMatch[] = [];

  // Terminal punctuation that is acceptable. The colon is accepted because
  // hint strings sometimes introduce UI-rendered content (chip list,
  // inline starters) shown below the hint, and `:` is the grammatical
  // separator for that pattern.
  const acceptableEndings = new Set(['.', '…', '!', '?', ':']);

  for (const entry of entries) {
    // Only apply to keys ending with `Hint` (case-sensitive suffix)
    if (!entry.key.endsWith('Hint')) continue;

    const value = entry.value.trim();

    // Must start with an uppercase letter
    if (!/^[A-Z]/.test(value)) continue;

    // Count words — skip short noun-phrase hints (<= 4 words)
    const wordCount = value.split(/\s+/).filter(Boolean).length;
    if (wordCount <= 4) continue;

    // Check the last character
    const lastChar = value.at(-1);
    if (lastChar !== undefined && !acceptableEndings.has(lastChar)) {
      matches.push({ line: entry.valueLine, value, rule: 'hint-missing-period' });
    }
  }

  return matches;
}

// ---------------------------------------------------------------------------
// CSS color helpers (original content follows)
// ---------------------------------------------------------------------------

export const cssWideAndSpecialColorKeywords = new Set([
  "transparent",
  "currentcolor",
  "inherit",
  "initial",
  "unset",
  "revert",
]);

export const realNamedColors = [
  "aliceblue",
  "antiquewhite",
  "aqua",
  "aquamarine",
  "azure",
  "beige",
  "bisque",
  "black",
  "blanchedalmond",
  "blue",
  "blueviolet",
  "brown",
  "burlywood",
  "cadetblue",
  "chartreuse",
  "chocolate",
  "coral",
  "cornflowerblue",
  "cornsilk",
  "crimson",
  "cyan",
  "darkblue",
  "darkcyan",
  "darkgoldenrod",
  "darkgray",
  "darkgreen",
  "darkgrey",
  "darkkhaki",
  "darkmagenta",
  "darkolivegreen",
  "darkorange",
  "darkorchid",
  "darkred",
  "darksalmon",
  "darkseagreen",
  "darkslateblue",
  "darkslategray",
  "darkslategrey",
  "darkturquoise",
  "darkviolet",
  "deeppink",
  "deepskyblue",
  "dimgray",
  "dimgrey",
  "dodgerblue",
  "firebrick",
  "floralwhite",
  "forestgreen",
  "fuchsia",
  "gainsboro",
  "ghostwhite",
  "gold",
  "goldenrod",
  "gray",
  "green",
  "greenyellow",
  "grey",
  "honeydew",
  "hotpink",
  "indianred",
  "indigo",
  "ivory",
  "khaki",
  "lavender",
  "lavenderblush",
  "lawngreen",
  "lemonchiffon",
  "lightblue",
  "lightcoral",
  "lightcyan",
  "lightgoldenrodyellow",
  "lightgray",
  "lightgreen",
  "lightgrey",
  "lightpink",
  "lightsalmon",
  "lightseagreen",
  "lightskyblue",
  "lightslategray",
  "lightslategrey",
  "lightsteelblue",
  "lightyellow",
  "lime",
  "limegreen",
  "linen",
  "magenta",
  "maroon",
  "mediumaquamarine",
  "mediumblue",
  "mediumorchid",
  "mediumpurple",
  "mediumseagreen",
  "mediumslateblue",
  "mediumspringgreen",
  "mediumturquoise",
  "mediumvioletred",
  "midnightblue",
  "mintcream",
  "mistyrose",
  "moccasin",
  "navajowhite",
  "navy",
  "oldlace",
  "olive",
  "olivedrab",
  "orange",
  "orangered",
  "orchid",
  "palegoldenrod",
  "palegreen",
  "paleturquoise",
  "palevioletred",
  "papayawhip",
  "peachpuff",
  "peru",
  "pink",
  "plum",
  "powderblue",
  "purple",
  "rebeccapurple",
  "red",
  "rosybrown",
  "royalblue",
  "saddlebrown",
  "salmon",
  "sandybrown",
  "seagreen",
  "seashell",
  "sienna",
  "silver",
  "skyblue",
  "slateblue",
  "slategray",
  "slategrey",
  "snow",
  "springgreen",
  "steelblue",
  "tan",
  "teal",
  "thistle",
  "tomato",
  "turquoise",
  "violet",
  "wheat",
  "white",
  "whitesmoke",
  "yellow",
  "yellowgreen",
];

const cssDeclarationPattern = /(?:^|[;{])\s*[-_a-zA-Z][-_a-zA-Z0-9]*\s*:\s*(?<value>[^;{}]+)/g;
const cssNamedColors = new Set(realNamedColors);

export type CssNamedColorMatch = {
  index: number;
  value: string;
};

const cssHexColorPattern = /^#[0-9a-fA-F]{3,8}\b/;

export function collectCssNamedColorMatches(source: string): CssNamedColorMatch[] {
  return collectCssHardcodedColorMatches(source).filter((match) => cssNamedColors.has(match.value.toLowerCase()));
}

export function collectCssHardcodedColorMatches(source: string): CssNamedColorMatch[] {
  const matches: CssNamedColorMatch[] = [];
  const scannableSource = maskCssCommentsAndStrings(source);

  for (const declaration of scannableSource.matchAll(cssDeclarationPattern)) {
    const declarationValue = declaration.groups?.value;
    if (declarationValue === undefined) continue;

    const valueOffset = (declaration.index ?? 0) + declaration[0].lastIndexOf(declarationValue);
    matches.push(...collectCssHardcodedColorMatchesFromDeclarationValue(declarationValue, valueOffset));
  }

  return matches;
}

function maskCssCommentsAndStrings(source: string): string {
  const characters = source.split("");
  let index = 0;

  while (index < characters.length) {
    const current = characters[index];
    const next = characters[index + 1];

    if (current === "/" && next === "*") {
      const endIndex = source.indexOf("*/", index + 2);
      const exclusiveEnd = endIndex === -1 ? characters.length : endIndex + 2;
      maskRange(characters, index, exclusiveEnd);
      index = exclusiveEnd;
      continue;
    }

    if (current === '"' || current === "'") {
      const exclusiveEnd = skipCssString(source, index, current);
      maskRange(characters, index, exclusiveEnd);
      index = exclusiveEnd;
      continue;
    }

    index += 1;
  }

  return characters.join("");
}

function maskRange(characters: string[], startIndex: number, exclusiveEnd: number): void {
  for (let index = startIndex; index < exclusiveEnd; index += 1) {
    if (characters[index] !== "\n") characters[index] = " ";
  }
}

function collectCssHardcodedColorMatchesFromDeclarationValue(
  declarationValue: string,
  sourceOffset: number,
): CssNamedColorMatch[] {
  const matches: CssNamedColorMatch[] = [];
  let index = 0;

  while (index < declarationValue.length) {
    const current = declarationValue[index];
    const next = declarationValue[index + 1];

    if (current === "/" && next === "*") {
      const commentEnd = declarationValue.indexOf("*/", index + 2);
      index = commentEnd === -1 ? declarationValue.length : commentEnd + 2;
      continue;
    }

    if (current === '"' || current === "'") {
      index = skipCssString(declarationValue, index, current);
      continue;
    }

    const hexColor = declarationValue.slice(index).match(cssHexColorPattern)?.[0];
    if (hexColor !== undefined) {
      matches.push({ index: sourceOffset + index, value: hexColor });
      index += hexColor.length;
      continue;
    }

    const functionName = readCssIdentifier(declarationValue, index);
    if (functionName !== undefined && functionName.value.toLowerCase() === "url") {
      const functionStart = skipCssWhitespace(declarationValue, functionName.endIndex);
      if (declarationValue[functionStart] === "(") {
        index = skipCssFunction(declarationValue, functionStart);
        continue;
      }
    }

    if (functionName !== undefined && functionName.value.toLowerCase() === "var") {
      const functionStart = skipCssWhitespace(declarationValue, functionName.endIndex);
      if (declarationValue[functionStart] === "(") {
        const functionEnd = skipCssFunction(declarationValue, functionStart);
        const fallbackStart = cssVarFallbackStartIndex(declarationValue, functionStart, functionEnd);
        if (fallbackStart !== undefined) {
          matches.push(
            ...collectCssHardcodedColorMatchesFromDeclarationValue(
              declarationValue.slice(fallbackStart, functionEnd - 1),
              sourceOffset + fallbackStart,
            ),
          );
        }
        index = functionEnd;
        continue;
      }
    }

    if (functionName !== undefined && ["rgb", "rgba", "hsl", "hsla"].includes(functionName.value.toLowerCase())) {
      const functionStart = skipCssWhitespace(declarationValue, functionName.endIndex);
      if (declarationValue[functionStart] === "(") {
        const functionEnd = skipCssFunction(declarationValue, functionStart);
        matches.push({ index: sourceOffset + index, value: declarationValue.slice(index, functionEnd) });
        index = functionEnd;
        continue;
      }
    }

    const identifier = readCssIdentifier(declarationValue, index);
    if (identifier === undefined) {
      index += 1;
      continue;
    }

    const normalizedValue = identifier.value.toLowerCase();
    if (cssNamedColors.has(normalizedValue) && !cssWideAndSpecialColorKeywords.has(normalizedValue)) {
      matches.push({ index: sourceOffset + index, value: identifier.value });
    }

    index = identifier.endIndex;
  }

  return matches;
}

function readCssIdentifier(source: string, startIndex: number): { value: string; endIndex: number } | undefined {
  const start = source[startIndex];
  if (start === undefined || !/[A-Za-z_]/.test(start)) return undefined;

  let endIndex = startIndex + 1;
  while (endIndex < source.length && /[-_A-Za-z0-9]/.test(source[endIndex] ?? "")) {
    endIndex += 1;
  }

  return { value: source.slice(startIndex, endIndex), endIndex };
}

function skipCssString(source: string, startIndex: number, quote: string): number {
  let index = startIndex + 1;
  while (index < source.length) {
    const current = source[index];
    if (current === "\\") {
      index += 2;
      continue;
    }

    if (current === quote) return index + 1;
    index += 1;
  }

  return source.length;
}

function skipCssWhitespace(source: string, startIndex: number): number {
  let index = startIndex;
  while (index < source.length && /\s/.test(source[index] ?? "")) index += 1;
  return index;
}

function skipCssFunction(source: string, openParenIndex: number): number {
  let depth = 1;
  let index = openParenIndex + 1;

  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];

    if (current === "/" && next === "*") {
      const commentEnd = source.indexOf("*/", index + 2);
      index = commentEnd === -1 ? source.length : commentEnd + 2;
      continue;
    }

    if (current === '"' || current === "'") {
      index = skipCssString(source, index, current);
      continue;
    }

    if (current === "(") depth += 1;
    if (current === ")") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }

    index += 1;
  }

  return source.length;
}

function cssVarFallbackStartIndex(source: string, openParenIndex: number, functionEndIndex: number): number | undefined {
  let depth = 0;
  let index = openParenIndex + 1;

  while (index < functionEndIndex - 1) {
    const current = source[index];
    const next = source[index + 1];

    if (current === "/" && next === "*") {
      const commentEnd = source.indexOf("*/", index + 2);
      index = commentEnd === -1 ? functionEndIndex - 1 : Math.min(commentEnd + 2, functionEndIndex - 1);
      continue;
    }

    if (current === '"' || current === "'") {
      index = skipCssString(source, index, current);
      continue;
    }

    if (current === "(") depth += 1;
    if (current === ")") depth -= 1;
    if (current === "," && depth === 0) return index + 1;

    index += 1;
  }

  return undefined;
}
