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

/**
 * English plural of a matcher word: sibilants take `-es` (`status` ->
 * `statuses`), a consonant before `y` takes `-ies`, everything else `-s`.
 */
function pluralOf(word: string): string {
  if (/(?:s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

/**
 * Match a whole class-name segment, singular or plural. Substring matching
 * pulled unrelated classes into groups — `platform` into form fields,
 * `icon-octagon` into buttons — while segment matching keeps the families each
 * group owns: `status`, `statuses-list`, `icon-status` and `statusBadge` all
 * reach the badges group, because callers also test the kebab-cased spelling
 * (see `classNameVariants`).
 */
function classSegment(word: string): RegExp {
  const forms = [pluralOf(word), word];
  return new RegExp(`(?:^|[-_])(?:${forms.join('|')})(?:$|[-_])`, 'i');
}

/**
 * A class name as written plus its kebab-cased spelling, so one segment matcher
 * covers `icon-status`, `icon_status` and `iconStatus` without every matcher
 * having to describe a case boundary. `HTMLButton` splits on the acronym edge
 * as well, giving `HTML-Button`.
 */
function classNameVariants(className: string): string[] {
  const kebab = className
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2');
  return kebab === className ? [className] : [className, kebab];
}

const COMPONENT_GROUPS: ComponentGroupDefinition[] = [
  {
    id: 'buttons',
    label: 'Buttons and calls to action',
    selectorMatchers: [/\bbutton\b/i, /\.btn(?:\b|[-_:])/i, /\[type=["']?(?:button|submit|reset)/i],
    classMatchers: [/^btn(?:$|-)/i, classSegment('button'), classSegment('cta')],
    elementMatchers: [/^button$/i],
  },
  {
    id: 'inputs',
    label: 'Form fields and controls',
    selectorMatchers: [/\binput\b/i, /\btextarea\b/i, /\bselect\b/i, /\.field(?:\b|[-_:])/i, /\blabel\b/i],
    classMatchers: [/^field(?:$|-)/i, classSegment('input'), classSegment('control'), classSegment('form')],
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
    classMatchers: [/^badge(?:$|-)/i, /^chip(?:$|-)/i, /^tag(?:$|-)/i, /^pill(?:$|-)/i, classSegment('status')],
    elementMatchers: [],
  },
  {
    id: 'links',
    label: 'Links and inline actions',
    selectorMatchers: [/\ba\b/i, /\.link(?:\b|[-_:])/i],
    classMatchers: [/^link(?:$|-)/i],
    elementMatchers: [/^a$/i],
  },
  {
    id: 'keyboard',
    label: 'Keyboard hints',
    selectorMatchers: [/\bkbd\b/i, /\.kbd(?:\b|[-_:])/i],
    classMatchers: [/^kbd(?:$|-)/i, classSegment('keyboard'), classSegment('shortcut')],
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
    selectorMatchers: [/\bh[1-6]\b/i, /\.lead(?:\b|[-_:])/i, /\.eyebrow(?:\b|[-_:])/i, /\.body-(?:muted|sm|small)\b/i],
    classMatchers: [/^lead$/i, /^eyebrow$/i, /^body-(?:muted|sm|small)$/i, classSegment('caption')],
    elementMatchers: [/^h[1-6]$/i, /^p$/i],
  },
  {
    id: 'layout',
    label: 'Layout primitives',
    selectorMatchers: [
      /\.container(?:\b|[-_:])/i,
      /\.stack-\d+\b/i,
      /\.row-(?:between|center|start|end)\b/i,
      /\bsection\b/i,
      /\bmain\b/i,
      /\bnav\b/i,
    ],
    classMatchers: [/^container$/i, /^stack-\d+$/i, /^row-(?:between|center|start|end)$/i, classSegment('grid'), classSegment('layout')],
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
    classNameVariants(className).some((variant) =>
      definition.classMatchers.some((matcher) => matcher.test(variant)),
    ),
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

type ScannedCssRule = {
  /** Raw prelude as written, whitespace-normalized. */
  prelude: string;
  /** Selectors with any nesting resolved against their ancestors. */
  selectors: string[];
  /** The rule's own declarations, excluding those of any nested rule. */
  declarations: string;
};

type ScanCursor = {
  declarations: string;
  index: number;
};

type ScanScope = {
  /** Selectors this level's rules nest inside, outermost already resolved. */
  ancestors: string[];
  /** False inside `@keyframes`, whose children are positions, not selectors. */
  emitRules: boolean;
  /** False at the top level, where a stray `}` is noise rather than an end. */
  nested: boolean;
};

/**
 * Walk CSS into rules. A regex cannot do this correctly: it cannot balance
 * nested blocks, and any pattern that consumes the delimiter between two rules
 * drops every other rule. Scanning is string-, escape-, comment-, and
 * paren-aware so braces inside `content: "{"`, `.w-\{full\}`, or
 * `url("a{b}.css")` do not open or close a block.
 */
function scanCssRules(css: string): ScannedCssRule[] {
  const rules: ScannedCssRule[] = [];
  scanCssStatements(css, 0, { ancestors: [], emitRules: true, nested: false }, rules);
  return rules;
}

/** `@keyframes`, including the vendor-prefixed spellings. */
function isKeyframesPrelude(prelude: string): boolean {
  return /^@(?:-[a-z]+-)?keyframes\b/i.test(prelude);
}

/**
 * Scan statements from `start` until the block closes or input ends, appending
 * style rules to `rules`. Returns the declarations owned by this level, so a
 * conditional at-rule nested in a style rule (`.card { @media … { … } }`) hands
 * its declarations back to the rule that encloses it.
 */
function scanCssStatements(
  css: string,
  start: number,
  scope: ScanScope,
  rules: ScannedCssRule[],
): ScanCursor {
  let declarations = '';
  let buffer = '';
  let index = start;

  const takeStatement = () => {
    const statement = buffer.trim();
    buffer = '';
    // Statement at-rules (`@charset`, `@namespace`, `@import`, statement-form
    // `@layer`) own no block and declare nothing.
    if (statement.length > 0 && !statement.startsWith('@')) {
      declarations += `${statement};`;
    }
  };

  while (index < css.length) {
    const char = css.charAt(index);

    if (char === '/' && css[index + 1] === '*') {
      // CSS ends an unterminated comment at EOF, so an unclosed `/*` legitimately
      // comments out the remainder rather than being recovered from.
      const close = css.indexOf('*/', index + 2);
      index = close === -1 ? css.length : close + 2;
      continue;
    }

    if (char === '\\') {
      const next = skipCssEscape(css, index);
      buffer += css.slice(index, next);
      index = next;
      continue;
    }

    if (char === '"' || char === "'") {
      const end = readCssString(css, index);
      buffer += css.slice(index, end);
      index = end;
      continue;
    }

    if (char === '(') {
      const end = readCssParens(css, index);
      buffer += css.slice(index, end);
      index = end;
      continue;
    }

    if (char === ';') {
      takeStatement();
      index += 1;
      continue;
    }

    if (char === '}') {
      takeStatement();
      // Only a nested scan is closed by `}`. At the top level an unbalanced
      // brace is malformed input, and skipping it keeps the rest of the
      // stylesheet readable instead of discarding it.
      if (scope.nested) return { declarations, index: index + 1 };
      index += 1;
      continue;
    }

    if (char === '{') {
      const prelude = normalizeSelector(buffer);
      buffer = '';
      if (prelude.startsWith('@')) {
        // Conditional groups (`@media`, `@supports`, `@container`, block-form
        // `@layer`) do not change the selector their contents apply to, so they
        // stay transparent. A `@keyframes` block is different: its children are
        // animation positions, not component surface, so the block is scanned
        // for balance but contributes no rules.
        const block = scanCssStatements(
          css,
          index + 1,
          {
            ancestors: scope.ancestors,
            emitRules: scope.emitRules && !isKeyframesPrelude(prelude),
            nested: true,
          },
          rules,
        );
        declarations += block.declarations;
        index = block.index;
        continue;
      }
      const selectors = resolveNestedSelectors(prelude, scope.ancestors);
      const block = scanCssStatements(
        css,
        index + 1,
        { ancestors: selectors, emitRules: scope.emitRules, nested: true },
        rules,
      );
      if (scope.emitRules) rules.push({ prelude, selectors, declarations: block.declarations });
      index = block.index;
      continue;
    }

    buffer += char;
    index += 1;
  }

  takeStatement();
  return { declarations, index };
}

/**
 * Index just past the escape sequence starting at `start`. CSS preprocessing
 * folds CRLF into one newline, so an escaped CRLF is a single line continuation
 * rather than an escaped CR followed by a stray LF.
 */
function skipCssEscape(css: string, start: number): number {
  return css.startsWith('\r\n', start + 1) ? start + 3 : start + 2;
}

/** CR, LF and form feed all end a line once CSS preprocessing is applied. */
function isCssNewline(char: string): boolean {
  return char === '\n' || char === '\r' || char === '\f';
}

/**
 * Index just past the closing quote of the string starting at `start`. Any
 * unescaped newline ends it, matching how CSS treats an unterminated string, so
 * a stray quote does not swallow the rest of the stylesheet.
 */
function readCssString(css: string, start: number): number {
  const quote = css[start];
  let index = start + 1;
  while (index < css.length) {
    const char = css.charAt(index);
    if (char === '\\') {
      index = skipCssEscape(css, index);
      continue;
    }
    if (isCssNewline(char)) return index;
    if (char === quote) return index + 1;
    index += 1;
  }
  return css.length;
}

/**
 * Index just past the balanced `)` of the group starting at `start`. An
 * unescaped, unquoted block brace ends the group instead: braces do not appear
 * inside a function in well-formed CSS, so meeting one means the `(` was never
 * closed, and stopping keeps the rest of the stylesheet readable rather than
 * consuming it as part of the function.
 */
function readCssParens(css: string, start: number): number {
  let depth = 0;
  let index = start;
  while (index < css.length) {
    const char = css.charAt(index);
    if (char === '\\') {
      index = skipCssEscape(css, index);
      continue;
    }
    if (char === '"' || char === "'") {
      index = readCssString(css, index);
      continue;
    }
    if (char === '{' || char === '}') return index;
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }
  return css.length;
}

function resolveNestedSelectors(prelude: string, ancestors: string[]): string[] {
  const parts = splitSelectorList(prelude)
    .map((selector) => normalizeSelector(selector))
    .filter((selector) => selector.length > 0);
  if (ancestors.length === 0) return parts;

  const resolved: string[] = [];
  for (const ancestor of ancestors) {
    for (const part of parts) {
      resolved.push(
        containsNestingSelector(part)
          ? normalizeSelector(substituteNestingSelector(part, ancestor))
          : `${ancestor} ${part}`,
      );
    }
  }
  return resolved;
}

/**
 * `&` inside quoted text — `[data-state="&"]` — is part of a value, not the
 * nesting selector, so quoted spans are copied through untouched.
 */
function substituteNestingSelector(selector: string, ancestor: string): string {
  let result = '';
  let index = 0;
  while (index < selector.length) {
    const char = selector.charAt(index);
    if (char === '"' || char === "'") {
      const end = readCssString(selector, index);
      result += selector.slice(index, end);
      index = end;
      continue;
    }
    result += char === '&' ? ancestor : char;
    index += 1;
  }
  return result;
}

function containsNestingSelector(selector: string): boolean {
  return substituteNestingSelector(selector, '\u0000').includes('\u0000');
}

/**
 * `:root` blocks declare tokens rather than component surface, and a keyframe
 * stop list is a set of animation positions rather than selectors. `@keyframes`
 * blocks already contribute no rules; this also covers a stop list reaching the
 * consumers by any other route. Both are matched on the prelude as written so
 * the rule is judged the way its author wrote it.
 */
function isTokenOrKeyframeRule(prelude: string): boolean {
  return prelude.includes(':root') || isKeyframeStopList(prelude);
}

function isKeyframeStopList(prelude: string): boolean {
  const stops = prelude.split(',').map((stop) => stop.trim()).filter((stop) => stop.length > 0);
  return stops.length > 0 && stops.every((stop) => /^(?:from|to|\d+(?:\.\d+)?%)$/i.test(stop));
}

function extractCssSelectors(css: string): string[] {
  const selectors = new Set<string>();

  for (const rule of scanCssRules(css)) {
    if (isTokenOrKeyframeRule(rule.prelude)) continue;
    for (const selector of rule.selectors) {
      if (selector.length > 0) selectors.add(selector);
    }
  }

  return [...selectors].sort((a, b) => a.localeCompare(b));
}

function extractSelectorTokenReferences(css: string): Map<string, string[]> {
  const referencesBySelector = new Map<string, Set<string>>();

  for (const rule of scanCssRules(css)) {
    if (isTokenOrKeyframeRule(rule.prelude)) continue;
    const tokenReferences = extractTokenReferences(rule.declarations);
    if (tokenReferences.length === 0) continue;

    for (const selector of rule.selectors) {
      if (selector.length === 0) continue;
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
