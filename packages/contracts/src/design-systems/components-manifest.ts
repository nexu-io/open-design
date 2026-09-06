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
  /**
   * Element names matched only where CSS grammar allows a type selector.
   * Unlike `selectorMatchers`, these never match inside class/ID names,
   * attribute selectors, or pseudo-element names/arguments — see
   * `selectorContainsTypeSelector`.
   */
  typeSelectorNames?: string[];
  classMatchers: RegExp[];
  elementMatchers: RegExp[];
};

const COMPONENT_GROUPS: ComponentGroupDefinition[] = [
  {
    id: 'buttons',
    label: 'Buttons and calls to action',
    selectorMatchers: [/\.btn(?:\b|[-_:])/i, /\[type=["']?(?:button|submit|reset)/i],
    typeSelectorNames: ['button'],
    classMatchers: [/^btn(?:$|-)/i, /^button(?:$|-)/i, /^cta(?:$|-)/i],
    elementMatchers: [/^button$/i],
  },
  {
    id: 'inputs',
    label: 'Form fields and controls',
    selectorMatchers: [/\.field(?:\b|[-_:])/i],
    typeSelectorNames: ['input', 'textarea', 'select', 'label'],
    classMatchers: [/^field(?:$|-)/i, /^input(?:$|-)/i, /^control(?:$|-)/i, /^form(?:$|-)/i],
    elementMatchers: [/^(input|textarea|select|label|form)$/i],
  },
  {
    id: 'cards',
    label: 'Cards and panels',
    selectorMatchers: [/\.card(?:\b|[-_:])/i, /\.panel(?:\b|[-_:])/i, /\.tile(?:\b|[-_:])/i],
    classMatchers: [/^card(?:$|-)/i, /^panel(?:$|-)/i, /^tile(?:$|-)/i],
    elementMatchers: [],
  },
  {
    id: 'badges',
    label: 'Badges, chips, and status labels',
    selectorMatchers: [/\.badge(?:\b|[-_:])/i, /\.chip(?:\b|[-_:])/i, /\.tag(?:\b|[-_:])/i, /\.pill(?:\b|[-_:])/i],
    classMatchers: [/^badge(?:$|-)/i, /^chip(?:$|-)/i, /^tag(?:$|-)/i, /^pill(?:$|-)/i, /^status(?:$|-)/i],
    elementMatchers: [],
  },
  {
    id: 'links',
    label: 'Links and inline actions',
    selectorMatchers: [/\.link(?:\b|[-_:])/i],
    typeSelectorNames: ['a'],
    classMatchers: [/^link(?:$|-)/i],
    elementMatchers: [/^a$/i],
  },
  {
    id: 'keyboard',
    label: 'Keyboard hints',
    selectorMatchers: [/\.kbd(?:\b|[-_:])/i],
    typeSelectorNames: ['kbd'],
    classMatchers: [/^kbd(?:$|-)/i, /^keyboard(?:$|-)/i, /^shortcut(?:$|-)/i],
    elementMatchers: [/^kbd$/i],
  },
  {
    id: 'icons',
    label: 'Icon slots',
    selectorMatchers: [/\.icon(?:\b|[-_:])/i, /\[aria-hidden=["']true["']\]/i],
    classMatchers: [/^icon(?:$|-)/i],
    elementMatchers: [/^svg$/i],
  },
  {
    id: 'typography',
    label: 'Typography scale and text utilities',
    selectorMatchers: [/\.lead(?:\b|[-_:])/i, /\.eyebrow(?:\b|[-_:])/i, /\.body-(?:muted|sm|small)\b/i],
    typeSelectorNames: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    classMatchers: [/^lead$/i, /^eyebrow$/i, /^body-(?:muted|sm|small)$/i, /^caption(?:$|-)/i],
    elementMatchers: [/^h[1-6]$/i, /^p$/i],
  },
  {
    id: 'layout',
    label: 'Layout primitives',
    selectorMatchers: [/\.container(?:\b|[-_:])/i, /\.stack-\d+\b/i, /\.row-(?:between|center|start|end)\b/i],
    typeSelectorNames: ['section', 'main', 'nav'],
    classMatchers: [/^container$/i, /^stack-\d+$/i, /^row-(?:between|center|start|end)$/i, /^grid$/i, /^layout(?:$|-)/i],
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

/**
 * Invariant: an element name counts as present in a selector only where CSS
 * grammar allows a type selector to occur. Class and ID names, attribute
 * selectors, and pseudo-class/pseudo-element names never contribute matches,
 * and neither do functional pseudo arguments whose grammar carries values
 * rather than selectors (e.g. `::part(select)`, `:lang(select)`,
 * `:state(label)`). Only selector-bearing argument positions stay matchable:
 * the pseudo-classes in `SELECTOR_BEARING_PSEUDO_CLASSES`, the selector after
 * `of` in `:nth-child()`/`:nth-last-child()`, and `::slotted()`.
 */
function selectorContainsTypeSelector(selector: string, name: string): boolean {
  const masked = maskNonTypeSelectorText(selector);
  const boundary = new RegExp(`(?:^|[\\s>+~,(])${name}(?:$|[\\s>+~,.:#[)])`, 'i');
  return boundary.test(masked);
}

const SELECTOR_IDENT_CHAR = /[-\w\u0080-\uffff]/;

const HEX_DIGIT = /[0-9a-f]/i;

/**
 * Exclusive end index of the CSS escape starting at `start` (a backslash):
 * either a single escaped source character, or up to six hex digits plus one
 * optional whitespace terminator that belongs to the escape, not to the
 * surrounding selector.
 */
function cssEscapeEndIndex(text: string, start: number): number {
  let index = start + 1;
  if (index >= text.length) return index;
  if (!HEX_DIGIT.test(text.charAt(index))) return index + 1;
  let digits = 0;
  while (digits < 6 && HEX_DIGIT.test(text.charAt(index))) {
    index += 1;
    digits += 1;
  }
  if (/[ \t\n\r\f]/.test(text.charAt(index))) index += 1;
  return index;
}

/** Decoded character of the escape spanning [start, end); U+FFFD when the code point is invalid. */
function decodeCssEscape(text: string, start: number, end: number): string {
  const body = text.slice(start + 1, end);
  if (body === '') return '\ufffd';
  if (!HEX_DIGIT.test(body.charAt(0))) return body;
  const codePoint = Number.parseInt(body.trim(), 16);
  if (Number.isNaN(codePoint) || codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    return '\ufffd';
  }
  return String.fromCodePoint(codePoint);
}

/** Functional pseudo-classes whose arguments are themselves selectors. */
const SELECTOR_BEARING_PSEUDO_CLASSES = new Set(['is', 'where', 'not', 'has', 'host', 'host-context']);

/**
 * Blanks out every part of a selector where a type selector cannot occur —
 * class/ID names, attribute blocks, pseudo names, and name-valued
 * pseudo-element arguments — replacing them with spaces so the surviving
 * text can be matched for element names with plain boundary checks.
 * Quotes and CSS escapes inside attribute blocks are honored so a bracket
 * or quote inside a string never ends the block early. Escapes are consumed
 * in full (hex digits plus the optional whitespace terminator), and escapes
 * at type-selector positions are decoded so `\\62 utton` reads as `button`
 * while a decoded non-ident character keeps the identifier glued together.
 */
function maskNonTypeSelectorText(selector: string): string {
  let out = '';
  let index = 0;

  const maskIdentifier = (): void => {
    while (index < selector.length) {
      const char = selector.charAt(index);
      if (char === '\\') {
        const end = cssEscapeEndIndex(selector, index);
        out += ' '.repeat(end - index);
        index = end;
        continue;
      }
      if (!SELECTOR_IDENT_CHAR.test(char)) break;
      out += ' ';
      index += 1;
    }
  };

  const maskDelimitedBlock = (open: string, close: string): void => {
    let depth = 0;
    while (index < selector.length) {
      const char = selector.charAt(index);
      if (char === '\\') {
        const end = cssEscapeEndIndex(selector, index);
        out += ' '.repeat(end - index);
        index = end;
        continue;
      }
      if (char === '"' || char === "'") {
        out += ' ';
        index += 1;
        while (index < selector.length) {
          const quoted = selector.charAt(index);
          if (quoted === '\\') {
            const quotedEnd = cssEscapeEndIndex(selector, index);
            out += ' '.repeat(quotedEnd - index);
            index = quotedEnd;
            continue;
          }
          out += ' ';
          index += 1;
          if (quoted === char) break;
        }
        continue;
      }
      if (char === open) depth += 1;
      if (char === close) depth -= 1;
      out += ' ';
      index += 1;
      if (depth === 0) break;
    }
  };

  // An+B text before the `of` keyword is a value, not a selector; the part
  // after `of` (and the closing paren) returns to the normal selector walk.
  const maskNthArgsUpToOfKeyword = (): void => {
    out += ' ';
    index += 1;
    while (index < selector.length) {
      const char = selector.charAt(index);
      if (char === ')') {
        out += ' ';
        index += 1;
        return;
      }
      if (
        (char === 'o' || char === 'O') &&
        /f/i.test(selector.charAt(index + 1)) &&
        !SELECTOR_IDENT_CHAR.test(selector.charAt(index - 1)) &&
        !SELECTOR_IDENT_CHAR.test(selector.charAt(index + 2))
      ) {
        out += '  ';
        index += 2;
        return;
      }
      out += ' ';
      index += 1;
    }
  };

  while (index < selector.length) {
    const char = selector.charAt(index);
    if (char === '\\') {
      const end = cssEscapeEndIndex(selector, index);
      const decoded = decodeCssEscape(selector, index, end);
      out += SELECTOR_IDENT_CHAR.test(decoded) ? decoded : '_';
      index = end;
      continue;
    }
    if (char === '.' || char === '#') {
      out += ' ';
      index += 1;
      maskIdentifier();
      continue;
    }
    if (char === '[') {
      maskDelimitedBlock('[', ']');
      continue;
    }
    if (char === ':') {
      const isPseudoElement = selector.charAt(index + 1) === ':';
      out += isPseudoElement ? '  ' : ' ';
      index += isPseudoElement ? 2 : 1;
      const nameStart = index;
      maskIdentifier();
      const pseudoName = selector.slice(nameStart, index).toLowerCase();
      if (selector.charAt(index) === '(') {
        const argsAreSelectors = isPseudoElement
          ? pseudoName === 'slotted'
          : SELECTOR_BEARING_PSEUDO_CLASSES.has(pseudoName);
        if (!argsAreSelectors) {
          if (!isPseudoElement && pseudoName.startsWith('nth-')) {
            maskNthArgsUpToOfKeyword();
          } else {
            maskDelimitedBlock('(', ')');
          }
        }
      }
      continue;
    }
    out += char;
    index += 1;
  }

  return out;
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
  const selectors = inventory.selectors.filter(
    (selector) =>
      definition.selectorMatchers.some((matcher) => matcher.test(selector)) ||
      (definition.typeSelectorNames ?? []).some((name) => selectorContainsTypeSelector(selector, name)),
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
  for (const rule of collectCssRules(css)) {
    for (const selector of rule.selectors) {
      selectors.add(selector);
    }
  }
  return [...selectors].sort((a, b) => a.localeCompare(b));
}

function extractSelectorTokenReferences(css: string): Map<string, string[]> {
  const referencesBySelector = new Map<string, Set<string>>();

  for (const rule of collectCssRules(css)) {
    const tokenReferences = extractTokenReferences(rule.declarations);
    if (tokenReferences.length === 0) continue;

    for (const selector of rule.selectors) {
      const selectorReferences = referencesBySelector.get(selector) ?? new Set<string>();
      for (const token of tokenReferences) {
        selectorReferences.add(token);
      }
      referencesBySelector.set(selector, selectorReferences);
    }
  }

  return new Map(
    [...referencesBySelector.entries()]
      .map(([selector, references]) => [selector, [...references].sort((a, b) => a.localeCompare(b))] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

type CssRule = {
  selectors: string[];
  declarations: string;
};

const TRAVERSABLE_GROUP_AT_RULES = /^@(?:media|supports|container|layer|scope|starting-style)\b/i;

/**
 * True when a block prelude is an in-progress custom-property declaration
 * (`--<ident>` through its colon). Custom properties accept the permissive
 * `<declaration-value>` grammar, which includes balanced brace blocks
 * (CSS Variables §2.1), so a `{` after `--name:` opens value text, not a
 * nested rule. Property names use the `<ident-token>` grammar, so CSS
 * escapes inside the name are consumed in full via `cssEscapeEndIndex`.
 */
function isCustomPropertyDeclarationPrelude(prelude: string): boolean {
  if (!prelude.startsWith('--')) return false;
  let index = 2;
  while (index < prelude.length) {
    const char = prelude.charAt(index);
    if (char === '\\') {
      index = cssEscapeEndIndex(prelude, index);
      continue;
    }
    if (!SELECTOR_IDENT_CHAR.test(char)) break;
    index += 1;
  }
  while (index < prelude.length && /\s/.test(prelude.charAt(index))) index += 1;
  return prelude.charAt(index) === ':';
}

/**
 * Brace-depth CSS scanner. Invariant: every rule's own declarations (excluding
 * nested-block bodies) are attributed to its resolved selector list — including
 * rules that follow another rule or a `:root` block, and rules using CSS
 * nesting (`&:hover { ... }`, nested grouping at-rules such as `@media` or
 * `@starting-style`). Braces and quotes inside quoted strings (`content: '{'`),
 * behind CSS escapes (`.content-\[\'x\'\]`), or inside function values
 * (unquoted `url(...)` data URIs) are text, not structure, and so are
 * balanced brace blocks inside custom-property values (`--payload: { ... };`).
 * At-rules whose bodies do not describe the current selector tree
 * (`@keyframes`, `@font-face`, ...) and `:root` rules are skipped.
 */
function collectCssRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  walkCssBlock(stripCssComments(css), [], rules);
  return rules;
}

function walkCssBlock(body: string, selfSelectors: string[], out: CssRule[]): void {
  let declarations = '';
  let segment = '';
  let index = 0;
  let parenDepth = 0;

  while (index < body.length) {
    const char = body[index];
    if (char === '\\') {
      segment += body.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (char === '"' || char === "'") {
      const end = findStringEnd(body, index);
      segment += body.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    if (char === '{' && parenDepth === 0) {
      const close = findMatchingBrace(body, index);
      const { leadingDeclarations, prelude } = splitBlockPrelude(segment);
      if (isCustomPropertyDeclarationPrelude(prelude.trim())) {
        segment += body.slice(index, close + 1);
        index = close + 1;
        continue;
      }
      declarations += leadingDeclarations;
      enterCssBlock(prelude.trim(), body.slice(index + 1, close), selfSelectors, out);
      segment = '';
      index = close + 1;
      continue;
    }
    if (char === '}' && parenDepth === 0) {
      declarations += segment;
      segment = '';
      index += 1;
      continue;
    }
    if (char === '(') parenDepth += 1;
    else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
    segment += char;
    index += 1;
  }

  declarations += segment;
  if (selfSelectors.length > 0) {
    out.push({ selectors: selfSelectors, declarations });
  }
}

function enterCssBlock(prelude: string, body: string, parentSelectors: string[], out: CssRule[]): void {
  if (prelude.length === 0) return;
  if (prelude.startsWith('@')) {
    if (TRAVERSABLE_GROUP_AT_RULES.test(prelude)) {
      walkCssBlock(body, parentSelectors, out);
    }
    return;
  }
  if (prelude.includes(':root')) return;

  const selectors = splitSelectorList(prelude)
    .map((selector) => normalizeSelector(selector))
    .filter((selector) => selector.length > 0);
  const resolved = resolveNestedSelectors(selectors, parentSelectors);
  if (resolved.length === 0) return;
  walkCssBlock(body, resolved, out);
}

function resolveNestedSelectors(selectors: string[], parentSelectors: string[]): string[] {
  if (parentSelectors.length === 0) return selectors;
  return parentSelectors.flatMap((parent) =>
    selectors.map((selector) => expandNestingSelector(selector, parent) ?? `${parent} ${selector}`),
  );
}

/**
 * Expands every nesting-selector `&` into `parent`. Only an unescaped `&`
 * outside quoted strings is a nesting selector; `&` inside attribute-value
 * strings (`[data-label="A&B"]`) or escaped as `\&` stays literal. Returns
 * null when the selector contains no nesting selector.
 */
function expandNestingSelector(selector: string, parent: string): string | null {
  let out = '';
  let found = false;
  let index = 0;
  while (index < selector.length) {
    const char = selector[index];
    if (char === '\\') {
      out += selector.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (char === '"' || char === "'") {
      const end = findStringEnd(selector, index);
      out += selector.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    if (char === '&') {
      out += parent;
      found = true;
      index += 1;
      continue;
    }
    out += char;
    index += 1;
  }
  return found ? out : null;
}

function splitBlockPrelude(segment: string): { leadingDeclarations: string; prelude: string } {
  let depth = 0;
  let lastSemicolon = -1;
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      index = findStringEnd(segment, index);
      continue;
    }
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    else if (char === ';' && depth === 0) lastSemicolon = index;
  }
  return {
    leadingDeclarations: segment.slice(0, lastSemicolon + 1),
    prelude: segment.slice(lastSemicolon + 1),
  };
}

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  let parenDepth = 0;
  let index = openIndex;
  while (index < source.length) {
    const char = source[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === '"' || char === "'") {
      index = findStringEnd(source, index) + 1;
      continue;
    }
    if (char === '(') parenDepth += 1;
    else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (parenDepth === 0) {
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) return index;
      }
    }
    index += 1;
  }
  return source.length;
}

/** Index of the closing quote for the string opened at `openIndex`, honoring backslash escapes. */
function findStringEnd(source: string, openIndex: number): number {
  const quote = source[openIndex];
  for (let index = openIndex + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === quote) return index;
  }
  return source.length - 1;
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
  let out = '';
  let index = 0;
  while (index < css.length) {
    const char = css[index];
    if (char === '\\') {
      out += css.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (char === '"' || char === "'") {
      const end = findStringEnd(css, index);
      out += css.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    if (char === '/' && css[index + 1] === '*') {
      const close = css.indexOf('*/', index + 2);
      index = close === -1 ? css.length : close + 2;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
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
