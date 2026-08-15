import { parse } from '@babel/parser';
import type {
  Expression,
  JSXAttribute,
  JSXElement,
  JSXExpressionContainer,
  JSXFragment,
  JSXIdentifier,
  JSXMemberExpression,
  JSXNamespacedName,
  JSXOpeningElement,
  JSXSpreadAttribute,
  Node,
  TemplateLiteral,
} from '@babel/types';
import { load } from 'cheerio';
import postcss, { type Declaration } from 'postcss';

import {
  DESIGN_SYSTEM_ADHERENCE_SCHEMA_VERSION,
  resolveDesignSystemIntentForGeneration,
  type DesignSystemAdherenceCheck,
  type DesignSystemAdherenceReport,
  type DesignSystemIntentSelection,
  type DesignSystemRuntimeBundle,
} from '@open-design/contracts';

export type DesignSystemAdherenceArtifact = {
  path: string;
  content: string;
  size: number;
  mime?: string;
};

export function validateDesignSystemAdherence(input: {
  bundle: DesignSystemRuntimeBundle;
  intent: string;
  artifacts: readonly DesignSystemAdherenceArtifact[];
  tokensCss?: string;
}): DesignSystemAdherenceReport {
  const resolution = resolveDesignSystemIntentForGeneration(input.bundle, input.intent);
  const checks: DesignSystemAdherenceCheck[] = [];

  if (resolution.action === 'request-human-confirmation') {
    checks.push({
      id: 'intent-resolution',
      status: 'needs-confirmation',
      message: resolution.reason === 'no-match'
        ? `No component is mapped to ${input.intent}; the design system requires human confirmation.`
        : `Multiple components match ${input.intent}; the design system requires human confirmation.`,
      remediation: 'Ask the user to choose an existing component or approve a documented exception before continuing.',
    });
    checks.push(validateFallbackMarker(input.artifacts, resolution.outputMarker));
    return buildReport(input.intent, resolution, input.artifacts, checks);
  }

  checks.push({
    id: 'intent-resolution',
    status: 'passed',
    message: resolution.action === 'reuse-components'
      ? `Resolved ${input.intent} to ${resolution.matches.length} declared component selection(s).`
      : `Applied the declared ${resolution.action} fallback for ${input.intent}.`,
  });

  if (resolution.action !== 'reuse-components') {
    checks.push(validateFallbackMarker(input.artifacts, resolution.outputMarker));
    checks.push(...validateTokenReferences(
      input.artifacts,
      input.tokensCss,
      input.bundle.lint.requireTokenReferences,
    ));
    checks.push(validateUnauthorizedColorLiterals(
      input.artifacts,
      input.tokensCss,
      input.bundle.lint.forbidUnauthorizedColorLiteralsOutsideTokenDefinitions,
    ));
    return buildReport(input.intent, resolution, input.artifacts, checks);
  }

  for (const selection of resolution.matches) {
    checks.push(validateComponentReuse(input.artifacts, selection, input.bundle.lint.requireMappedComponentReuse));
    if (selection.variant !== undefined) {
      checks.push(validateVariantReuse(input.artifacts, selection));
    }
    checks.push(...validateDeclaredStates(
      input.artifacts,
      selection,
      input.bundle.lint.requireDeclaredStates,
    ));
  }

  checks.push(...validateTokenReferences(
    input.artifacts,
    input.tokensCss,
    input.bundle.lint.requireTokenReferences,
  ));
  checks.push(validateUnauthorizedColorLiterals(
    input.artifacts,
    input.tokensCss,
    input.bundle.lint.forbidUnauthorizedColorLiteralsOutsideTokenDefinitions,
  ));

  return buildReport(input.intent, resolution, input.artifacts, checks);
}

function validateComponentReuse(
  artifacts: readonly DesignSystemAdherenceArtifact[],
  selection: DesignSystemIntentSelection,
  required: boolean,
): DesignSystemAdherenceCheck {
  if (!required) {
    return {
      id: 'mapped-component-reuse',
      status: 'not-applicable',
      subject: selection.component.id,
      message: 'The active design system does not require mapped component reuse.',
    };
  }

  const usage = selectorUsage(artifacts, selection.component.selectors);
  if (usage.count >= selection.minInstances) {
    return {
      id: 'mapped-component-reuse',
      status: 'passed',
      subject: selection.component.id,
      message: `Found ${usage.count} instance(s) of ${selection.component.name}; at least ${selection.minInstances} required.`,
      evidence: usage.paths,
    };
  }
  return {
    id: 'mapped-component-reuse',
    status: 'failed',
    subject: selection.component.id,
    message: `Found ${usage.count} instance(s) of ${selection.component.name}; at least ${selection.minInstances} required.`,
    remediation: `Reuse the returned ${selection.component.id} implementation and one of these selectors: ${selection.component.selectors.join(', ')}.`,
  };
}

