export const DTCG_FORMAT_VERSION = '2025.10' as const;
export const DTCG_FORMAT_SCHEMA_URL = 'https://www.designtokens.org/schemas/2025.10/format.json' as const;

export const DTCG_TOKEN_TYPES = [
  'color',
  'dimension',
  'fontFamily',
  'fontWeight',
  'duration',
  'cubicBezier',
  'number',
  'strokeStyle',
  'border',
  'transition',
  'shadow',
  'gradient',
  'typography',
] as const;

export type DtcgTokenType = (typeof DTCG_TOKEN_TYPES)[number];
export type DtcgDeprecated = boolean | string;
export type DtcgJsonPrimitive = string | number | boolean | null;
export type DtcgJsonValue = DtcgJsonPrimitive | DtcgJsonValue[] | { [key: string]: DtcgJsonValue };
export type DtcgFormatDocument = { [key: string]: DtcgJsonValue };

export type DtcgDiagnosticCode =
  | 'circular-reference'
  | 'invalid-document'
  | 'invalid-extension'
  | 'invalid-group'
  | 'invalid-json-pointer'
  | 'invalid-metadata'
  | 'invalid-name'
  | 'invalid-reference'
  | 'invalid-token'
  | 'invalid-type'
  | 'invalid-value'
  | 'missing-reference'
  | 'missing-type'
  | 'non-normative-schema-property'
  | 'profile-mismatch'
  | 'reference-type-mismatch'
  | 'schema-divergence'
  | 'unknown-reserved-property';

export type DtcgDiagnostic = {
  severity: 'error' | 'warning';
  code: DtcgDiagnosticCode;
  path: string;
  message: string;
};

export type DtcgResolvedToken = {
  path: readonly string[];
  pointer: string;
  sourcePointer: string;
  type: DtcgTokenType;
  value: DtcgJsonValue;
  source: Readonly<Record<string, DtcgJsonValue>>;
  deprecated?: DtcgDeprecated;
};

export type DtcgFormatParseResult =
  | {
      ok: true;
      document: DtcgFormatDocument;
      tokens: readonly DtcgResolvedToken[];
      diagnostics: readonly DtcgDiagnostic[];
    }
  | {
      ok: false;
      diagnostics: readonly DtcgDiagnostic[];
    };

export type SerializeDtcgFormatOptions = {
  includeSchemaMetadata?: boolean;
  space?: number;
  trailingNewline?: boolean;
};

type JsonRecord = Record<string, DtcgJsonValue>;

type TokenEntry = {
  path: string[];
  node: JsonRecord;
  sourcePath: string[];
  sourceNode: JsonRecord;
  inheritedType: DtcgTokenType | undefined;
  inheritedDeprecated: DtcgDeprecated | undefined;
};

type ResolvedTokenInternal = DtcgResolvedToken & {
  path: readonly string[];
};

const TOKEN_TYPE_SET = new Set<string>(DTCG_TOKEN_TYPES);
const TOKEN_PROPERTIES = new Set(['$value', '$ref', '$type', '$description', '$extensions', '$deprecated']);
const GROUP_PROPERTIES = new Set(['$description', '$type', '$extends', '$extensions', '$deprecated', '$root']);
const FONT_WEIGHT_KEYWORDS = new Set([
  'thin',
  'hairline',
  'extra-light',
  'ultra-light',
  'light',
  'normal',
  'regular',
  'book',
  'medium',
  'semi-bold',
  'demi-bold',
  'bold',
  'extra-bold',
  'ultra-bold',
  'black',
  'heavy',
  'extra-black',
  'ultra-black',
]);
const STROKE_STYLE_KEYWORDS = new Set([
  'solid',
  'dashed',
  'dotted',
  'double',
  'groove',
  'ridge',
  'outset',
  'inset',
]);
const COLOR_SPACES = new Set([
  'srgb',
  'srgb-linear',
  'hsl',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'display-p3',
  'a98-rgb',
  'prophoto-rgb',
  'rec2020',
  'xyz-d65',
  'xyz-d50',
]);

/**
 * Parses, validates, and resolves one stable DTCG Format 2025.10 document.
 * The returned document preserves source references and extensions; resolved
 * token values are exposed separately through `tokens`.
 */
export function parseDtcgFormat2025_10(input: unknown): DtcgFormatParseResult {
  const diagnostics: DtcgDiagnostic[] = [];
  validateJsonValue(input, [], diagnostics, new Set<object>());
  if (hasErrors(diagnostics) || !isRecord(input)) {
    if (!isRecord(input)) {
      addDiagnostic(diagnostics, 'error', 'invalid-document', [], 'A DTCG document must be a JSON object.');
    }
    return { ok: false, diagnostics: uniqueDiagnostics(diagnostics) };
  }

  const document = cloneJson(input) as DtcgFormatDocument;
  validateGroupStructure(document, [], diagnostics, true);
  if (hasErrors(diagnostics)) return { ok: false, diagnostics: uniqueDiagnostics(diagnostics) };

  const materialized = materializeGroup(document, [], document, diagnostics, new Set<string>());
  if (materialized === undefined || hasErrors(diagnostics)) {
    return { ok: false, diagnostics: uniqueDiagnostics(diagnostics) };
  }

  const entries: TokenEntry[] = [];
  collectTokenEntries(materialized, [], undefined, undefined, document, entries);
  const entryByPath = new Map(entries.map((entry) => [pathKey(entry.path), entry]));
  const resolvedByPath = new Map<string, ResolvedTokenInternal>();
  const activeTokens: string[] = [];

  const resolveToken = (entry: TokenEntry): ResolvedTokenInternal | undefined => {
    const key = pathKey(entry.path);
    const cached = resolvedByPath.get(key);
    if (cached !== undefined) return cached;
    const cycleIndex = activeTokens.indexOf(key);
    if (cycleIndex !== -1) {
      const cycle = [...activeTokens.slice(cycleIndex), key]
        .map((cycleKey) => pointerFromPath(JSON.parse(cycleKey) as string[]))
        .join(' -> ');
      addDiagnostic(diagnostics, 'error', 'circular-reference', entry.path, `Circular token reference: ${cycle}.`);
      return undefined;
    }

    activeTokens.push(key);
    const explicitType = readTokenType(entry.node.$type);
    const targetEntry = wholeTokenReferenceTarget(entry.node, materialized, entryByPath, diagnostics, entry.path);
    const targetToken = targetEntry === undefined ? undefined : resolveToken(targetEntry);
    let effectiveType = explicitType ?? targetToken?.type ?? entry.inheritedType;

    if (explicitType !== undefined && targetToken !== undefined && explicitType !== targetToken.type) {
      addDiagnostic(
        diagnostics,
        'error',
        'reference-type-mismatch',
        [...entry.path, entry.node.$ref === undefined ? '$value' : '$ref'],
        `Token type ${explicitType} does not match referenced token type ${targetToken.type}.`,
      );
    }
    if (effectiveType === undefined) {
      addDiagnostic(
        diagnostics,
        'error',
        'missing-type',
        entry.path,
        'Token type cannot be determined from $type, a referenced token, or a parent group.',
      );
      activeTokens.pop();
      return undefined;
    }

    let value: DtcgJsonValue | undefined;
    if (targetToken !== undefined && isWholeTokenReference(entry.node)) {
      value = cloneJson(targetToken.value);
    } else if ('$ref' in entry.node) {
      const ref = entry.node.$ref;
      if (typeof ref === 'string') {
        value = resolveJsonPointerValue(
          ref,
          materialized,
          entryByPath,
          resolveToken,
          diagnostics,
          [...entry.path, '$ref'],
          new Set<string>(),
        );
      }
    } else {
      validateNestedReferenceTypes(
        effectiveType,
        entry.node.$value,
        entryByPath,
        resolveToken,
        diagnostics,
        [...entry.path, '$value'],
      );
      value = resolveNestedReferences(
        entry.node.$value,
        materialized,
        entryByPath,
        resolveToken,
        diagnostics,
        [...entry.path, '$value'],
        new Set<string>(),
        effectiveType === 'gradient' || effectiveType === 'shadow' ? effectiveType : undefined,
      );
    }

    if (value !== undefined) {
      value = validateAndNormalizeTypeValue(effectiveType, value, [...entry.path, '$value'], diagnostics);
    }
    if (value === undefined || hasErrorsForPath(diagnostics, entry.path)) {
      activeTokens.pop();
      return undefined;
    }

    const deprecated = readDeprecated(entry.node.$deprecated) ?? entry.inheritedDeprecated;
    const resolved: ResolvedTokenInternal = {
      path: [...entry.path],
      pointer: pointerFromPath(entry.path),
      sourcePointer: pointerFromPath(entry.sourcePath),
      type: effectiveType,
      value,
      source: entry.sourceNode,
      ...(deprecated === undefined ? {} : { deprecated }),
    };
    resolvedByPath.set(key, resolved);
    activeTokens.pop();
    return resolved;
  };

  for (const entry of entries) resolveToken(entry);
  const finalDiagnostics = uniqueDiagnostics(diagnostics);
  if (hasErrors(finalDiagnostics)) return { ok: false, diagnostics: finalDiagnostics };

  const tokens = entries
    .map((entry) => resolvedByPath.get(pathKey(entry.path)))
    .filter((token): token is ResolvedTokenInternal => token !== undefined);
  return { ok: true, document, tokens, diagnostics: finalDiagnostics };
}

