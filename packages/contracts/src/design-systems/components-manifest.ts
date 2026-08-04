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
  /**
   * Class/word regexes that match raw selectors containing `:not(...)`,
   * `[data-x="..."]`, `.foo` etc. — DEPRECATED: kept for backwards
   * compatibility with the pre-round-5 schema, but no longer consulted by
   * `selectorMatchesTokens`. Use `attributeMatchers` for genuine selector-wide
   * attribute predicates (`[type=button]`, `[aria-hidden="true"]`); element
   * and class matching is performed strictly against parsed tokens via
   * `tokenizeCompound` (PerishCode round-5 review on #6250).
   */
  selectorMatchers: RegExp[];
  /**
   * Genuine attribute-predicate regexes that match the *raw* selector string.
   * Only patterns anchored on a `[` (attribute selector) belong here — these
   * describe selectors that pick components via an attribute, such as
   * `[type=button]` for buttons, `[aria-hidden="true"]` for icons, and
   * `[role=checkbox]` for inputs. They run against the unmodified raw selector
   * because attribute predicate text appears verbatim in the compound;
   * tokenizing it would lose the attribute value entirely.
   *
   * Do NOT use this family to match element names (`button`, `input`, …) or
   * class tokens (`.btn`, `.card`, …) — those matchers must live on
   * `elementMatchers` / `classMatchers` so they only fire on parsed tokens,
   * preventing `:not(.btn)` and `[data-label=".card"]` from cross-attributing
   * tokens to groups they do not select (PerishCode round-5 review on #6250).
   */
  attributeMatchers: RegExp[];
  classMatchers: RegExp[];
  elementMatchers: RegExp[];
};