function validateVariantReuse(
  artifacts: readonly DesignSystemAdherenceArtifact[],
  selection: DesignSystemIntentSelection,
): DesignSystemAdherenceCheck {
  const variant = selection.variant!;
  const usage = selectorUsage(artifacts, variant.selectors);
  if (usage.count > 0) {
    return {
      id: 'variant-reuse',
      status: 'passed',
      subject: `${selection.component.id}.${variant.id}`,
      message: `Found the declared ${variant.id} variant.`,
      evidence: usage.paths,
    };
  }
  return {
    id: 'variant-reuse',
    status: 'failed',
    subject: `${selection.component.id}.${variant.id}`,
    message: `The declared ${variant.id} variant was not found in the generated artifacts.`,
    remediation: `Apply one of these variant selectors: ${variant.selectors.join(', ')}.`,
  };
}

function validateDeclaredStates(
  artifacts: readonly DesignSystemAdherenceArtifact[],
  selection: DesignSystemIntentSelection,
  required: boolean,
): DesignSystemAdherenceCheck[] {
  if (!required) {
    return [{
      id: 'declared-state',
      status: 'not-applicable',
      subject: selection.component.id,
      message: 'The active design system does not require declared state coverage.',
    }];
  }
  if (selection.states.length === 0) {
    return [{
      id: 'declared-state',
      status: 'not-applicable',
      subject: selection.component.id,
      message: 'This component selection declares no required states.',
    }];
  }

  return selection.states.map((state) => {
    const staticSelectors = state.selectors.filter((selector) => !hasPseudoSelector(selector));
    const usage = selectorUsage(artifacts, staticSelectors);
    const cssEvidence = artifacts
      .filter((artifact) => state.selectors.some((selector) =>
        hasPseudoSelector(selector) && hasCssRule(visualStyleSource(artifact), selector)))
      .map((artifact) => artifact.path);
    const evidence = unique([...usage.paths, ...cssEvidence]);
    if (usage.count > 0 || cssEvidence.length > 0) {
      return {
        id: 'declared-state',
        status: 'passed',
        subject: `${selection.component.id}.${state.id}`,
        message: `Found the declared ${state.id} state.`,
        evidence,
      };
    }
    return {
      id: 'declared-state',
      status: 'failed',
      subject: `${selection.component.id}.${state.id}`,
      message: `The declared ${state.id} state is missing.`,
      remediation: `Implement one of these state selectors: ${state.selectors.join(', ')}.`,
    };
  });
}

function hasPseudoSelector(selector: string): boolean {
  return /:{1,2}[A-Za-z-]+/u.test(selector);
}