export function serializeDtcgFormat2025_10(
  document: DtcgFormatDocument,
  options: SerializeDtcgFormatOptions = {},
): string {
  const parsed = parseDtcgFormat2025_10(document);
  if (!parsed.ok) {
    const summary = parsed.diagnostics
      .filter((diagnostic) => diagnostic.severity === 'error')
      .map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`)
      .join('\n');
    throw new TypeError(`Cannot serialize an invalid DTCG 2025.10 document.\n${summary}`);
  }
  const output = cloneJson(parsed.document);
  if (options.includeSchemaMetadata === true) output.$schema = DTCG_FORMAT_SCHEMA_URL;
  else delete output.$schema;
  const space = options.space ?? 2;
  const serialized = JSON.stringify(sortJson(output), null, space);
  return options.trailingNewline === false ? serialized : `${serialized}\n`;
}

function validateJsonValue(
  value: unknown,
  path: string[],
  diagnostics: DtcgDiagnostic[],
  active: Set<object>,
): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      addDiagnostic(diagnostics, 'error', 'invalid-document', path, 'JSON numbers must be finite.');
    }
    return;
  }
  if (typeof value !== 'object') {
    addDiagnostic(diagnostics, 'error', 'invalid-document', path, 'Value is not JSON-serializable.');
    return;
  }
  if (active.has(value)) {
    addDiagnostic(diagnostics, 'error', 'invalid-document', path, 'JSON input must not contain object cycles.');
    return;
  }
  if (!Array.isArray(value) && !isRecord(value)) {
    addDiagnostic(diagnostics, 'error', 'invalid-document', path, 'JSON objects must use a plain object prototype.');
    return;
  }
  active.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateJsonValue(item, [...path, String(index)], diagnostics, active));
  } else {
    for (const [key, item] of Object.entries(value)) {
      validateJsonValue(item, [...path, key], diagnostics, active);
    }
  }
  active.delete(value);
}

function validateGroupStructure(
  group: JsonRecord,
  path: string[],
  diagnostics: DtcgDiagnostic[],
  root: boolean,
): void {
  for (const [name, value] of Object.entries(group)) {
    if (name.startsWith('$')) {
      if (root && name === '$schema') {
        if (typeof value !== 'string') {
          addDiagnostic(diagnostics, 'error', 'invalid-metadata', [...path, name], '$schema must be a string.');
        } else if (value !== DTCG_FORMAT_SCHEMA_URL) {
          addDiagnostic(
            diagnostics,
            'error',
            'profile-mismatch',
            [...path, name],
            `Document carries $schema ${value}, which does not identify the stable DTCG 2025.10 Format profile.`,
          );
        } else {
          addDiagnostic(
            diagnostics,
            'warning',
            'non-normative-schema-property',
            [...path, name],
            '$schema is schema metadata, not a normative DTCG Format property.',
          );
        }
        continue;
      }
      if (!GROUP_PROPERTIES.has(name)) {
        addDiagnostic(
          diagnostics,
          'error',
          'unknown-reserved-property',
          [...path, name],
          `Unknown reserved group property ${name}.`,
        );
        continue;
      }
      validateGroupProperty(name, value, path, diagnostics);
      if (name === '$root' && isRecord(value)) validateTokenStructure(value, [...path, '$root'], diagnostics);
      continue;
    }

    validateName(name, [...path, name], diagnostics);
    if (!isRecord(value)) {
      addDiagnostic(
        diagnostics,
        'error',
        'invalid-group',
        [...path, name],
        'Every token or group member must be a JSON object.',
      );
      continue;
    }
    if (isTokenNode(value)) validateTokenStructure(value, [...path, name], diagnostics);
    else validateGroupStructure(value, [...path, name], diagnostics, false);
  }
}

function validateTokenStructure(token: JsonRecord, path: string[], diagnostics: DtcgDiagnostic[]): void {
  const hasValue = Object.prototype.hasOwnProperty.call(token, '$value');
  const hasRef = Object.prototype.hasOwnProperty.call(token, '$ref');
  if (hasValue === hasRef) {
    addDiagnostic(
      diagnostics,
      'error',
      'invalid-token',
      path,
      'A token must define exactly one of $value or token-level $ref.',
    );
  }
  for (const [name, value] of Object.entries(token)) {
    if (!name.startsWith('$')) {
      addDiagnostic(
        diagnostics,
        'error',
        'invalid-token',
        [...path, name],
        'A token cannot also contain child tokens or groups.',
      );
      continue;
    }
    if (!TOKEN_PROPERTIES.has(name)) {
      addDiagnostic(
        diagnostics,
        'error',
        'unknown-reserved-property',
        [...path, name],
        `Unknown reserved token property ${name}.`,
      );
      continue;
    }
    validateTokenProperty(name, value, path, diagnostics);
  }
}

function validateGroupProperty(
  name: string,
  value: DtcgJsonValue,
  path: string[],
  diagnostics: DtcgDiagnostic[],
): void {
  switch (name) {
    case '$description':
      if (typeof value !== 'string') invalidMetadata(diagnostics, [...path, name], '$description must be a string.');
      break;
    case '$type':
      validateTypeName(value, [...path, name], diagnostics);
      break;
    case '$extends':
      if (typeof value !== 'string' || (!isCurlyReference(value) && !isJsonPointer(value))) {
        addDiagnostic(
          diagnostics,
          'error',
          'invalid-reference',
          [...path, name],
          '$extends must be a curly-brace group reference or JSON Pointer.',
        );
      }
      break;
    case '$extensions':
      if (!isRecord(value)) {
        addDiagnostic(diagnostics, 'error', 'invalid-extension', [...path, name], '$extensions must be an object.');
      }
      break;
    case '$deprecated':
      if (typeof value !== 'boolean' && typeof value !== 'string') {
        invalidMetadata(diagnostics, [...path, name], '$deprecated must be a boolean or string.');
      }
      break;
    case '$root':
      if (!isRecord(value)) {
        addDiagnostic(diagnostics, 'error', 'invalid-token', [...path, name], '$root must contain a token object.');
      }
      break;
  }
}

function validateTokenProperty(
  name: string,
  value: DtcgJsonValue,
  path: string[],
  diagnostics: DtcgDiagnostic[],
): void {
  switch (name) {
    case '$type':
      validateTypeName(value, [...path, name], diagnostics);
      break;
    case '$description':
      if (typeof value !== 'string') invalidMetadata(diagnostics, [...path, name], '$description must be a string.');
      break;
    case '$extensions':
      if (!isRecord(value)) {
        addDiagnostic(diagnostics, 'error', 'invalid-extension', [...path, name], '$extensions must be an object.');
      }
      break;
    case '$deprecated':
      if (typeof value !== 'boolean' && typeof value !== 'string') {
        invalidMetadata(diagnostics, [...path, name], '$deprecated must be a boolean or string.');
      }
      break;
    case '$ref':
      if (typeof value !== 'string' || !isJsonPointer(value)) {
        addDiagnostic(
          diagnostics,
          'error',
          'invalid-json-pointer',
          [...path, name],
          'Token-level $ref must be an RFC 6901 URI-fragment JSON Pointer.',
        );
      }
      break;
  }
}

function validateTypeName(value: DtcgJsonValue, path: string[], diagnostics: DtcgDiagnostic[]): void {
  if (typeof value !== 'string' || !TOKEN_TYPE_SET.has(value)) {
    addDiagnostic(
      diagnostics,
      'error',
      'invalid-type',
      path,
      `$type must be one of: ${DTCG_TOKEN_TYPES.join(', ')}.`,
    );
  }
}

function validateName(name: string, path: string[], diagnostics: DtcgDiagnostic[]): void {
  if (name.startsWith('$') || /[{}.]/.test(name)) {
    addDiagnostic(
      diagnostics,
      'error',
      'invalid-name',
      path,
      'Token and group names must not start with $ or contain {, }, or periods.',
    );
  }
  if (name.length === 0) {
    addDiagnostic(
      diagnostics,
      'warning',
      'schema-divergence',
      path,
      'The normative report does not forbid an empty name, but the official schema does.',
    );
  }
}

function materializeGroup(
  group: JsonRecord,
  path: string[],
  document: JsonRecord,
  diagnostics: DtcgDiagnostic[],
  active: Set<string>,
): JsonRecord | undefined {
  const key = pathKey(path);
  if (active.has(key)) {
    addDiagnostic(diagnostics, 'error', 'circular-reference', path, 'Circular $extends chain detected.');
    return undefined;
  }
  active.add(key);

  const local = withoutKey(group, '$extends');
  for (const [name, child] of Object.entries(local)) {
    if (name.startsWith('$') || !isRecord(child) || isTokenNode(child)) continue;
    const materializedChild = materializeGroup(child, [...path, name], document, diagnostics, active);
    if (materializedChild !== undefined) local[name] = materializedChild;
  }

  let output = local;
  if (typeof group.$extends === 'string') {
    const target = resolveGroupReference(group.$extends, document, diagnostics, [...path, '$extends']);
    if (target !== undefined) {
      const targetMaterialized = materializeGroup(target.node, target.path, document, diagnostics, active);
      if (targetMaterialized !== undefined) output = mergeGroups(targetMaterialized, local);
    }
  }
  active.delete(key);
  return output;
}

function resolveGroupReference(
  reference: string,
  document: JsonRecord,
  diagnostics: DtcgDiagnostic[],
  diagnosticPath: string[],
): { node: JsonRecord; path: string[] } | undefined {
  let segments: string[] | undefined;
  if (isCurlyReference(reference)) segments = parseCurlyReference(reference);
  else segments = parseJsonPointer(reference, diagnostics, diagnosticPath);
  if (segments === undefined) return undefined;
  const target = valueAtPath(document, segments);
  if (!isRecord(target)) {
    addDiagnostic(diagnostics, 'error', 'missing-reference', diagnosticPath, `Group reference ${reference} was not found.`);
    return undefined;
  }
  if (isTokenNode(target)) {
    addDiagnostic(diagnostics, 'error', 'invalid-reference', diagnosticPath, '$extends must reference a group, not a token.');
    return undefined;
  }
  return { node: target, path: segments };
}

function mergeGroups(inherited: JsonRecord, local: JsonRecord): JsonRecord {
  const output = cloneJson(inherited);
  for (const [key, localValue] of Object.entries(local)) {
    const inheritedValue = output[key];
    if (
      !key.startsWith('$')
      && isRecord(inheritedValue)
      && isRecord(localValue)
      && !isTokenNode(inheritedValue)
      && !isTokenNode(localValue)
    ) {
      output[key] = mergeGroups(inheritedValue, localValue);
    } else {
      output[key] = cloneJson(localValue);
    }
  }
  return output;
}

function collectTokenEntries(
  group: JsonRecord,
  path: string[],
  parentType: DtcgTokenType | undefined,
  parentDeprecated: DtcgDeprecated | undefined,
  sourceDocument: JsonRecord,
  entries: TokenEntry[],
): void {
  const groupType = readTokenType(group.$type) ?? parentType;
  const groupDeprecated = readDeprecated(group.$deprecated) ?? parentDeprecated;
  for (const [name, child] of Object.entries(group)) {
    if (name === '$root' && isRecord(child)) {
      const tokenPath = [...path, '$root'];
      const source = sourceTokenForEffectivePath(sourceDocument, tokenPath);
      entries.push({
        path: tokenPath,
        node: child,
        sourcePath: source?.path ?? tokenPath,
        sourceNode: source?.node ?? child,
        inheritedType: groupType,
        inheritedDeprecated: groupDeprecated,
      });
      continue;
    }
    if (name.startsWith('$') || !isRecord(child)) continue;
    if (isTokenNode(child)) {
      const tokenPath = [...path, name];
      const source = sourceTokenForEffectivePath(sourceDocument, tokenPath);
      entries.push({
        path: tokenPath,
        node: child,
        sourcePath: source?.path ?? tokenPath,
        sourceNode: source?.node ?? child,
        inheritedType: groupType,
        inheritedDeprecated: groupDeprecated,
      });
    } else {
      collectTokenEntries(child, [...path, name], groupType, groupDeprecated, sourceDocument, entries);
    }
  }
}

function sourceTokenForEffectivePath(
  document: JsonRecord,
  effectivePath: readonly string[],
): { path: string[]; node: JsonRecord } | undefined {
  let groupCandidates = sourceGroupLineage(document, [], new Set<string>());
  for (let index = 0; index < effectivePath.length; index += 1) {
    const segment = effectivePath[index]!;
    const last = index === effectivePath.length - 1;
    const nextGroups: string[][] = [];
    for (const groupPath of groupCandidates) {
      const group = valueAtPath(document, groupPath);
      if (!isRecord(group)) continue;
      const child = group[segment];
      const childPath = [...groupPath, segment];
      if (last && isRecord(child) && isTokenNode(child)) return { path: childPath, node: child };
      if (!last && isRecord(child) && !isTokenNode(child)) {
        nextGroups.push(...sourceGroupLineage(document, childPath, new Set<string>()));
      }
    }
    groupCandidates = uniquePaths(nextGroups);
  }
  return undefined;
}

function sourceGroupLineage(document: JsonRecord, path: string[], active: Set<string>): string[][] {
  const key = pathKey(path);
  if (active.has(key)) return [];
  const group = valueAtPath(document, path);
  if (!isRecord(group) || isTokenNode(group)) return [];
  active.add(key);
  const lineage = [[...path]];
  if (typeof group.$extends === 'string') {
    const targetPath = referencePath(group.$extends);
    if (targetPath !== undefined) lineage.push(...sourceGroupLineage(document, targetPath, active));
  }
  active.delete(key);
  return uniquePaths(lineage);
}

function referencePath(reference: string): string[] | undefined {
  if (isCurlyReference(reference)) return parseCurlyReference(reference);
  if (!isJsonPointer(reference)) return undefined;
  try {
    const decoded = decodeURIComponent(reference.slice(1));
    if (decoded === '') return [];
    if (!decoded.startsWith('/')) return undefined;
    const segments = decoded.slice(1).split('/');
    if (segments.some((segment) => /~(?:[^01]|$)/.test(segment))) return undefined;
    return segments.map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
  } catch {
    return undefined;
  }
}

function uniquePaths(paths: readonly string[][]): string[][] {
  const seen = new Set<string>();
  return paths.filter((path) => {
    const key = pathKey(path);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function wholeTokenReferenceTarget(
  token: JsonRecord,
  document: JsonRecord,
  entries: Map<string, TokenEntry>,
  diagnostics: DtcgDiagnostic[],
  tokenPath: string[],
): TokenEntry | undefined {
  if (typeof token.$value === 'string' && looksLikeCurlyReference(token.$value)) {
    const segments = parseCurlyReference(token.$value);
    if (segments === undefined) {
      addDiagnostic(diagnostics, 'error', 'invalid-reference', [...tokenPath, '$value'], 'Malformed curly-brace token reference.');
      return undefined;
    }
    const target = entries.get(pathKey(segments));
    if (target === undefined) {
      const raw = valueAtPath(document, segments);
      addDiagnostic(
        diagnostics,
        'error',
        isRecord(raw) ? 'invalid-reference' : 'missing-reference',
        [...tokenPath, '$value'],
        isRecord(raw) ? 'Curly-brace references must target a token.' : `Token reference ${token.$value} was not found.`,
      );
    }
    return target;
  }
  if (isRecord(token.$value) && isReferenceObject(token.$value)) {
    const segments = parseJsonPointer(token.$value.$ref, diagnostics, [...tokenPath, '$value', '$ref']);
    if (segments === undefined) return undefined;
    return tokenEntryForWholePointer(segments, entries);
  }
  if (typeof token.$ref === 'string') {
    const segments = parseJsonPointer(token.$ref, diagnostics, [...tokenPath, '$ref']);
    if (segments === undefined) return undefined;
    return tokenEntryForWholePointer(segments, entries);
  }
  return undefined;
}

function tokenEntryForWholePointer(segments: string[], entries: Map<string, TokenEntry>): TokenEntry | undefined {
  const direct = entries.get(pathKey(segments));
  if (direct !== undefined) return direct;
  if (segments.at(-1) === '$value') return entries.get(pathKey(segments.slice(0, -1)));
  return undefined;
}

function validateNestedReferenceTypes(
  expectedType: DtcgTokenType,
  value: DtcgJsonValue | undefined,
  entries: Map<string, TokenEntry>,
  resolveToken: (entry: TokenEntry) => ResolvedTokenInternal | undefined,
  diagnostics: DtcgDiagnostic[],
  path: string[],
): void {
  if (value === undefined) return;
  const target = nestedReferenceTarget(value, entries, diagnostics, path);
  if (target !== undefined) {
    const targetType = resolveToken(target)?.type;
    if (targetType !== undefined && targetType !== expectedType) {
      addDiagnostic(
        diagnostics,
        'error',
        'reference-type-mismatch',
        path,
        `Expected a ${expectedType} reference, but the target token has type ${targetType}.`,
      );
    }
    return;
  }
  if (!isRecord(value) && !Array.isArray(value)) return;

  const check = (type: DtcgTokenType, child: DtcgJsonValue | undefined, childPath: string[]) => {
    validateNestedReferenceTypes(type, child, entries, resolveToken, diagnostics, childPath);
  };
  switch (expectedType) {
    case 'color':
      if (isRecord(value)) {
        if (Array.isArray(value.components)) {
          value.components.forEach((component, index) => check('number', component, [...path, 'components', String(index)]));
        }
        check('number', value.alpha, [...path, 'alpha']);
      }
      break;
    case 'dimension':
    case 'duration':
      if (isRecord(value)) check('number', value.value, [...path, 'value']);
      break;
    case 'cubicBezier':
      if (Array.isArray(value)) value.forEach((coordinate, index) => check('number', coordinate, [...path, String(index)]));
      break;
    case 'strokeStyle':
      if (isRecord(value) && Array.isArray(value.dashArray)) {
        value.dashArray.forEach((dash, index) => check('dimension', dash, [...path, 'dashArray', String(index)]));
      }
      break;
    case 'border':
      if (isRecord(value)) {
        check('color', value.color, [...path, 'color']);
        check('dimension', value.width, [...path, 'width']);
        check('strokeStyle', value.style, [...path, 'style']);
      }
      break;
    case 'transition':
      if (isRecord(value)) {
        check('duration', value.duration, [...path, 'duration']);
        check('duration', value.delay, [...path, 'delay']);
        check('cubicBezier', value.timingFunction, [...path, 'timingFunction']);
      }
      break;
    case 'shadow': {
      const shadows = Array.isArray(value) ? value : [value];
      shadows.forEach((shadow, index) => {
        const shadowPath = Array.isArray(value) ? [...path, String(index)] : path;
        if (isNestedReference(shadow)) {
          check('shadow', shadow, shadowPath);
        } else if (isRecord(shadow)) {
          check('color', shadow.color, [...shadowPath, 'color']);
          check('dimension', shadow.offsetX, [...shadowPath, 'offsetX']);
          check('dimension', shadow.offsetY, [...shadowPath, 'offsetY']);
          check('dimension', shadow.blur, [...shadowPath, 'blur']);
          check('dimension', shadow.spread, [...shadowPath, 'spread']);
        }
      });
      break;
    }
    case 'gradient':
      if (Array.isArray(value)) {
        value.forEach((stop, index) => {
          const stopPath = [...path, String(index)];
          if (isNestedReference(stop)) check('gradient', stop, stopPath);
          else if (isRecord(stop)) {
            check('color', stop.color, [...stopPath, 'color']);
            check('number', stop.position, [...stopPath, 'position']);
          }
        });
      }
      break;
    case 'typography':
      if (isRecord(value)) {
        check('fontFamily', value.fontFamily, [...path, 'fontFamily']);
        check('dimension', value.fontSize, [...path, 'fontSize']);
        check('fontWeight', value.fontWeight, [...path, 'fontWeight']);
        check('dimension', value.letterSpacing, [...path, 'letterSpacing']);
        check('number', value.lineHeight, [...path, 'lineHeight']);
      }
      break;
    case 'fontFamily':
    case 'fontWeight':
    case 'number':
      break;
  }
}

function nestedReferenceTarget(
  value: DtcgJsonValue,
  entries: Map<string, TokenEntry>,
  diagnostics: DtcgDiagnostic[],
  path: string[],
): TokenEntry | undefined {
  if (typeof value === 'string' && looksLikeCurlyReference(value)) {
    const segments = parseCurlyReference(value);
    return segments === undefined ? undefined : entries.get(pathKey(segments));
  }
  if (isRecord(value) && isReferenceObject(value)) {
    const segments = parseJsonPointer(value.$ref, diagnostics, [...path, '$ref']);
    return segments === undefined ? undefined : tokenEntryForWholePointer(segments, entries);
  }
  return undefined;
}

function isNestedReference(value: DtcgJsonValue): boolean {
  return (typeof value === 'string' && looksLikeCurlyReference(value))
    || (isRecord(value) && isReferenceObject(value));
}

function resolveNestedReferences(
  value: DtcgJsonValue | undefined,
  document: JsonRecord,
  entries: Map<string, TokenEntry>,
  resolveToken: (entry: TokenEntry) => ResolvedTokenInternal | undefined,
  diagnostics: DtcgDiagnostic[],
  diagnosticPath: string[],
  activePointers: Set<string>,
  arrayAliasType?: 'gradient' | 'shadow',
): DtcgJsonValue | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string' && looksLikeCurlyReference(value)) {
    const segments = parseCurlyReference(value);
    if (segments === undefined) {
      addDiagnostic(diagnostics, 'error', 'invalid-reference', diagnosticPath, 'Malformed curly-brace token reference.');
      return undefined;
    }
    const target = entries.get(pathKey(segments));
    if (target === undefined) {
      addDiagnostic(diagnostics, 'error', 'missing-reference', diagnosticPath, `Token reference ${value} was not found.`);
      return undefined;
    }
    return resolveToken(target)?.value;
  }
  if (Array.isArray(value)) {
    const output: DtcgJsonValue[] = [];
    value.forEach((item, index) => {
      const itemIsReference = isNestedReference(item);
      const resolved = resolveNestedReferences(
        item,
        document,
        entries,
        resolveToken,
        diagnostics,
        [...diagnosticPath, String(index)],
        activePointers,
      );
      if (resolved === undefined) return;
      if (arrayAliasType === 'gradient' && itemIsReference && Array.isArray(resolved)) {
        // The report forbids array flattening but its normative gradient example
        // references one-stop gradient tokens as stops. Unwrap only that defined
        // shape; rejecting multi-stop targets avoids inventing flattening rules.
        if (resolved.length === 1 && isRecord(resolved[0])) {
          output.push(resolved[0]);
        } else {
          invalidValue(
            diagnostics,
            [...diagnosticPath, String(index)],
            'A gradient array reference must resolve to exactly one gradient stop; multi-stop arrays are not flattened.',
          );
        }
        return;
      }
      output.push(resolved);
    });
    return output;
  }
  if (!isRecord(value)) return value;
  if (isReferenceObject(value)) {
    return resolveJsonPointerValue(
      value.$ref,
      document,
      entries,
      resolveToken,
      diagnostics,
      diagnosticPath,
      activePointers,
    );
  }
  const output: JsonRecord = {};
  for (const [key, child] of Object.entries(value)) {
    const resolved = resolveNestedReferences(
      child,
      document,
      entries,
      resolveToken,
      diagnostics,
      [...diagnosticPath, key],
      activePointers,
    );
    if (resolved !== undefined) output[key] = resolved;
  }
  return output;
}

function resolveJsonPointerValue(
  reference: string,
  document: JsonRecord,
  entries: Map<string, TokenEntry>,
  resolveToken: (entry: TokenEntry) => ResolvedTokenInternal | undefined,
  diagnostics: DtcgDiagnostic[],
  diagnosticPath: string[],
  activePointers: Set<string>,
): DtcgJsonValue | undefined {
  const segments = parseJsonPointer(reference, diagnostics, diagnosticPath);
  if (segments === undefined) return undefined;
  const pointerKey = `${reference}@${pointerFromPath(diagnosticPath)}`;
  if (activePointers.has(pointerKey)) {
    addDiagnostic(diagnostics, 'error', 'circular-reference', diagnosticPath, `Circular JSON Pointer reference ${reference}.`);
    return undefined;
  }
  const targetToken = tokenEntryForWholePointer(segments, entries);
  if (targetToken !== undefined) return resolveToken(targetToken)?.value;

  const target = valueAtPath(document, segments);
  if (target === undefined) {
    addDiagnostic(diagnostics, 'error', 'missing-reference', diagnosticPath, `JSON Pointer ${reference} was not found.`);
    return undefined;
  }
  activePointers.add(pointerKey);
  const resolved = resolveNestedReferences(
    target,
    document,
    entries,
    resolveToken,
    diagnostics,
    segments,
    activePointers,
  );
  activePointers.delete(pointerKey);
  return resolved;
}

function validateAndNormalizeTypeValue(
  type: DtcgTokenType,
  value: DtcgJsonValue,
  path: string[],
  diagnostics: DtcgDiagnostic[],
): DtcgJsonValue | undefined {
  switch (type) {
    case 'color':
      return validateColor(value, path, diagnostics) ? value : undefined;
    case 'dimension':
      return validateDimension(value, path, diagnostics) ? value : undefined;
    case 'fontFamily':
      return validateFontFamily(value, path, diagnostics) ? value : undefined;
    case 'fontWeight':
      return validateFontWeight(value, path, diagnostics) ? value : undefined;
    case 'duration':
      return validateDuration(value, path, diagnostics) ? value : undefined;
    case 'cubicBezier':
      return validateCubicBezier(value, path, diagnostics) ? value : undefined;
    case 'number':
      return requireNumber(value, path, diagnostics) ? value : undefined;
    case 'strokeStyle':
      return validateStrokeStyle(value, path, diagnostics) ? value : undefined;
    case 'border':
      return validateBorder(value, path, diagnostics) ? value : undefined;
    case 'transition':
      return validateTransition(value, path, diagnostics) ? value : undefined;
    case 'shadow':
      return validateShadow(value, path, diagnostics) ? value : undefined;
    case 'gradient':
      return validateGradient(value, path, diagnostics);
    case 'typography':
      return validateTypography(value, path, diagnostics) ? value : undefined;
  }
}

function validateColor(value: DtcgJsonValue, path: string[], diagnostics: DtcgDiagnostic[]): boolean {
  if (!requireRecord(value, path, diagnostics)) return false;
  let valid = exactKeys(value, ['colorSpace', 'components', 'alpha', 'hex'], path, diagnostics);
  const colorSpace = value.colorSpace;
  if (typeof colorSpace !== 'string' || !COLOR_SPACES.has(colorSpace)) {
    invalidValue(diagnostics, [...path, 'colorSpace'], 'Unsupported DTCG 2025.10 color space.');
    valid = false;
  }
  const components = value.components;
  if (!Array.isArray(components) || components.length !== 3) {
    invalidValue(diagnostics, [...path, 'components'], 'Color components must be an array of exactly three values.');
    valid = false;
  } else if (typeof colorSpace === 'string' && COLOR_SPACES.has(colorSpace)) {
    components.forEach((component, index) => {
      if (component === 'none') return;
      if (typeof component !== 'number' || !colorComponentInRange(colorSpace, index, component)) {
        invalidValue(
          diagnostics,
          [...path, 'components', String(index)],
          `Color component is outside the valid range for ${colorSpace}.`,
        );
        valid = false;
      }
    });
  }
  if ('alpha' in value && (typeof value.alpha !== 'number' || value.alpha < 0 || value.alpha > 1)) {
    invalidValue(diagnostics, [...path, 'alpha'], 'Color alpha must be between 0 and 1.');
    valid = false;
  }
  if ('hex' in value && (typeof value.hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value.hex))) {
    invalidValue(diagnostics, [...path, 'hex'], 'Color hex fallback must contain exactly six hexadecimal digits.');
    valid = false;
  }
  if (!('colorSpace' in value) || !('components' in value)) {
    invalidValue(diagnostics, path, 'Color values require colorSpace and components.');
    valid = false;
  }
  return valid;
}

function colorComponentInRange(colorSpace: string, index: number, component: number): boolean {
  if (['srgb', 'srgb-linear', 'display-p3', 'a98-rgb', 'prophoto-rgb', 'rec2020', 'xyz-d65', 'xyz-d50'].includes(colorSpace)) {
    return component >= 0 && component <= 1;
  }
  if (colorSpace === 'hsl' || colorSpace === 'hwb') {
    return index === 0 ? component >= 0 && component < 360 : component >= 0 && component <= 100;
  }
  if (colorSpace === 'lab') return index === 0 ? component >= 0 && component <= 100 : true;
  if (colorSpace === 'lch') {
    if (index === 0) return component >= 0 && component <= 100;
    if (index === 1) return component >= 0;
    return component >= 0 && component < 360;
  }
  if (colorSpace === 'oklab') return index === 0 ? component >= 0 && component <= 1 : true;
  if (colorSpace === 'oklch') {
    if (index === 0) return component >= 0 && component <= 1;
    if (index === 1) return component >= 0;
    return component >= 0 && component < 360;
  }
  return false;
}

function validateDimension(value: DtcgJsonValue, path: string[], diagnostics: DtcgDiagnostic[]): boolean {
  return validateUnitObject(value, path, diagnostics, new Set(['px', 'rem']), 'dimension');
}

function validateDuration(value: DtcgJsonValue, path: string[], diagnostics: DtcgDiagnostic[]): boolean {
  return validateUnitObject(value, path, diagnostics, new Set(['ms', 's']), 'duration');
}

function validateUnitObject(
  value: DtcgJsonValue,
  path: string[],
  diagnostics: DtcgDiagnostic[],
  units: Set<string>,
  label: string,
): boolean {
  if (!requireRecord(value, path, diagnostics)) return false;
  let valid = exactKeys(value, ['value', 'unit'], path, diagnostics);
  if (typeof value.value !== 'number') {
    invalidValue(diagnostics, [...path, 'value'], `${label} value must be a number.`);
    valid = false;
  }
  if (typeof value.unit !== 'string' || !units.has(value.unit)) {
    invalidValue(diagnostics, [...path, 'unit'], `${label} unit must be one of: ${[...units].join(', ')}.`);
    valid = false;
  }
  return valid;
}

function validateFontFamily(value: DtcgJsonValue, path: string[], diagnostics: DtcgDiagnostic[]): boolean {
  if (typeof value === 'string') return true;
  if (!Array.isArray(value) || value.some((family) => typeof family !== 'string')) {
    invalidValue(diagnostics, path, 'fontFamily must be a string or an array of strings.');
    return false;
  }
  if (value.length === 0) {
    addDiagnostic(
      diagnostics,
      'warning',
      'schema-divergence',
      path,
      'The normative report permits an empty fontFamily array, but the official schema requires at least one item.',
    );
  }
  return true;
}

function validateFontWeight(value: DtcgJsonValue, path: string[], diagnostics: DtcgDiagnostic[]): boolean {
  const valid =
    (typeof value === 'number' && value >= 1 && value <= 1000)
    || (typeof value === 'string' && FONT_WEIGHT_KEYWORDS.has(value));
  if (!valid) invalidValue(diagnostics, path, 'fontWeight must be a number from 1 to 1000 or a defined keyword.');
  return valid;
}

function validateCubicBezier(value: DtcgJsonValue, path: string[], diagnostics: DtcgDiagnostic[]): boolean {
  if (!Array.isArray(value) || value.length !== 4 || value.some((coordinate) => typeof coordinate !== 'number')) {
    invalidValue(diagnostics, path, 'cubicBezier must contain exactly four numeric coordinates.');
    return false;
  }
  const [x1, , x2] = value as [number, number, number, number];
  const validX = x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1;
  if (!validX) invalidValue(diagnostics, path, 'cubicBezier X coordinates must be between 0 and 1.');
  return validX;
}

function validateStrokeStyle(value: DtcgJsonValue, path: string[], diagnostics: DtcgDiagnostic[]): boolean {
  if (typeof value === 'string') {
    const valid = STROKE_STYLE_KEYWORDS.has(value);
    if (!valid) invalidValue(diagnostics, path, 'Unknown strokeStyle keyword.');
    return valid;
  }
  if (!requireRecord(value, path, diagnostics)) return false;
  let valid = exactKeys(value, ['dashArray', 'lineCap'], path, diagnostics);
  if (!Array.isArray(value.dashArray)) {
    invalidValue(diagnostics, [...path, 'dashArray'], 'strokeStyle dashArray must be an array.');
    valid = false;
  } else {
    value.dashArray.forEach((item, index) => {
      if (!validateDimension(item, [...path, 'dashArray', String(index)], diagnostics)) valid = false;
    });
  }
  if (typeof value.lineCap !== 'string' || !['round', 'butt', 'square'].includes(value.lineCap)) {
    invalidValue(diagnostics, [...path, 'lineCap'], 'strokeStyle lineCap must be round, butt, or square.');
    valid = false;
  }
  return valid;
}

function validateBorder(value: DtcgJsonValue, path: string[], diagnostics: DtcgDiagnostic[]): boolean {
  if (!requireRecord(value, path, diagnostics)) return false;
  let valid = exactKeys(value, ['color', 'width', 'style'], path, diagnostics);
  if (!validateColor(value.color as DtcgJsonValue, [...path, 'color'], diagnostics)) valid = false;
  if (!validateDimension(value.width as DtcgJsonValue, [...path, 'width'], diagnostics)) valid = false;
  if (!validateStrokeStyle(value.style as DtcgJsonValue, [...path, 'style'], diagnostics)) valid = false;
  return valid;
}

function validateTransition(value: DtcgJsonValue, path: string[], diagnostics: DtcgDiagnostic[]): boolean {
  if (!requireRecord(value, path, diagnostics)) return false;
  let valid = exactKeys(value, ['duration', 'delay', 'timingFunction'], path, diagnostics);
  if (!validateDuration(value.duration as DtcgJsonValue, [...path, 'duration'], diagnostics)) valid = false;
  if (!validateDuration(value.delay as DtcgJsonValue, [...path, 'delay'], diagnostics)) valid = false;
  if (!validateCubicBezier(value.timingFunction as DtcgJsonValue, [...path, 'timingFunction'], diagnostics)) valid = false;
  return valid;
}

function validateShadow(value: DtcgJsonValue, path: string[], diagnostics: DtcgDiagnostic[]): boolean {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      addDiagnostic(
        diagnostics,
        'warning',
        'schema-divergence',
        path,
        'The normative report does not require a non-empty shadow array, but the official schema does.',
      );
    }
    let valid = true;
    value.forEach((shadow, index) => {
      if (!validateShadowObject(shadow, [...path, String(index)], diagnostics)) valid = false;
    });
    return valid;
  }
  return validateShadowObject(value, path, diagnostics);
}

function validateShadowObject(value: DtcgJsonValue, path: string[], diagnostics: DtcgDiagnostic[]): boolean {
  if (!requireRecord(value, path, diagnostics)) return false;
  let valid = exactKeys(value, ['color', 'offsetX', 'offsetY', 'blur', 'spread', 'inset'], path, diagnostics);
  if (!validateColor(value.color as DtcgJsonValue, [...path, 'color'], diagnostics)) valid = false;
  for (const field of ['offsetX', 'offsetY', 'blur', 'spread'] as const) {
    if (!validateDimension(value[field] as DtcgJsonValue, [...path, field], diagnostics)) valid = false;
  }
  if ('inset' in value && typeof value.inset !== 'boolean') {
    invalidValue(diagnostics, [...path, 'inset'], 'shadow inset must be a boolean.');
    valid = false;
  }
  return valid;
}

function validateGradient(
  value: DtcgJsonValue,
  path: string[],
  diagnostics: DtcgDiagnostic[],
): DtcgJsonValue | undefined {
  if (!Array.isArray(value)) {
    invalidValue(diagnostics, path, 'gradient must be an array of stops.');
    return undefined;
  }
  if (value.length === 0) {
    addDiagnostic(
      diagnostics,
      'warning',
      'schema-divergence',
      path,
      'The normative report does not require a non-empty gradient array, but the official schema does.',
    );
  }
  let valid = true;
  const normalized = value.map((stop, index) => {
    const stopPath = [...path, String(index)];
    if (!requireRecord(stop, stopPath, diagnostics)) {
      valid = false;
      return stop;
    }
    if (!exactKeys(stop, ['color', 'position'], stopPath, diagnostics)) valid = false;
    if (!validateColor(stop.color as DtcgJsonValue, [...stopPath, 'color'], diagnostics)) valid = false;
    if (typeof stop.position !== 'number') {
      invalidValue(diagnostics, [...stopPath, 'position'], 'gradient position must be a number.');
      valid = false;
      return stop;
    }
    return { ...stop, position: Math.max(0, Math.min(1, stop.position)) };
  });
  return valid ? normalized : undefined;
}

function validateTypography(value: DtcgJsonValue, path: string[], diagnostics: DtcgDiagnostic[]): boolean {
  if (!requireRecord(value, path, diagnostics)) return false;
  let valid = exactKeys(value, ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight'], path, diagnostics);
  if (!validateFontFamily(value.fontFamily as DtcgJsonValue, [...path, 'fontFamily'], diagnostics)) valid = false;
  if (!validateDimension(value.fontSize as DtcgJsonValue, [...path, 'fontSize'], diagnostics)) valid = false;
  if (!validateFontWeight(value.fontWeight as DtcgJsonValue, [...path, 'fontWeight'], diagnostics)) valid = false;
  if (!validateDimension(value.letterSpacing as DtcgJsonValue, [...path, 'letterSpacing'], diagnostics)) valid = false;
  if (!requireNumber(value.lineHeight as DtcgJsonValue, [...path, 'lineHeight'], diagnostics)) valid = false;
  return valid;
}

function requireNumber(value: DtcgJsonValue, path: string[], diagnostics: DtcgDiagnostic[]): boolean {
  if (typeof value === 'number') return true;
  invalidValue(diagnostics, path, 'Value must be a number.');
  return false;
}

function requireRecord(
  value: DtcgJsonValue | undefined,
  path: string[],
  diagnostics: DtcgDiagnostic[],
): value is JsonRecord {
  if (isRecord(value)) return true;
  invalidValue(diagnostics, path, 'Value must be an object.');
  return false;
}

function exactKeys(
  value: JsonRecord,
  allowed: readonly string[],
  path: string[],
  diagnostics: DtcgDiagnostic[],
): boolean {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !allowedSet.has(key));
  for (const key of unexpected) invalidValue(diagnostics, [...path, key], `Unexpected value property ${key}.`);
  const required = allowed.filter((key) => !['alpha', 'hex', 'inset'].includes(key));
  const missing = required.filter((key) => !(key in value));
  for (const key of missing) invalidValue(diagnostics, [...path, key], `Missing required value property ${key}.`);
  return unexpected.length === 0 && missing.length === 0;
}

function parseCurlyReference(reference: string): string[] | undefined {
  if (!isCurlyReference(reference)) return undefined;
  const segments = reference.slice(1, -1).split('.');
  if (segments.some((segment, index) => segment.length === 0 || /[{}.]/.test(segment) || (segment.startsWith('$') && !(segment === '$root' && index === segments.length - 1)))) {
    return undefined;
  }
  return segments;
}

function parseJsonPointer(
  reference: string,
  diagnostics: DtcgDiagnostic[],
  diagnosticPath: string[],
): string[] | undefined {
  if (!isJsonPointer(reference)) {
    addDiagnostic(diagnostics, 'error', 'invalid-json-pointer', diagnosticPath, `Invalid JSON Pointer ${reference}.`);
    return undefined;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(reference.slice(1));
  } catch {
    addDiagnostic(diagnostics, 'error', 'invalid-json-pointer', diagnosticPath, `Invalid URI encoding in ${reference}.`);
    return undefined;
  }
  if (decoded === '') return [];
  if (!decoded.startsWith('/')) {
    addDiagnostic(diagnostics, 'error', 'invalid-json-pointer', diagnosticPath, `Invalid JSON Pointer ${reference}.`);
    return undefined;
  }
  const segments: string[] = [];
  for (const encodedSegment of decoded.slice(1).split('/')) {
    if (/~(?:[^01]|$)/.test(encodedSegment)) {
      addDiagnostic(diagnostics, 'error', 'invalid-json-pointer', diagnosticPath, `Invalid RFC 6901 escape in ${reference}.`);
      return undefined;
    }
    segments.push(encodedSegment.replace(/~1/g, '/').replace(/~0/g, '~'));
  }
  return segments;
}

function valueAtPath(root: DtcgJsonValue, segments: readonly string[]): DtcgJsonValue | undefined {
  let current: DtcgJsonValue | undefined = root;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9]\d*)$/.test(segment)) return undefined;
      current = current[Number(segment)];
    } else if (isRecord(current) && Object.prototype.hasOwnProperty.call(current, segment)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function pointerFromPath(path: readonly string[]): string {
  return path.length === 0 ? '#' : `#/${path.map((segment) => segment.replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`;
}

function pathKey(path: readonly string[]): string {
  return JSON.stringify(path);
}

function isTokenNode(value: JsonRecord): boolean {
  return Object.prototype.hasOwnProperty.call(value, '$value') || Object.prototype.hasOwnProperty.call(value, '$ref');
}

function isWholeTokenReference(token: JsonRecord): boolean {
  return typeof token.$ref === 'string'
    || (typeof token.$value === 'string' && looksLikeCurlyReference(token.$value))
    || (isRecord(token.$value) && isReferenceObject(token.$value));
}

function isReferenceObject(value: JsonRecord): value is JsonRecord & { $ref: string } {
  return Object.keys(value).length === 1 && typeof value.$ref === 'string';
}

function isCurlyReference(value: string): boolean {
  return value.startsWith('{') && value.endsWith('}') && parseCurlyReferenceUnchecked(value);
}

function parseCurlyReferenceUnchecked(value: string): boolean {
  const segments = value.slice(1, -1).split('.');
  return segments.every(
    (segment, index) =>
      segment.length > 0
      && !/[{}.]/.test(segment)
      && (!segment.startsWith('$') || (segment === '$root' && index === segments.length - 1)),
  );
}

function looksLikeCurlyReference(value: string): boolean {
  return value.startsWith('{') && value.endsWith('}');
}

function isJsonPointer(value: string): boolean {
  return value === '#' || value.startsWith('#/');
}

function readTokenType(value: DtcgJsonValue | undefined): DtcgTokenType | undefined {
  return typeof value === 'string' && TOKEN_TYPE_SET.has(value) ? (value as DtcgTokenType) : undefined;
}

function readDeprecated(value: DtcgJsonValue | undefined): DtcgDeprecated | undefined {
  return typeof value === 'boolean' || typeof value === 'string' ? value : undefined;
}

function withoutKey(record: JsonRecord, key: string): JsonRecord {
  const output = cloneJson(record);
  delete output[key];
  return output;
}

function cloneJson<T extends DtcgJsonValue>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneJson(item)) as T;
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJson(item)])) as T;
  }
  return value;
}