const COMPONENT_GROUPS: ComponentGroupDefinition[] = [
  {
    id: 'buttons',
    label: 'Buttons and calls to action',
    selectorMatchers: [/^(?:\.)?button(?:$|[-_:])/i, /\.btn(?:$|[-_:])/i, /\[type=["']?(?:button|submit|reset)/i],
    attributeMatchers: [/^\[type=["']?(?:button|submit|reset)["']?\]/i],
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
    attributeMatchers: [
      // Genuine inputs attribute predicates (round-5 follow-up): `[role=checkbox]`
      // and `[role=radio]` describe inputs components via attribute rather than
      // element name. Anchor to the complete parsed attribute token with ^ and
      // trailing ] so an unrelated attribute whose value contains role text
      // (e.g. `[data-label="[role=checkbox]"]`) is not admitted to Inputs —
      // same round-6 fix that landed on Buttons and Icons.
      /^\[role=["']?(?:checkbox|radio|textbox|search|spinbutton)["']?\]/i,
    ],
    // `^form(?:$|-)` was too permissive once class tokens were matched per-token
    // (PerishCode round-3 follow-up #6250): it admitted `.form-input-prepend`
    // because `form-input-prepend` begins with `form-`. Restrict `form-*` to the
    // concrete inputs-component suffixes (`form-control`, `form-group`,
    // `form-field`, `form-label`, `form-select`, `form-text`, `form-check`,
    // `form-file`) used by Bootstrap-style systems, plus state suffixes such as
    // `form-control-static` and `form-control-sm`. `form-input-prepend` is
    // intentionally not in the set — it is a prefix-shared name (a prepend on an
    // input), not a form control.
    classMatchers: [
      /^field(?:$|-)/i,
      /^input(?:$|-)/i,
      /^control(?:$|-)/i,
      /^form-(?:control|group|field|label|select|text|check|file)(?:-(?:sm|lg|static|plaintext|inline|disabled))?(?:$|-)/i,
    ],
    elementMatchers: [/^(input|textarea|select|label|form)$/i],
  },
  {
    id: 'cards',
    label: 'Cards and panels',
    selectorMatchers: [/\.card(?:$|[-_:])/i, /\.panel(?:$|[-_:])/i, /\.tile(?:$|[-_:])/i],
    attributeMatchers: [],
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
    attributeMatchers: [],
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
    attributeMatchers: [],
    classMatchers: [/^link(?:$|-)/i],
    elementMatchers: [/^a$/i],
  },
  {
    id: 'keyboard',
    label: 'Keyboard hints',
    selectorMatchers: [/^(?:\.)?kbd(?:$|[-_:])/i, /\.kbd(?:$|[-_:])/i],
    attributeMatchers: [],
    classMatchers: [/^kbd(?:$|-)/i, /^keyboard(?:$|-)/i, /^shortcut(?:$|-)/i],
    elementMatchers: [/^kbd$/i],
  },
  {
    id: 'icons',
    label: 'Icon slots',
    selectorMatchers: [/\.icon(?:$|[-_:])/i, /\[aria-hidden=["']true["']\]/i],
    attributeMatchers: [/^\[aria-hidden=["']true["']\]/i],
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
    attributeMatchers: [],
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
    attributeMatchers: [],
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

// Split a CSS selector into its compound selectors at combinator boundaries
// (`>`, `+`, `~`, and whitespace that is not inside `[]` or `()`). Used by
// `selectorMatchesTokens` so element/class matchers can find their token after
// any combinator — for example `.dialog > button` and `form input` both land
// `button` / `input` as the trailing compound's element token instead of being
// rejected by a `^`-anchored full-selector regex.
function splitCompoundSelectors(selector: string): string[] {
  const compounds: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];
    if (char === '(' || char === '[') {
      depth += 1;
      continue;
    }
    if (char === ')' || char === ']') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0) continue;
    const isCombinatorChar = char === '>' || char === '+' || char === '~';
    const isWhitespace = char === ' ' || char === '\t' || char === '\n' || char === '\r';
    if (isCombinatorChar) {
      if (index > start) compounds.push(selector.slice(start, index).trim());
      start = index + 1;
      continue;
    }
    if (isWhitespace) {
      // peek ahead; if the next non-space char is itself a combinator, the
      // whitespace is part of `> ` spacing, not a descendant combinator.
      let lookahead = index + 1;
      while (lookahead < selector.length && (selector[lookahead] === ' ' || selector[lookahead] === '\t')) {
        lookahead += 1;
      }
      const next = selector[lookahead];
      if (next === '>' || next === '+' || next === '~') continue;
      if (index > start) compounds.push(selector.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (start < selector.length) {
    const tail = selector.slice(start).trim();
    if (tail.length > 0) compounds.push(tail);
  }
  return compounds.filter((compound) => compound.length > 0);
}

interface CompoundTokens {
  element: string | null;
  classes: string[];
  extraElements: string[];
  /**
   * Attribule-selector tokens parsed from this compound. Each entry is the
   * verbatim text of one attribute selector (e.g. `[type="submit"]`) WITH
   * balanced quote/bracket handling — quoted strings inside the attribute
   * value are respected so a value like `[type="submit]"]` is scanned as a
   * single token. Tokens from `:not(...)` / `:has(...)` are NOT included:
   * those pseudos are opaque (their arguments do NOT positively select),
   * so their attribute predicates must not cross-attribute the selectors
   * into component groups.
   */
  attributeSelectors: string[];
}

// Tokenize one compound selector (no combinators) into its element name and
// class tokens. The element token is the leading type-selector when present
// (e.g. `button` in `button.primary`); class tokens are every `.foo` that
// follows. Pseudo-classes, attribute selectors, and `*` do not contribute
// element or class tokens on their own.
//
// `:is(...)` and `:where(...)` are *component-preserving* functional
// pseudo-classes: SA/RGBA treat them as taking a forgiving selector list, and
// the matched components must still be tokenized so their tokens enter the
// group's classifier (see PerishCode round-4 review on #6250 — the next()
// regex was eating the entire pseudo-class as opaque text, which silently
// dropped `button` from `:where(button)` and `.btn` from `:is(.btn)`,
// erasing their `--tone` from `Buttons.tokenReferences`). The selector-list
// argument is split on commas (depth-aware) and each argument is tokenized as
// its own compound (recursively, so `:where(:is(button))` still works). Pseudos
// like `:not(...)`, `:has(...)`, and `:nth-child(...)` are NOT component-
// preserving — they hide their arguments deliberately — so we leave them as
// opaque skips.
function tokenizeCompound(compound: string): CompoundTokens {
  let element: string | null = null;
  const classes: string[] = [];
  const extraElements: string[] = [];
  const attributeSelectors: string[] = [];
  let i = 0;
  // leading element name (type selector) — must come first in the compound
  const elementMatch = /^([a-zA-Z][a-zA-Z0-9_-]*)/.exec(compound);
  if (elementMatch) {
    element = elementMatch[1]!.toLowerCase();
    i = elementMatch[0].length;
  }
  // walk subsequent simple selectors; only `.foo` (class) tokens are extracted
  while (i < compound.length) {
    const rest = compound.slice(i);
    const classMatch = /^\.([a-zA-Z_][a-zA-Z0-9_-]*)/.exec(rest);
    if (classMatch) {
      classes.push(classMatch[1]!.toLowerCase());
      i += classMatch[0].length;
      continue;
    }
    // attribute selector: `[name? op? value? flags?]` — scan balanced bracket
    // and respect quoted strings inside the value so an attribute value that
    // contains `[...]` itself (e.g. `[data-label="[type=submit]"]`) is captured
    // as ONE token, not split.
    const attributeMatch = /^\[/.exec(rest);
    if (attributeMatch) {
      let j = 1; // skip leading '['
      let inQuote: string | null = null;
      while (j < rest.length) {
        const c = rest[j];
        if (inQuote) {
          if (c === inQuote && rest[j - 1] !== '\\') inQuote = null;
        } else if (c === '"' || c === '\'') {
          inQuote = c;
        } else if (c === ']') {
          break;
        }
        j += 1;
      }
      const tokenEnd = j >= rest.length ? rest.length : j + 1; // include closing ']'
      attributeSelectors.push(rest.slice(0, tokenEnd));
      i += tokenEnd;
      continue;
    }
    const preserveMatch = /^:(?:is|where)\s*\(/i.exec(rest);
    if (preserveMatch) {
      // capture the balanced `(...)` block so nested parens are respected
      const argsStart = i + preserveMatch[0].length - 1; // index of `(`
      let depth = 0;
      let j = argsStart;
      while (j < compound.length) {
        const c = compound[j];
        if (c === '(') depth += 1;
        else if (c === ')') {
          depth -= 1;
          if (depth === 0) break;
        }
        j += 1;
      }
      const inner = compound.slice(argsStart + 1, j); // contents of `(...)`
      // split the inner selector-list by commas (depth-aware over `()`/`[]`)
      for (const arg of splitSelectorList(inner)) {
        const trimmed = arg.trim();
        if (trimmed.length === 0) continue;
        // each argument is a sub-selector; tokenize it (compounds/combinators
        // included) and union its element / class tokens into ours.
        const subCompounds = splitCompoundSelectors(trimmed);
        for (const sub of subCompounds) {
          const subTokens = tokenizeCompound(sub);
          if (subTokens.element) {
            // Collect EVERY element candidate from inside :is()/:where();
            // a compound selector only has one leading type selector, but
            // `:where(button, label)` legitimately exposes both `button`
            // and `label`. The first non-null candidate becomes the
            // primary element token; the rest go into `extraElements` so
            // `selectorMatchesTokens` can run elementMatchers against
            // every candidate and admit the selector to each matching group
            // (e.g. `:where(button, label)` enters BOTH Buttons and Inputs).
            if (element == null) element = subTokens.element;
            else extraElements.push(subTokens.element);
          }
          for (const cls of subTokens.classes) classes.push(cls);
          for (const extra of subTokens.extraElements) {
            if (element == null) element = extra;
            else extraElements.push(extra);
          }
          for (const attr of subTokens.attributeSelectors) attributeSelectors.push(attr);
        }
      }
      i = j + 1; // consume `:...(...)`
      continue;
    }
    // skip pseudo-classes/elements, attribute selectors, `*`, and `:`
    const skipMatch = /^(?:::[a-zA-Z-]+|:[a-zA-Z-]+(?:\([^)]*\))?|\[[^\]]*\]|\*)/.exec(rest);
    if (skipMatch) {
      i += skipMatch[0].length;
      continue;
    }
    // anything else (one char) we cannot tokenize — bail forward
    i += 1;
  }
  return { element, classes, extraElements, attributeSelectors };
}

// Decide whether a selector belongs to a component group by examining its
// tokens at combinator/compound boundaries (PerishCode round-3 review on
// #6250): the previous `^`-anchored full-selector regex dropped token
// attribution for ordinary compound/complex selectors such as
// `button.primary`, `.dialog > button`, and `form input` — a production
// regression. The matcher now:
//   1. checks each compound's element token against `elementMatchers`
//   2. checks each compound's class tokens against `classMatchers`
//   3. checks each compound's attribute selectors against `attributeMatchers`
//      (so `input[type="submit"]` admits the selector to Buttons; previously
//      the raw selector was matched but tokenization lost the attribute text)
//   4. keeps `selectorMatchers` for cases that are not expressible as
//      element/class/attribute tokens; these match the full selector string.
// Any compound passing any of the four matcher families admits the selector.
function selectorMatchesTokens(selector: string, definition: ComponentGroupDefinition): boolean {
  const compounds = splitCompoundSelectors(selector);
  for (const compound of compounds) {
    const { element, classes, extraElements, attributeSelectors } = tokenizeCompound(compound);
    // element token (and any extra element tokens pulled out of :is()/:where())
    // joined together so multi-element compounds can match several groups.
    const elementCandidates = element ? [element, ...extraElements] : extraElements;
    if (elementCandidates.some((token) => definition.elementMatchers.some((matcher) => matcher.test(token)))) {
      return true;
    }
    for (const className of classes) {
      if (definition.classMatchers.some((matcher) => matcher.test(className))) return true;
    }
    // Attribute predicates run against the parsed attribute-selector tokens
    // (e.g. `[type="submit"]`, `[aria-hidden="true"]`) rather than the raw
    // compound text, so opacity rules still apply: a `[type="submit"]` that
    // sits *inside* `:not(...)` never reaches this list (tokenizeCompound
    // leaves `:not()` opaque), and an attribute *value* containing attribute
    // text (e.g. `[data-label="[type=submit]"]`) is captured as ONE token
    // — the matcher regex tests the outer bracket, not the inner quoted
    // bracket — so it does not admit the selector to Buttons just because
    // the value happens to spell `[type=submit]`.
    for (const attrToken of attributeSelectors) {
      if (definition.attributeMatchers.some((matcher) => matcher.test(attrToken))) return true;
    }
  }
  return false;
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
    selectorMatchesTokens(selector, definition),
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
  // PerishCode round-8 blocker 2026-08-03 23:53 (OR-COR-...):
  // stripContainerAtRuleHeaders is not quote-aware — its regex
  // `@(media|supports|container|layer)\b[^{]*\{` breaks at a
  // quoted brace like `@supports selector(.btn-a[data-icon="{"])`.
  // After round-7 introduced iterateCssRules with full
  // quote/escape-aware scanning and `isSupportedAtRuleHeader`
  // recursion, the pre-pass is no longer needed. Drop it so
  // `@supports selector(...)` with a dotted uppercase US base
  // (e.g. `usBRK.B` in CSS `@supports` block) is processed
  // correctly.
  const commentlessCss = stripCssComments(css);

  for (const { selectorList } of iterateCssRules(commentlessCss)) {
    if (selectorList.length === 0) continue;
    if (selectorList.includes(':root')) continue;
    if (/^(?:from|to|\d+(?:\.\d+)?%)$/i.test(selectorList)) continue;
    // Supported at-rule headers (e.g. @media, @supports) and their
    // bodies are handled by iterateCssRules: the header is emitted
    // as a rule and the body is recursed into for inner selectors.
    if (selectorList.startsWith('@') && !isSupportedAtRuleHeader(selectorList)) continue;

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
  // PerishCode round-8 blocker 2026-08-03 23:53: drop the
  // stripContainerAtRuleHeaders pre-pass — its non-quote-aware regex
  // cuts `@supports selector(.btn-a[data-icon="{"])` at the quoted
  // brace and loses the inner `.btn-a` rule's token references.
  // iterateCssRules now recurses through supported at-rules on its own.
  const commentlessCss = stripCssComments(css);

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
    // Supported at-rule headers wrapped around inner rules are recursed
    // into by iterateCssRules (round-8) so the inner rules' tokens reach
    // the references map under their own selectors. The wrapper header
    // itself contributes no token references. Unsupported at-rules
    // (@keyframes / @font-face / @page) were dropped by iterateCssRules.
    if (selectorList.startsWith('@')) continue;

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
    // Find the next '{' that opens a rule body.
    //
    // Round-8 (PR #6250 PerishCode blocker 8-03 23:53): we no longer
    // strip supported at-rule headers via a pre-pass. iterateCssRules
    // recognises `@media` / `@supports` / `@container` / `@layer` headers
    // itself via `isSupportedAtRuleHeader` and recurses through their
    // body slices, so the header text reaches this scanner intact and
    // the inner rules are emitted with their real selectors.
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
      // Empty selector — recursion caller passed an already-flattened body
      // slice that begins with a `{` (shouldn't happen post round-8 since
      // stripContainerAtRuleHeaders no longer truncates headers, but kept
      // as a defensive guard). Recurse to recover inner selectors instead
      // of pushing a garbage "rule" that swallows the whole block.
      rules.push(...iterateCssRules(bodySlice));
    } else if (isSupportedAtRuleHeader(selectorList)) {
      // Round-8 (PR #6250 PerishCode blocker 8-03 23:53): a supported
      // at-rule header survived intact (no stripContainerAtRuleHeaders
      // pre-pass truncates the header to `{`). Do NOT push the wrapper
      // itself as a rule — its body is a *rule tree*, not a declaration
      // list, so flattenNestedBody would fold every inner selector into
      // the wrapper's "body" and the inner .btn-a / .btn-b selectors would
      // never be emitted. Recurse through the body slice so inner rules
      // surface with their real selectorLists and real bodies.
      rules.push(...iterateCssRules(bodySlice));
    } else if (!selectorList.startsWith('@')) {
      // Ordinary selector. Push it as-is; the body still has
      // nested-block declarations flattened into it.
      rules.push({ selectorList, body });
    }
    // Unsupported at-rule header (@keyframes, @font-face, @page, @import,
    // @namespace, @charset): drop the rule entirely — its body is not an
    // ordinary rule tree and recursing would emit garbage selectors from
    // its declaration text.
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

// stripContainerAtRuleHeaders was removed in PR #6250 round-8 (PerishCode
// blocker 8-03 23:53): its non-quote-aware regex
// `@(media|supports|container|layer)\b[^{]*\{` truncated a header like
// `@supports selector(.btn-a[data-icon="{"])` at the quoted brace,
// losing the inner rules. iterateCssRules now recurses through supported
// at-rules directly via `isSupportedAtRuleHeader`.

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