function validateTokenReferences(
  artifacts: readonly DesignSystemAdherenceArtifact[],
  tokensCss: string | undefined,
  required: boolean,
): DesignSystemAdherenceCheck[] {
  if (!required) {
    return [{
      id: 'token-reference',
      status: 'not-applicable',
      message: 'The active design system does not require token references.',
    }];
  }

  const references = collectStyleMatches(artifacts, /var\(\s*(--[A-Za-z0-9_-]+)/gu, 1);
  const declared = collectDeclaredTokenNames(tokensCss ?? '');
  const checks: DesignSystemAdherenceCheck[] = [];
  if (declared.size === 0) {
    checks.push({
      id: 'token-reference',
      status: 'failed',
      message: 'The structured design-system package has no readable token definitions.',
      remediation: 'Restore the manifest-declared tokens.css before relying on structured generation.',
    });
    return checks;
  }

  if (references.values.length === 0) {
    checks.push({
      id: 'token-reference',
      status: 'failed',
      message: 'No design-token references were found in the generated artifacts.',
      remediation: 'Replace repeated visual literals with var(--token-name) references from the active tokens.css.',
    });
  } else {
    checks.push({
      id: 'token-reference',
      status: 'passed',
      message: `Found ${references.values.length} design-token reference(s).`,
      evidence: references.paths,
    });
  }

  const unauthorized = unique(references.values.filter((token) => !declared.has(token)));
  checks.push(unauthorized.length === 0
    ? {
        id: 'unauthorized-token-reference',
        status: 'passed',
        message: 'Every referenced token is declared by the active design system.',
      }
    : {
        id: 'unauthorized-token-reference',
        status: 'failed',
        message: `Found undeclared token reference(s): ${unauthorized.join(', ')}.`,
        remediation: 'Use a declared token or add the missing token to the design system before using it.',
        evidence: references.paths,
      });
  return checks;
}

function validateUnauthorizedColorLiterals(
  artifacts: readonly DesignSystemAdherenceArtifact[],
  tokensCss: string | undefined,
  forbidden: boolean,
): DesignSystemAdherenceCheck {
  if (!forbidden) {
    return {
      id: 'unauthorized-color-literal',
      status: 'not-applicable',
      message: 'The active design system allows color literals outside token definitions.',
    };
  }

  const findings = artifacts.flatMap((artifact) =>
    visualStyleFragments(artifact).flatMap((fragment) =>
      findColorLiteralsOutsideTokenDefinitions(fragment, tokensCss).map((value) => ({
        path: artifact.path,
        value,
      })),
    ),
  );
  if (findings.length === 0) {
    return {
      id: 'unauthorized-color-literal',
      status: 'passed',
      message: 'No color literals were found outside token definitions.',
    };
  }
  return {
    id: 'unauthorized-color-literal',
    status: 'failed',
    message: `Found unauthorized color literal(s): ${unique(findings.map((finding) => finding.value)).join(', ')}.`,
    remediation: 'Replace the literal with a declared var(--token-name) reference; update the active design-system package if a new token is required.',
    evidence: unique(findings.map((finding) => finding.path)),
  };
}

function validateFallbackMarker(
  artifacts: readonly DesignSystemAdherenceArtifact[],
  marker: string | undefined,
): DesignSystemAdherenceCheck {
  if (marker === undefined) {
    return {
      id: 'fallback-marker',
      status: 'not-applicable',
      message: 'The selected fallback does not declare an output marker.',
    };
  }
  const markerAttribute = parseAttributeMarker(marker);
  const paths = markerAttribute === undefined
    ? []
    : artifacts
        .filter((artifact) => hasMarkupAttribute(artifact, markerAttribute))
        .map((artifact) => artifact.path);
  if (paths.length > 0) {
    return {
      id: 'fallback-marker',
      status: 'passed',
      message: `Found the declared fallback marker ${marker}.`,
      evidence: paths,
    };
  }
  return {
    id: 'fallback-marker',
    status: 'failed',
    message: `The declared fallback marker ${marker} is missing.`,
    remediation: 'Add the exact marker to the placeholder or pending-confirmation output before requesting review.',
  };
}

function buildReport(
  intent: string,
  resolution: DesignSystemAdherenceReport['resolution'],
  artifacts: readonly DesignSystemAdherenceArtifact[],
  checks: DesignSystemAdherenceCheck[],
): DesignSystemAdherenceReport {
  const summary = {
    passed: checks.filter((check) => check.status === 'passed').length,
    failed: checks.filter((check) => check.status === 'failed').length,
    needsConfirmation: checks.filter((check) => check.status === 'needs-confirmation').length,
    notApplicable: checks.filter((check) => check.status === 'not-applicable').length,
  };
  const status = summary.failed > 0
    ? 'failed'
    : summary.needsConfirmation > 0
      ? 'confirmation-required'
      : 'passed';
  return {
    schemaVersion: DESIGN_SYSTEM_ADHERENCE_SCHEMA_VERSION,
    intent,
    status,
    nextAction: status === 'failed'
      ? 'fix-and-rerun'
      : status === 'confirmation-required'
        ? 'request-human-confirmation'
        : 'complete',
    resolution,
    artifacts: artifacts.map((artifact) => ({
      path: artifact.path,
      size: artifact.size,
      ...(artifact.mime === undefined ? {} : { mime: artifact.mime }),
    })),
    summary,
    checks,
  };
}

function selectorUsage(
  artifacts: readonly DesignSystemAdherenceArtifact[],
  selectors: readonly string[],
): { count: number; paths: string[] } {
  let count = 0;
  const paths: string[] = [];
  for (const artifact of artifacts) {
    if (!looksLikeMarkup(artifact.path, artifact.mime)) continue;
    const artifactCount = countSelectorMatches(artifact, selectors);
    if (artifactCount === 0) continue;
    count += artifactCount;
    paths.push(artifact.path);
  }
  return { count, paths };
}

function countSelectorMatches(
  artifact: DesignSystemAdherenceArtifact,
  selectors: readonly string[],
): number {
  if (/\.(?:jsx|tsx)$/iu.test(artifact.path)) {
    const jsxRoots = jsxStaticMarkupRoots(artifact.content);
    return jsxRoots?.reduce(
      (count, root) => count + countMarkupSelectorMatches(root, selectors, true),
      0,
    ) ?? 0;
  }

  return countMarkupSelectorMatches(stripComments(artifact.content), selectors, false);
}

function countMarkupSelectorMatches(
  source: string,
  selectors: readonly string[],
  xmlMode: boolean,
): number {
  try {
    const $ = load(source, { xmlMode }, false);
    const matches = new Set<unknown>();
    for (const selector of selectors) {
      try {
        $(selector).each((_index, element) => {
          matches.add(element);
        });
      } catch {
        // Invalid or runtime-only selectors cannot prove static component reuse.
      }
    }
    return matches.size;
  } catch {
    // Partially generated markup cannot prove component reuse.
    return 0;
  }
}

type JsxRoot = JSXElement | JSXFragment;

function jsxStaticMarkupRoots(source: string): string[] | undefined {
  const ast = parseComponentSource(source);
  if (ast === undefined) return undefined;

  return collectJsxRoots(ast.program)
    .map((root) => `<od-jsx-root>${serializeJsxRoot(root)}</od-jsx-root>`);
}

function parseComponentSource(source: string): ReturnType<typeof parse> | undefined {
  try {
    return parse(source, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      plugins: ['jsx', 'typescript'],
    });
  } catch {
    return undefined;
  }
}

