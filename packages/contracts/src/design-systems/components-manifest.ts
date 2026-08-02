export const COMPONENTS_MANIFEST_SCHEMA_VERSION = 1 as const;

export type ComponentsManifestSchemaVersion = typeof COMPONENTS_MANIFEST_SCHEMA_VERSION;

export type ComponentManifestGroupId =
  | 'buttons'
  | 'inputs'
  | 'cards'
  | 'badges'
  | 'links'
  | 'keyboard'
  | 'icons'
  | 'typography'
  | 'layout';

export type ComponentManifestGroup = {
  id: ComponentManifestGroupId;
  label: string;
  present: boolean;
  selectors: string[];
  classes: string[];
  elements: string[];
  tokenReferences: string[];
};

export type ComponentManifestLiteralInventory = {
  colorExpressions: number;
  pixelValues: number;
  hardcodedFontFamilies: number;
};

export type ComponentsManifest = {
  schemaVersion: ComponentsManifestSchemaVersion;
  brandId: string;
  source: {
    componentsHtml: 'components.html';
    tokensCss?: 'tokens.css';
  };
  fixture: {
    title?: string;
    description?: string;
    styleBlockCount: number;
    selectorCount: number;
    classCount: number;
    elementCount: number;
  };
  tokens: {
    declared: string[];
    referenced: string[];
    unusedDeclared: string[];
    undeclaredReferenced: string[];
  };
  selectors: string[];
  classes: string[];
  elements: string[];
  groups: ComponentManifestGroup[];
  literals: ComponentManifestLiteralInventory;
};

export type ExtractComponentsManifestInput = {
  brandId: string;
  fixtureHtml: string;
  tokensCss?: string;
};

type ComponentGroupDefinition = {
  id: ComponentManifestGroupId;
  label: string;
  selectorMatchers: RegExp[];
  classMatchers: RegExp[];
  elementMatchers: RegExp[];
};