function sortJson(value: DtcgJsonValue): DtcgJsonValue {
  if (Array.isArray(value)) return value.map((item) => sortJson(item));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
      .map((key) => [key, sortJson(value[key]!)]),
  );
}

function isRecord(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function addDiagnostic(
  diagnostics: DtcgDiagnostic[],
  severity: DtcgDiagnostic['severity'],
  code: DtcgDiagnosticCode,
  path: string[],
  message: string,
): void {
  diagnostics.push({ severity, code, path: pointerFromPath(path), message });
}

function invalidMetadata(diagnostics: DtcgDiagnostic[], path: string[], message: string): void {
  addDiagnostic(diagnostics, 'error', 'invalid-metadata', path, message);
}

function invalidValue(diagnostics: DtcgDiagnostic[], path: string[], message: string): void {
  addDiagnostic(diagnostics, 'error', 'invalid-value', path, message);
}

function hasErrors(diagnostics: readonly DtcgDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

function hasErrorsForPath(diagnostics: readonly DtcgDiagnostic[], path: readonly string[]): boolean {
  const pointer = pointerFromPath(path);
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === 'error'
      && (diagnostic.path === pointer || diagnostic.path.startsWith(`${pointer}/`)),
  );
}

function uniqueDiagnostics(diagnostics: readonly DtcgDiagnostic[]): DtcgDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.severity}:${diagnostic.code}:${diagnostic.path}:${diagnostic.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