function collectJsxRoots(value: unknown): JsxRoot[] {
  const roots: JsxRoot[] = [];
  visitBabelNodes(value, (node) => {
    if (node.type !== 'JSXElement' && node.type !== 'JSXFragment') return;
    roots.push(node);
    return false;
  });
  return roots;
}

function visitBabelNodes(
  value: unknown,
  visitor: (node: Node) => false | void,
): void {
  if (Array.isArray(value)) {
    value.forEach((item) => visitBabelNodes(item, visitor));
    return;
  }
  if (!isBabelNode(value) || visitor(value) === false) return;
  for (const [key, child] of Object.entries(value)) {
    if (BABEL_METADATA_KEYS.has(key)) continue;
    visitBabelNodes(child, visitor);
  }
}

const BABEL_METADATA_KEYS = new Set([
  'comments',
  'end',
  'extra',
  'innerComments',
  'leadingComments',
  'loc',
  'start',
  'trailingComments',
]);

function isBabelNode(value: unknown): value is Node {
  return typeof value === 'object'
    && value !== null
    && 'type' in value
    && typeof value.type === 'string';
}

function serializeJsxRoot(root: JsxRoot): string {
  if (root.type === 'JSXFragment') return serializeJsxChildren(root.children);
  const name = jsxElementName(root.openingElement.name);
  if (name === undefined) return '';
  const attributes = root.openingElement.attributes
    .map(serializeJsxAttribute)
    .filter((attribute): attribute is string => attribute !== undefined)
    .join('');
  const children = serializeJsxChildren(root.children);
  return `<${name}${attributes}>${children}</${name}>`;
}

function serializeJsxChildren(children: JSXElement['children'] | JSXFragment['children']): string {
  return children.map((child) => {
    if (child.type === 'JSXElement' || child.type === 'JSXFragment') {
      return serializeJsxRoot(child);
    }
    if (child.type === 'JSXExpressionContainer') {
      return serializeEmbeddedJsx(child);
    }
    return '';
  }).join('');
}

function serializeEmbeddedJsx(container: JSXExpressionContainer): string {
  if (container.expression.type === 'JSXEmptyExpression') return '';
  return collectJsxRoots(container.expression).map(serializeJsxRoot).join('');
}

function serializeJsxAttribute(attribute: JSXAttribute | JSXSpreadAttribute): string | undefined {
  if (attribute.type === 'JSXSpreadAttribute') return undefined;
  const originalName = jsxAttributeName(attribute.name);
  if (originalName === undefined) return undefined;
  const name = originalName === 'className' ? 'class' : originalName;
  const attributeValue = attribute.value;
  if (attributeValue === null || attributeValue === undefined) return ` ${name}=""`;
  if (attributeValue.type === 'StringLiteral') {
    return ` ${name}="${escapeMarkupAttribute(attributeValue.value)}"`;
  }
  if (attributeValue.type !== 'JSXExpressionContainer'
    || attributeValue.expression.type === 'JSXEmptyExpression') {
    return undefined;
  }
  const value = staticJsxAttributeValue(attributeValue.expression, name);
  return value === undefined ? undefined : ` ${name}="${escapeMarkupAttribute(value)}"`;
}

function staticJsxAttributeValue(expression: Expression, attributeName: string): string | undefined {
  if (expression.type === 'StringLiteral'
    || expression.type === 'NumericLiteral'
    || expression.type === 'BooleanLiteral') {
    return String(expression.value);
  }
  if (expression.type !== 'TemplateLiteral') return undefined;
  const exact = exactTemplateLiteralValue(expression);
  if (exact !== undefined) return exact;
  if (attributeName !== 'class') return undefined;
  const classes = guaranteedTemplateLiteralClasses(expression);
  return classes.length === 0 ? undefined : classes.join(' ');
}

function exactTemplateLiteralValue(template: TemplateLiteral): string | undefined {
  let value = template.quasis[0]?.value.cooked ?? template.quasis[0]?.value.raw ?? '';
  for (let index = 0; index < template.expressions.length; index += 1) {
    const expression = template.expressions[index]!;
    const staticValue = staticPrimitiveValue(expression);
    if (staticValue === undefined) return undefined;
    const quasi = template.quasis[index + 1];
    value += staticValue + (quasi?.value.cooked ?? quasi?.value.raw ?? '');
  }
  return value;
}