const COMPONENT_GROUPS: ComponentGroupDefinition[] = [
  {
    id: 'buttons',
    label: 'Buttons and calls to action',
    selectorMatchers: [/^(?:\.)?button(?:$|[-_:])/i, /\.btn(?:$|[-_:])/i, /\[type=["']?(?:button|submit|reset)/i],
    classMatchers: [/^btn(?:$|-)/i, /^button(?:$|-)/i, /^cta(?:$|-)/i],
    elementMatchers: [/^button$/i],
  },
  {
    id: 'inputs',
    label: 'Form fields and controls',
    selectorMatchers: [
      // Anchor element names so prefix-sharing classnames such as
      // `.form-input-prepend` are not admitted through `\binput\b`; classMatchers
      // already anchor their tokens, this mirrors that boundary rule on the
      // selector side (PR #6250 PerishCode round-2 follow-up).
      /^(?:\.)?input(?:$|[-_:])/i,
      /^(?:\.)?textarea(?:$|[-_:])/i,
      /^(?:\.)?select(?:$|[-_:])/i,
      /^(?:\.)?label(?:$|[-_:])/i,
      /\.field(?:$|[-_:])/i,
    ],
    classMatchers: [/^field(?:$|-)/i, /^input(?:$|-)/i, /^control(?:$|-)/i, /^form(?:$|-)/i],
    elementMatchers: [/^(input|textarea|select|label|form)$/i],
  },
  {
    id: 'cards',
    label: 'Cards and panels',
    selectorMatchers: [/\.card(?:$|[-_:])/i, /\.panel(?:$|[-_:])/i, /\.tile(?:$|[-_:])/i],
    classMatchers: [/^card(?:$|-)/i, /^panel(?:$|-)/i, /^tile(?:$|-)/i],
    elementMatchers: [],
  },
  {
    id: 'badges',
    label: 'Badges, chips, and status labels',
    selectorMatchers: [
      /\.badge(?:$|[-_:])/i,
      /\.chip(?:$|[-_:])/i,
      /\.tag(?:$|[-_:])/i,
      /\.pill(?:$|[-_:])/i,
    ],
    classMatchers: [/^badge(?:$|-)/i, /^chip(?:$|-)/i, /^tag(?:$|-)/i, /^pill(?:$|-)/i, /^status(?:$|-)/i],
    elementMatchers: [],
  },
  {
    id: 'links',
    label: 'Links and inline actions',
    selectorMatchers: [
      // Anchor the bare `a` element matcher so prefix-sharing classnames such as
      // `.navbar-extra` no longer leak through `\ba\b` (PerishCode round-2
      // follow-up: same boundary rule as buttons/inputs).
      /^(?:\.)?a(?:$|[-_:])/i,
      /\.link(?:$|[-_:])/i,
    ],
    classMatchers: [/^link(?:$|-)/i],
    elementMatchers: [/^a$/i],
  },
  {
    id: 'keyboard',
    label: 'Keyboard hints',
    selectorMatchers: [/^(?:\.)?kbd(?:$|[-_:])/i, /\.kbd(?:$|[-_:])/i],
    classMatchers: [/^kbd(?:$|-)/i, /^keyboard(?:$|-)/i, /^shortcut(?:$|-)/i],
    elementMatchers: [/^kbd$/i],
  },
  {
    id: 'icons',
    label: 'Icon slots',
    selectorMatchers: [/\.icon(?:$|[-_:])/i, /\[aria-hidden=["']true["']\]/i],
    classMatchers: [/^icon(?:$|-)/i],
    elementMatchers: [/^svg$/i],
  },
  {
    id: 'typography',
    label: 'Typography scale and text utilities',
    selectorMatchers: [
      // Anchor `h1`–`h6` element names; `.lead`/`.eyebrow`/`.body-*` already
      // handle their class tokens (PerishCode round-2 follow-up).
      /^(?:\.)?h[1-6](?:$|[-_:])/i,
      /\.lead(?:$|[-_:])/i,
      /\.eyebrow(?:$|[-_:])/i,
      /\.body-(?:muted|sm|small)(?:$|[-_:])/i,
    ],
    classMatchers: [/^lead$/i, /^eyebrow$/i, /^body-(?:muted|sm|small)$/i, /^caption(?:$|-)/i],
    elementMatchers: [/^h[1-6]$/i, /^p$/i],
  },
  {
    id: 'layout',
    label: 'Layout primitives',
    selectorMatchers: [
      /\.container(?:$|[-_:])/i,
      /\.stack-\d+(?:$|[-_:])/i,
      /\.row-(?:between|center|start|end)(?:$|[-_:])/i,
      // Anchor element names so prefix-sharing classnames such as
      // `.navbar-section-link` or `.main-content-extra` no longer enter the
      // layout group through `\bsection\b`/`\bmain\b`/`\bnav\b` (PerishCode
      // round-2 follow-up).
      /^(?:\.)?(?:section|main|nav)(?:$|[-_:])/i,
    ],
    classMatchers: [/^container$/i, /^stack-\d+$/i, /^row-(?:between|center|start|end)$/i, /^grid(?:$|-)/i, /^layout(?:$|-)/i],
    elementMatchers: [/^(main|section|nav|header|footer)$/i],
  },
];

export function extractComponentsManifest({
  brandId,
  fixtureHtml,
  tokensCss,
}: ExtractComponentsManifestInput): ComponentsManifest {
  const styleBlocks = extractStyleBlocks(fixtureHtml);
  const css = styleBlocks.join('\n\n');
  const selectors = extractCssSelectors(css);
  const selectorTokenReferences = extractSelectorTokenReferences(css);
  const classes = extractHtmlClasses(fixtureHtml);
  const elements = extractHtmlElements(fixtureHtml);
  const declaredTokens = parseTokenNames(tokensCss ?? extractFirstRootBody(css) ?? '');
  const referencedTokens = extractTokenReferences(fixtureHtml);

  return {
    schemaVersion: COMPONENTS_MANIFEST_SCHEMA_VERSION,
    brandId,
    source:
      tokensCss === undefined
        ? { componentsHtml: 'components.html' }
        : { componentsHtml: 'components.html', tokensCss: 'tokens.css' },
    fixture: {
      ...optionalText('title', extractTitle(fixtureHtml)),
      ...optionalText('description', extractMetaDescription(fixtureHtml)),
      styleBlockCount: styleBlocks.length,
      selectorCount: selectors.length,
      classCount: classes.length,
      elementCount: elements.length,
    },
    tokens: {
      declared: declaredTokens,
      referenced: referencedTokens,
      unusedDeclared: declaredTokens.filter((token) => !referencedTokens.includes(token)),
      undeclaredReferenced:
        declaredTokens.length === 0 ? [] : referencedTokens.filter((token) => !declaredTokens.includes(token)),
    },
    selectors,
    classes,
    elements,
    groups: COMPONENT_GROUPS.map((definition) =>
      buildGroupManifest(definition, {
        selectors,
        selectorTokenReferences,
        classes,
        elements,
        referencedTokens,
      }),
    ),
    literals: countLiterals(stripRootBlocks(stripCssComments(css))),
  };
}

export function summarizeComponentsManifestForPrompt(manifest: ComponentsManifest): string {
  const presentGroups = manifest.groups
    .filter((group) => group.present)
    .map((group) => {
      const selectors = group.selectors.slice(0, 8).join(', ') || 'none';
      const tokens = group.tokenReferences.slice(0, 10).join(', ') || 'none';
      return `- ${group.label}: selectors ${selectors}; tokens ${tokens}`;
    });

  return [
    `components.manifest schema v${manifest.schemaVersion} for ${manifest.brandId}`,
    `Fixture: ${manifest.fixture.selectorCount} selectors, ${manifest.fixture.classCount} classes, ${manifest.tokens.declared.length} declared tokens, ${manifest.tokens.referenced.length} referenced tokens.`,
    'Available component groups:',
    ...(presentGroups.length > 0 ? presentGroups : ['- none detected']),
  ].join('\n');
}

function buildGroupManifest(
  definition: ComponentGroupDefinition,
  inventory: {
    selectors: string[];
    selectorTokenReferences: Map<string, string[]>;
    classes: string[];
    elements: string[];
    referencedTokens: string[];
  },
): ComponentManifestGroup {
  const selectors = inventory.selectors.filter((selector) =>
    definition.selectorMatchers.some((matcher) => matcher.test(selector)),
  );
  const classes = inventory.classes.filter((className) =>
    definition.classMatchers.some((matcher) => matcher.test(className)),
  );
  const elements = inventory.elements.filter((element) =>
    definition.elementMatchers.some((matcher) => matcher.test(element)),
  );
  const tokenReferences = uniqueSorted(
    selectors.flatMap((selector) => inventory.selectorTokenReferences.get(selector) ?? []),
  );

  return {
    id: definition.id,
    label: definition.label,
    present: selectors.length > 0 || classes.length > 0 || elements.length > 0,
    selectors,
    classes,
    elements,
    tokenReferences: tokenReferences.filter((token) => inventory.referencedTokens.includes(token)),
  };
}

function extractStyleBlocks(html: string): string[] {
  const blocks: string[] = [];
  const stylePattern = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;
  while ((match = stylePattern.exec(html)) !== null) {
    blocks.push((match[1] ?? '').trim());
  }
  return blocks;
}

function extractCssSelectors(css: string): string[] {
  const selectors = new Set<string>();
  const commentlessCss = stripContainerAtRuleHeaders(stripCssComments(css));

  // The legacy `(?:^|[{}])\s*([^@{}][^{}]*?)\s*\{` regex anchored each
  // rule at the *previous* rule's closing `}`, so half the flat rules in
  // a sheet were silently dropped (#6224 part 1). It also mis-handled
  // supported at-rule bodies: after `stripContainerAtRuleHeaders` turns
  // `@media ... {` into `{`, the regex sees `{ \n .inside { ... }` and
  // the bare `[^@{}]` exclusion rejects the inner selector — silent loss
  // of every selector immediately inside an at-rule (#6250 reviewer #1).
  //
  // Reuse the brace-depth scanner that already powers
  // `extractSelectorTokenReferences` — it walks the CSS character-by-character
  // and recursively descends into supported at-rule bodies so inner
  // selectors surface with their real selectors preserved.
  for (const { selectorList } of iterateCssRules(commentlessCss)) {
    if (selectorList.length === 0) continue;
    if (selectorList.includes(':root')) continue;
    if (/^(?:from|to|\d+(?:\.\d+)?%)$/i.test(selectorList)) continue;
    // Skip supported at-rule headers — they survived the strip pass because
    // the body wasn't processed by stripContainerAtRuleHeaders (e.g. nested
    // recursion landed on `@media`). At-rules never contribute a *selector*.
    if (selectorList.startsWith('@')) continue;

    for (const selector of splitSelectorList(selectorList)) {
      const normalized = normalizeSelector(selector);
      if (normalized.length > 0 && !normalized.startsWith('@')) {
        selectors.add(normalized);
      }
    }
  }

  return [...selectors].sort((a, b) => a.localeCompare(b));
}

function extractSelectorTokenReferences(css: string): Map<string, string[]> {
  const referencesBySelector = new Map<string, Set<string>>();
  const commentlessCss = stripContainerAtRuleHeaders(stripCssComments(css));

  // Walk the CSS character-by-character with a brace-depth scanner instead of
  // a single `[{}]\s*([^@{}][^{}]*?)\s*\{([^{}]*)\}` regex. The regex consumed
  // each rule's closing `}`, so the *next* rule lost its `[{}]` anchor and
  // was skipped — silent loss of every other flat rule's token attribution
  // (issue #6224 part 1). The regex body `[^{}]*` also couldn't match nested
  // blocks (Tailwind v4 state output), mis-attributing tokens to declaration
  // text as a pseudo-selector (issue #6224 part 2). The scanner flattens one
  // level of nesting so `&:hover { ... }` declarations contribute to the
  // parent selector instead of leaking into a fake selector.
  for (const { selectorList, body } of iterateCssRules(commentlessCss)) {
    if (selectorList.includes(':root')) continue;
    if (/^(?:from|to|\d+(?:\.\d+)?%)$/i.test(selectorList)) continue;

    const tokenReferences = extractTokenReferences(body);
    if (tokenReferences.length === 0) continue;

    for (const selector of splitSelectorList(selectorList)) {
      const normalized = normalizeSelector(selector);
      if (normalized.length === 0 || normalized.startsWith('@')) continue;
      const selectorReferences = referencesBySelector.get(normalized) ?? new Set<string>();
      for (const token of tokenReferences) {
        selectorReferences.add(token);
      }
      referencesBySelector.set(normalized, selectorReferences);
    }
  }

  return new Map(
    [...referencesBySelector.entries()]
      .map(([selector, references]) => [selector, [...references].sort((a, b) => a.localeCompare(b))] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

type CssRule = { selectorList: string; body: string };

function iterateCssRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  let index = 0;
  const length = css.length;

  while (index < length) {
    // Find the next '{' that opens a rule body. Skip '@container' at-rule
    // bodies (their inner rules are emitted with the at-rule header stripped,
    // matching stripContainerAtRuleHeaders behaviour).
    //
    // Quote-aware scan (PR #6250 reviewer #4): a `{` that appears inside a
    // quoted selector context — e.g. `.btn-a[data-icon="{"]` — must NOT be
    // treated as the rule opener. We walk from `index` tracking single /
    // double quote state and backslash escapes, ignoring `{` / `}` that
    // appear inside a quoted string, so the first un-quoted `{` we find is
    // the real rule-body opener. Without this, valid CSS such as
    // `.btn-a[data-icon="{"] { color: var(--a); }` mistreats the brace
    // inside the attribute value as the opener and `manifest.selectors`
    // silently drops both rules.
    let openIndex = -1;
    let quoteScan = index;
    let inQuote: '"' | "'" | null = null;
    while (quoteScan < length) {
      const ch = css[quoteScan];
      if (ch === '/' && css[quoteScan + 1] === '*') {
        // Skip a /* ... */ comment block so braces inside comments do not
        // perturb the quote scan.
        const closeIdx = css.indexOf('*/', quoteScan + 2);
        quoteScan = closeIdx === -1 ? length : closeIdx + 2;
        continue;
      }
      if (inQuote !== null) {
        if (ch === '\\') {
          quoteScan += 2;
          continue;
        }
        if (ch === inQuote) {
          inQuote = null;
          quoteScan += 1;
          continue;
        }
        quoteScan += 1;
        continue;
      }
      // CSS escape sequence outside a quoted string (PR #6250 reviewer #5):
      // a backslash in a selector identifier escapes the next character(s)
      // so it is not interpreted as CSS structure. The simple form `\X` skips
      // one literal char; the hex form `\XHHHHHH` (1–6 hex digits, optional
      // single trailing whitespace) encodes a codepoint. We only need to keep
      // the brace/quote/selector characters that follow the escape from
      // perturbing the opener scan, so skip the backslash and one escaped
      // char (covers 99% of real-world cases — `.foo\:bar`, `.foo\2d bar`,
      // `.foo\.` — without modelling unicode codepoint semantics).
      if (ch === '\\') {
        quoteScan += 2;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inQuote = ch;
        quoteScan += 1;
        continue;
      }
      if (ch === '{') {
        openIndex = quoteScan;
        break;
      }
      quoteScan += 1;
    }
    if (openIndex === -1) break;

    const selectorList = css.slice(index, openIndex).trim();
    index = openIndex + 1;

    // Match the closing '}' at brace depth 0. Nested blocks (CSS nesting)
    // are flattened — their inner declarations merge into the parent rule's
    // body so tokens inside `&:hover { ... }` attribute to the outer
    // selector, not to a garbage "selector" pieced together from declaration
    // text.
    let depth = 1;
    let bodyStart = index;
    let bodyEnd = -1;
    let cursor = index;
    // Track the open CSS quote (single or double) so braces inside a
    // quoted value such as `content: "}"` are not mistaken for the rule
    // terminator (PR #6250 reviewer #3). null = outside any quoted string.
    let bodyInQuote: '"' | "'" | null = null;
    while (cursor < length) {
      const char = css[cursor];
      if (char === '/' && css[cursor + 1] === '*') {
        // Skip a /* ... */ comment block so braces inside comments do not
        // perturb the depth count. (stripCssComments already removed
        // comments outside at-rule bodies, but defensive scanning here
        // keeps the parser honest if a caller passes pre-stripped CSS.)
        const closeIdx = css.indexOf('*/', cursor + 2);
        cursor = closeIdx === -1 ? length : closeIdx + 2;
        continue;
      }
      // Treat braces inside quoted CSS values as data, not rule delimiters
      // (PR #6250 reviewer #3). Track single / double quote state and
      // ignore `{` / `}` that appear between a pair of quotes. Handle
      // escaped quotes \" and \' so a `}` preceded by \" doesn't escape
      // the quoted context.
      if (bodyInQuote === '"' || bodyInQuote === "'") {
        if (char === '\\') {
          // Skip the escaped character (could be \" or \' or any escape).
          cursor += 2;
          continue;
        }
        if (char === bodyInQuote) {
          bodyInQuote = null;
          cursor += 1;
          continue;
        }
        // Inside a quoted string: braces are just text, skip without
        // affecting depth.
        cursor += 1;
        continue;
      }
      if (char === '"' || char === "'") {
        bodyInQuote = char;
        cursor += 1;
        continue;
      }
      // CSS escape sequence outside a quoted string (PR #6250 reviewer #5):
      // a backslash in a declaration value or selector context escapes the
      // next character so `\}` (escaped closing brace, e.g. inside a content
      // value or an unusual selector) is not counted as a rule terminator,
      // and `\{` is not counted as a nested-block opener. Skip the backslash
      // and one escaped char, mirroring the opener-scan escape handling.
      if (char === '\\') {
        cursor += 2;
        continue;
      }
      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          bodyEnd = cursor;
          break;
        }
      }
      cursor += 1;
    }

    if (bodyEnd === -1) {
      // Unbalanced CSS — flush the remaining text as a final rule body.
      break;
    }

    // Extract outer-body declarations, stripping nested `{ ... }` blocks
    // (their inner declarations are folded in via a recursive flatten so
    // tokens referenced inside `&:hover { background: var(--x) }` count
    // toward `.parent`). flattenNestedBody recursively folds nested-block
    // inner declarations — including declarations nested *two or more*
    // levels deep — so `& .child { & .grand { background: var(--c) } }`
    // contributes --c to the outermost ancestor (PR #6250 reviewer #2).
    const bodySlice = css.slice(bodyStart, bodyEnd);
    const body = flattenNestedBody(bodySlice);

    if (selectorList.length === 0) {
      // Empty selector — the at-rule header (`@media`/`@supports`/
      // `@container`/`@layer`) was stripped to '{' by
      // stripContainerAtRuleHeaders before this scanner ran. The outermost
      // `{` after stripping opens an empty selector; we must NOT push it as
      // a rule (that would swallow the whole at-rule body as one giant
      // "rule" and lose every inner selector). Instead recurse into the
      // body slice so inner rules are emitted with their real selectors
      // and real bodies (PR #6250 reviewer #1).
      rules.push(...iterateCssRules(bodySlice));
    } else if (!selectorList.startsWith('@') || isSupportedAtRuleHeader(selectorList)) {
      // Ordinary selector, or a supported at-rule header that survived the
      // strip pass (e.g. recursive call landed on `@media` whose header was
      // not stripped because the parent body wasn't processed by
      // stripContainerAtRuleHeaders). Push it as-is; the body still has
      // nested-block declarations flattened into it.
      rules.push({ selectorList, body });
    }
    index = bodyEnd + 1;
    // Skip trailing whitespace + stray semicolons between rules — keeps the
    // next iteration's selectorList clean.
    while (index < length && /[\s;]/.test(css[index]!)) index += 1;
  }

  return rules;
}

// Supported at-rule headers whose bodies contain ordinary CSS rules whose
// selectors + bodies must be enumerated (PR #6250 reviewer #1). Other
// at-rules (@keyframes, @font-face, @page, @import, @namespace, @charset)
// have bodies that are NOT ordinary rule trees — we treat them as opaque
// declaration blocks and do not descend into them via the conditional
// recursion in iterateCssRules.
function isSupportedAtRuleHeader(selectorList: string): boolean {
  return /^@(?:media|supports|container|layer)\b/i.test(selectorList);
}

function flattenNestedBody(bodySlice: string): string {
  // For `.parent { color: var(--a); &:hover { background: var(--b); } }` we
  // receive the inner slice `color: var(--a); &:hover { background: var(--b); } `
  // and want to emit `color: var(--a); background: var(--b); ` so both tokens
  // attribute to `.parent`. We strip the nested `{ ... }` wrapper but keep
  // its inner declarations, dropping the `&:hover` selector prefix — the
  // parent already owns the tokens.
  //
  // The flatten is *recursive*: declarations nested two or more levels
  // deep (`& .child { & .grand { background: var(--c) } }`) still fold
  // into the outermost ancestor, so the inner-inner `var(--c)` is counted
  // for `.parent` rather than dropped (PR #6250 reviewer #2). We walk the
  // body slice, dropping only the `{` / `}` brace characters themselves
  // and the nested-rule *selector prefix* between `{` and the next `{`/`;`
  // — but keeping every declaration body so all `var(--token)` references
  // at every depth survive on the outermost rule.
  //
  // Quote/escape state (PR #6250 reviewer #3): braces inside a quoted
  // CSS value (`content: "}"`) are data, not rule delimiters. We preserve
  // the quoted text character-by-character into the output so downstream
  // token-reference scanning still sees the full declaration, but we do
  // NOT treat the quoted `{` / `}` as braces to strip. Escapes `\"` and
  // `\'` skip the next character so they don't terminate the quoted
  // context prematurely.
  let out = '';
  let cursor = 0;
  const length = bodySlice.length;
  let inQuote: '"' | "'" | null = null;
  while (cursor < length) {
    const char = bodySlice[cursor];
    // Comment handling: only active outside quoted strings. Comments inside
    // quoted strings are part of the data and should be preserved verbatim.
    if (inQuote === null && char === '/' && bodySlice[cursor + 1] === '*') {
      const closeIdx = bodySlice.indexOf('*/', cursor + 2);
      cursor = closeIdx === -1 ? length : closeIdx + 2;
      continue;
    }
    if (inQuote !== null) {
      // Inside a quoted value. Preserve the character verbatim — quoted
      // text is data, and downstream token-reference scanning needs the
      // full original value (e.g. `content: "}"` stays intact). Handle
      // backslash escapes so a quoted `}"` doesn't exit the quote early.
      if (char === '\\') {
        out += bodySlice.slice(cursor, cursor + 2);
        cursor += 2;
        continue;
      }
      out += char;
      if (char === inQuote) {
        inQuote = null;
      }
      cursor += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      inQuote = char;
      // Preserve the opening quote in `out` so the flattened body still
      // carries the full quoted value (the closing quote is preserved by
      // the inQuote !== null branch above).
      out += char;
      cursor += 1;
      continue;
    }
    if (char === '{' || char === '}') {
      // Drop the brace; keep scanning. We deliberately do NOT skip the
      // nested-rule selector prefix between '{' and the next declaration
      // — that prefix (e.g. `&:hover`) is just text with no `var(--token)`
      // references, and if it did contain a var() we'd want to surface it
      // on the outer selector anyway (rare in practice). Stripping only
      // the braces gives us full-depth folding with O(n) cost.
      cursor += 1;
      continue;
    }
    out += char;
    cursor += 1;
  }
  return out;
}

function splitSelectorList(selectorList: string): string[] {
  const selectors: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < selectorList.length; index += 1) {
    const char = selectorList[index];
    if (char === '(' || char === '[') {
      depth += 1;
      continue;
    }
    if (char === ')' || char === ']') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (char === ',' && depth === 0) {
      selectors.push(selectorList.slice(start, index));
      start = index + 1;
    }
  }

  selectors.push(selectorList.slice(start));
  return selectors;
}

function normalizeSelector(selector: string): string {
  return selector.trim().replace(/\s+/g, ' ');
}

function extractHtmlClasses(html: string): string[] {
  const classes = new Set<string>();
  const classPattern = /\bclass\s*=\s*(["'])(.*?)\1/gis;
  let match: RegExpExecArray | null;
  while ((match = classPattern.exec(html)) !== null) {
    const classValue = match[2] ?? '';
    for (const className of classValue.split(/\s+/)) {
      if (className.length > 0) classes.add(className);
    }
  }
  return [...classes].sort((a, b) => a.localeCompare(b));
}

function extractHtmlElements(html: string): string[] {
  const elements = new Set<string>();
  const elementPattern = /<\s*([a-z][a-z0-9-]*)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = elementPattern.exec(html)) !== null) {
    const element = match[1]?.toLowerCase();
    if (element == null || element.startsWith('!')) continue;
    elements.add(element);
  }
  return [...elements].sort((a, b) => a.localeCompare(b));
}

function parseTokenNames(css: string): string[] {
  const tokens = new Set<string>();
  const tokenPattern = /(--[a-zA-Z0-9_-]+)\s*:/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(stripCssComments(css))) !== null) {
    const token = match[1];
    if (token != null) tokens.add(token);
  }
  return [...tokens].sort((a, b) => a.localeCompare(b));
}

function extractTokenReferences(source: string): string[] {
  const tokens = new Set<string>();
  const tokenPattern = /var\(\s*(--[a-zA-Z0-9_-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(source)) !== null) {
    const token = match[1];
    if (token != null) tokens.add(token);
  }
  return [...tokens].sort((a, b) => a.localeCompare(b));
}

function extractFirstRootBody(css: string): string | null {
  return stripCssComments(css).match(/:root(?!\[)\s*\{([\s\S]*?)\}/)?.[1] ?? null;
}

function stripRootBlocks(css: string): string {
  return css.replace(/:root(?:\[[^\]]+\])?\s*\{[\s\S]*?\}/g, '');
}

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function stripContainerAtRuleHeaders(css: string): string {
  return css.replace(/@(media|supports|container|layer)\b[^{]*\{/gi, '{');
}

function countLiterals(css: string): ComponentManifestLiteralInventory {
  return {
    colorExpressions: countMatches(
      css,
      /(?:#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)|color-mix\([^)]*\))/gi,
    ),
    pixelValues: countMatches(css, /(?<![\w-])-?\d*\.?\d+px\b/g),
    hardcodedFontFamilies: countMatches(css, /\bfont-family\s*:\s*(?!var\()/gi),
  };
}

function countMatches(source: string, pattern: RegExp): number {
  return [...source.matchAll(pattern)].length;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function extractTitle(html: string): string | undefined {
  const value = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim().replace(/\s+/g, ' ');
  return value == null || value.length === 0 ? undefined : decodeBasicEntities(value);
}

function extractMetaDescription(html: string): string | undefined {
  const match = /<meta\b(?=[^>]*\bname\s*=\s*["']description["'])(?=[^>]*\bcontent\s*=\s*(["'])([\s\S]*?)\1)[^>]*>/i.exec(html);
  const value = match?.[2]?.trim().replace(/\s+/g, ' ');
  return value == null || value.length === 0 ? undefined : decodeBasicEntities(value);
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function optionalText<Key extends string>(key: Key, value: string | undefined): Record<Key, string> | Record<string, never> {
  return value === undefined ? {} : { [key]: value } as Record<Key, string>;
}