function staticPrimitiveValue(expression: TemplateLiteral['expressions'][number]): string | undefined {
  if (expression.type === 'StringLiteral'
    || expression.type === 'NumericLiteral'
    || expression.type === 'BooleanLiteral') {
    return String(expression.value);
  }
  if (expression.type === 'NullLiteral') return 'null';
  return undefined;
}

function guaranteedTemplateLiteralClasses(template: TemplateLiteral): string[] {
  return unique(template.quasis.flatMap((quasi, index) => {
    let text = quasi.value.cooked ?? quasi.value.raw;
    if (index > 0 && !/^\s/u.test(text)) text = text.replace(/^\S*/u, '');
    if (index < template.expressions.length && !/\s$/u.test(text)) text = text.replace(/\S*$/u, '');
    return text.split(/\s+/u).filter(Boolean);
  }));
}

function jsxElementName(name: JSXOpeningElement['name']): string | undefined {
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXNamespacedName') {
    return `${name.namespace.name}:${name.name.name}`;
  }
  return jsxMemberName(name);
}

function jsxMemberName(name: JSXMemberExpression): string | undefined {
  const object = name.object.type === 'JSXIdentifier'
    ? name.object.name
    : jsxMemberName(name.object);
  return object === undefined ? undefined : `${object}.${name.property.name}`;
}

function jsxAttributeName(name: JSXIdentifier | JSXNamespacedName): string | undefined {
  return name.type === 'JSXIdentifier'
    ? name.name
    : `${name.namespace.name}:${name.name.name}`;
}

function escapeMarkupAttribute(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/"/gu, '&quot;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;');
}

function hasCssRule(source: string, selector: string): boolean {
  const normalizedSelector = normalizeCssSelector(selector);
  for (const match of stripComments(source).matchAll(/([^{}]+)\{/gu)) {
    const prelude = match[1] ?? '';
    if (prelude.includes(':root') && prelude.includes('--')) continue;
    if (prelude.split(',').some((candidate) => normalizeCssSelector(candidate) === normalizedSelector)) {
      return true;
    }
  }
  return false;
}

function normalizeCssSelector(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

type StyleFragment = { source: string; inline: boolean };

function findColorLiteralsOutsideTokenDefinitions(
  fragment: StyleFragment,
  tokensCss: string | undefined,
): string[] {
  const activeDefinitions = collectScopedTokenDefinitions(tokensCss ?? '');
  const declarations = collectStyleDeclarations(fragment);
  if (declarations.length === 0) return findColorSyntaxes(fragment.source);

  return unique(declarations.flatMap((declaration) => {
    if (declaration.prop.startsWith('--')) {
      const selector = declarationSelector(declaration);
      const activeKey = tokenDefinitionKey(selector, declaration.prop, declaration.value);
      if (activeDefinitions.has(activeKey)) return [];
    }
    return findColorSyntaxes(
      declaration.value,
      declaration.prop.startsWith('--') || propertyCanContainNamedColor(declaration.prop),
    );
  }));
}

function collectStyleDeclarations(fragment: StyleFragment): Declaration[] {
  const source = stripComments(fragment.source);
  if (source.trim().length === 0) return [];
  try {
    const root = postcss.parse(fragment.inline ? `:root { ${source} }` : source);
    const declarations: Declaration[] = [];
    root.walkDecls((declaration) => {
      declarations.push(declaration);
    });
    return declarations;
  } catch {
    return [];
  }
}

const COLOR_FUNCTIONS = new Set([
  'color',
  'color-mix',
  'device-cmyk',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'light-dark',
  'oklab',
  'oklch',
  'rgb',
  'rgba',
]);

const NAMED_COLORS = new Set(`
  aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue
  blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk
  crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki
  darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
  darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue
  dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite
  gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki
  lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
  lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen
  lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen
  magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
  mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream
  mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
  palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
  powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown
  seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen
  steelblue tan teal thistle tomato transparent turquoise violet wheat white whitesmoke yellow
  yellowgreen
`.trim().split(/\s+/u));

function findColorSyntaxes(source: string, includeNamedColors = true): string[] {
  const searchable = source.replace(/var\(\s*(--[A-Za-z0-9_-]+)/gu, (match, token: string) =>
    match.replace(token, ' '.repeat(token.length)));
  const findings: string[] = [];
  for (const match of searchable.matchAll(/#[0-9A-Fa-f]{8}(?![0-9A-Fa-f])|#[0-9A-Fa-f]{6}(?![0-9A-Fa-f])|#[0-9A-Fa-f]{4}(?![0-9A-Fa-f])|#[0-9A-Fa-f]{3}(?![0-9A-Fa-f])/gu)) {
    findings.push(match[0]);
  }
  for (const match of searchable.matchAll(/\b([A-Za-z][A-Za-z0-9-]*)\s*\(/gu)) {
    const name = match[1]!.toLowerCase();
    if (!COLOR_FUNCTIONS.has(name)) continue;
    const openIndex = match.index + match[0].lastIndexOf('(');
    const closeIndex = findMatchingParenthesis(searchable, openIndex);
    findings.push(source.slice(match.index, closeIndex === -1 ? source.length : closeIndex + 1).trim());
  }
  if (includeNamedColors) {
    for (const match of searchable.matchAll(/\b([A-Za-z]+)\b/gu)) {
      if (NAMED_COLORS.has(match[1]!.toLowerCase())) {
        findings.push(source.slice(match.index, match.index + match[0].length));
      }
    }
  }
  return unique(findings);
}

function propertyCanContainNamedColor(property: string): boolean {
  const normalized = property.toLowerCase().replace(/-/gu, '');
  return normalized === 'color'
    || normalized.endsWith('color')
    || /^(?:background|border|outline|boxshadow|textshadow|fill|stroke|caret|accent|textdecoration|textemphasis|columnrule|scrollbar|stop|flood|lighting)/u.test(normalized);
}

function findMatchingParenthesis(source: string, openIndex: number): number {
  let depth = 0;
  let quote: '"' | "'" | undefined;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index]!;
    if (quote !== undefined) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '(') depth += 1;
    if (character === ')' && --depth === 0) return index;
  }
  return -1;
}

function visualStyleSource(artifact: DesignSystemAdherenceArtifact): string {
  return visualStyleFragments(artifact).map((fragment) => fragment.source).join('\n');
}

function visualStyleFragments(artifact: DesignSystemAdherenceArtifact): StyleFragment[] {
  if (/\.css$/iu.test(artifact.path) || artifact.mime === 'text/css') {
    return [{ source: artifact.content, inline: false }];
  }
  if (/\.(?:jsx|tsx)$/iu.test(artifact.path)) {
    return componentStyleFragments(artifact.content);
  }
  if (!/\.(?:html?|svg|vue|svelte)$/iu.test(artifact.path) && artifact.mime?.includes('html') !== true) {
    return [];
  }
  return markupStyleFragments(artifact.content);
}

function markupStyleFragments(source: string): StyleFragment[] {
  try {
    const $ = load(stripComments(source));
    const fragments: StyleFragment[] = [];
    $('style').each((_index, element) => {
      fragments.push({ source: $(element).text(), inline: false });
    });
    $('*').each((_index, element) => {
      for (const [attribute, value] of Object.entries($(element).attr() ?? {})) {
        const normalized = attribute.toLowerCase();
        const isStyle = normalized === 'style'
          || normalized === ':style'
          || normalized === 'v-bind:style'
          || normalized.startsWith('style:');
        if (!isStyle && !VISUAL_COLOR_ATTRIBUTES.has(normalized)) continue;
        fragments.push({
          source: isStyle ? value : `${normalized}: ${value};`,
          inline: true,
        });
      }
    });
    return fragments;
  } catch {
    return [];
  }
}

const VISUAL_COLOR_ATTRIBUTES = new Set([
  'accent-color',
  'bgcolor',
  'caret-color',
  'color',
  'fill',
  'flood-color',
  'lighting-color',
  'outline-color',
  'solid-color',
  'stop-color',
  'stroke',
  'text-decoration-color',
  'text-emphasis-color',
]);

function componentStyleFragments(source: string): StyleFragment[] {
  const tags = extractExecutableMarkupTags(source);
  const fragments = componentAstStyleFragments(source);
  for (let index = 0; index < tags.length; index += 1) {
    const tag = tags[index]!;
    if (tag.closing || tag.name.toLowerCase() !== 'style') continue;
    const closing = tags.slice(index + 1).find((candidate) =>
      candidate.closing && candidate.name.toLowerCase() === 'style');
    if (closing !== undefined) {
      fragments.push({
        source: unwrapEmbeddedStyle(source.slice(tag.end, closing.start)),
        inline: false,
      });
    }
  }
  for (const tag of tags.filter((candidate) => !candidate.closing)) {
    for (const match of tag.raw.matchAll(/\bstyle\s*=\s*["']([^"']*)["']/giu)) {
      fragments.push({ source: match[1]!, inline: true });
    }
    for (const match of tag.raw.matchAll(/\bstyle\s*=\s*\{\{([\s\S]*?)\}\}/gu)) {
      fragments.push({ source: match[1]!, inline: true });
    }
  }
  return fragments;
}

function componentAstStyleFragments(source: string): StyleFragment[] {
  const ast = parseComponentSource(source);
  if (ast === undefined) return [];
  const fragments: StyleFragment[] = [];
  visitBabelNodes(ast.program, (node) => {
    if (node.type === 'TaggedTemplateExpression' && isCssInJsTag(node.tag)) {
      fragments.push({ source: cssTemplateSource(node.quasi), inline: false });
      return;
    }
    if (node.type !== 'JSXOpeningElement') return;
    for (const attribute of node.attributes) {
      if (attribute.type !== 'JSXAttribute') continue;
      const originalName = jsxAttributeName(attribute.name);
      if (originalName === undefined) continue;
      const normalized = normalizeVisualAttributeName(originalName);
      if (!VISUAL_COLOR_ATTRIBUTES.has(normalized)) continue;
      const attributeValue = attribute.value;
      if (attributeValue === null || attributeValue === undefined) continue;
      let value: string | undefined;
      if (attributeValue.type === 'StringLiteral') {
        value = attributeValue.value;
      } else if (attributeValue.type === 'JSXExpressionContainer'
        && attributeValue.expression.type !== 'JSXEmptyExpression') {
        value = exactStaticExpressionValue(attributeValue.expression);
      }
      if (value !== undefined) {
        fragments.push({ source: `${normalized}: ${value};`, inline: true });
      }
    }
  });
  return fragments;
}

function isCssInJsTag(tag: Node): boolean {
  return expressionRootIdentifier(tag) === 'css'
    || expressionRootIdentifier(tag) === 'styled';
}

function expressionRootIdentifier(node: Node): string | undefined {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
    return isBabelNode(node.object) ? expressionRootIdentifier(node.object) : undefined;
  }
  if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
    return isBabelNode(node.callee) ? expressionRootIdentifier(node.callee) : undefined;
  }
  return undefined;
}

function cssTemplateSource(template: TemplateLiteral): string {
  let source = template.quasis[0]?.value.cooked ?? template.quasis[0]?.value.raw ?? '';
  for (let index = 0; index < template.expressions.length; index += 1) {
    const expression = template.expressions[index]!;
    source += exactStaticExpressionValue(expression) ?? 'var(--od-dynamic-css-value)';
    const quasi = template.quasis[index + 1];
    source += quasi?.value.cooked ?? quasi?.value.raw ?? '';
  }
  return source;
}

function exactStaticExpressionValue(expression: Node): string | undefined {
  if (expression.type === 'StringLiteral'
    || expression.type === 'NumericLiteral'
    || expression.type === 'BooleanLiteral') {
    return String(expression.value);
  }
  if (expression.type === 'NullLiteral') return 'null';
  if (expression.type === 'TemplateLiteral') return exactTemplateLiteralValue(expression);
  return undefined;
}

function normalizeVisualAttributeName(value: string): string {
  return value.replace(/[A-Z]/gu, (character) => `-${character.toLowerCase()}`).toLowerCase();
}

type ExecutableMarkupTag = {
  raw: string;
  name: string;
  closing: boolean;
  start: number;
  end: number;
};

function extractExecutableMarkupTags(source: string): ExecutableMarkupTag[] {
  const tags: ExecutableMarkupTag[] = [];
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('<!--', index)) {
      index = skipThrough(source, index + 4, '-->');
      continue;
    }
    if (source.startsWith('/*', index)) {
      index = skipThrough(source, index + 2, '*/');
      continue;
    }
    if (source.startsWith('//', index)) {
      const newline = source.indexOf('\n', index + 2);
      index = newline === -1 ? source.length : newline + 1;
      continue;
    }
    const character = source[index]!;
    if (character === '"' || character === "'" || character === '`') {
      index = skipQuoted(source, index, character);
      continue;
    }
    if (character !== '<') {
      index += 1;
      continue;
    }

    let cursor = index + 1;
    const closing = source[cursor] === '/';
    if (closing) cursor += 1;
    const nameMatch = /^[A-Za-z][A-Za-z0-9:._-]*/u.exec(source.slice(cursor));
    if (nameMatch === null) {
      index += 1;
      continue;
    }
    const name = nameMatch[0];
    const end = findMarkupTagEnd(source, cursor + name.length);
    if (end === -1) {
      index += 1;
      continue;
    }
    tags.push({
      raw: source.slice(index, end + 1),
      name,
      closing,
      start: index,
      end: end + 1,
    });
    index = end + 1;
  }
  return tags;
}

function findMarkupTagEnd(source: string, start: number): number {
  let braceDepth = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]!;
    if (character === '"' || character === "'" || character === '`') {
      index = skipQuoted(source, index, character) - 1;
      continue;
    }
    if (source.startsWith('/*', index)) {
      index = skipThrough(source, index + 2, '*/') - 1;
      continue;
    }
    if (source.startsWith('//', index)) {
      const newline = source.indexOf('\n', index + 2);
      index = (newline === -1 ? source.length : newline + 1) - 1;
      continue;
    }
    if (character === '{') braceDepth += 1;
    else if (character === '}' && braceDepth > 0) braceDepth -= 1;
    else if (character === '>' && braceDepth === 0) return index;
  }
  return -1;
}

function skipQuoted(source: string, start: number, quote: '"' | "'" | '`'): number {
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === '\\') {
      index += 1;
      continue;
    }
    if (source[index] === quote) return index + 1;
  }
  return source.length;
}

function skipThrough(source: string, start: number, terminator: string): number {
  const end = source.indexOf(terminator, start);
  return end === -1 ? source.length : end + terminator.length;
}

function unwrapEmbeddedStyle(source: string): string {
  return source
    .replace(/^\s*\{\s*([`"'])/u, '')
    .replace(/([`"'])\s*\}\s*$/u, '')
    .trim();
}

function collectScopedTokenDefinitions(source: string): Set<string> {
  const definitions = new Set<string>();
  for (const declaration of parseStylesheetDeclarations(source)) {
    if (!declaration.prop.startsWith('--')) continue;
    definitions.add(tokenDefinitionKey(
      declarationSelector(declaration),
      declaration.prop,
      declaration.value,
    ));
  }
  return definitions;
}

function collectDeclaredTokenNames(source: string): Set<string> {
  return new Set(parseStylesheetDeclarations(source)
    .filter((declaration) => declaration.prop.startsWith('--'))
    .map((declaration) => declaration.prop));
}

function parseStylesheetDeclarations(source: string): Declaration[] {
  try {
    const declarations: Declaration[] = [];
    postcss.parse(stripComments(source)).walkDecls((declaration) => {
      declarations.push(declaration);
    });
    return declarations;
  } catch {
    return [];
  }
}

function declarationSelector(declaration: Declaration): string {
  return declaration.parent?.type === 'rule'
    ? normalizeCssSelector(declaration.parent.selector)
    : '';
}

function tokenDefinitionKey(selector: string, token: string, value: string): string {
  return `${normalizeCssSelector(selector)}\u0000${token}\u0000${normalizeCssValue(value)}`;
}

function normalizeCssValue(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().toLowerCase();
}

type AttributeMarker = { name: string; value?: string };

function parseAttributeMarker(marker: string): AttributeMarker | undefined {
  const match = /^([A-Za-z_:][A-Za-z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?$/u.exec(marker.trim());
  if (match === null) return undefined;
  const value = match[2] ?? match[3];
  return value === undefined ? { name: match[1]! } : { name: match[1]!, value };
}

function hasMarkupAttribute(
  artifact: DesignSystemAdherenceArtifact,
  marker: AttributeMarker,
): boolean {
  if (!looksLikeMarkup(artifact.path, artifact.mime)) return false;
  if (/\.(?:jsx|tsx)$/iu.test(artifact.path)) {
    return extractExecutableMarkupTags(artifact.content)
      .filter((tag) => !tag.closing)
      .some((tag) => tagHasAttribute(tag.raw, marker));
  }
  try {
    const $ = load(stripComments(artifact.content));
    let found = false;
    $('*').each((_index, element) => {
      const value = $(element).attr(marker.name);
      if (value !== undefined && (marker.value === undefined || value === marker.value)) {
        found = true;
      }
    });
    return found;
  } catch {
    return false;
  }
}

function tagHasAttribute(tag: string, marker: AttributeMarker): boolean {
  const name = escapeRegExp(marker.name);
  const match = new RegExp(
    `(?:^|\\s)${name}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*["']([^"']*)["']\\s*\\}))?(?=\\s|/?>)`,
    'u',
  ).exec(tag);
  if (match === null) return false;
  const value = match[1] ?? match[2] ?? match[3];
  return marker.value === undefined || value === marker.value;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/<!--([\s\S]*?)-->/gu, '');
}

function collectStyleMatches(
  artifacts: readonly DesignSystemAdherenceArtifact[],
  pattern: RegExp,
  group: number,
): { values: string[]; paths: string[] } {
  const values: string[] = [];
  const paths: string[] = [];
  for (const artifact of artifacts) {
    const matches = matchAll(stripComments(visualStyleSource(artifact)), pattern, group);
    if (matches.length === 0) continue;
    values.push(...matches);
    paths.push(artifact.path);
  }
  return { values, paths: unique(paths) };
}

function matchAll(source: string, pattern: RegExp, group: number): string[] {
  return [...source.matchAll(pattern)].flatMap((match) => match[group] === undefined ? [] : [match[group]!]);
}

function looksLikeMarkup(filePath: string, mime: string | undefined): boolean {
  return mime?.includes('html') === true
    || /\.(?:html?|svg|jsx|tsx|vue|svelte)$/iu.test(filePath);
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function uniqueByKey<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const itemKey = key(value);
    if (seen.has(itemKey)) return false;
    seen.add(itemKey);
    return true;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
