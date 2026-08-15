import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import {
  DesignSystemComponentDefinitionSchema,
  DesignSystemComponentsIndexSchema,
  DesignSystemFallbackRulesSchema,
  DesignSystemIntentMapSchema,
  DesignSystemLintRulesSchema,
  isSafeDesignSystemRuntimePath,
  validateDesignSystemRuntimeReferences,
  type DesignSystemComponentDefinition,
  type DesignSystemComponentsIndex,
  type DesignSystemFallbackRules,
  type DesignSystemIntentMap,
  type DesignSystemLintRules,
  type DesignSystemRuntimeBundle,
  type DesignSystemRuntimePaths,
  type LoadedDesignSystemComponent,
} from '@open-design/contracts';

export type DesignSystemRuntimeLoadResult =
  | { mode: 'legacy' }
  | { mode: 'structured'; bundle: DesignSystemRuntimeBundle; packageRoot: string }
  | { mode: 'invalid'; errors: string[] };

type RuntimeSchema<T> = {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } };
};

type ParsedFile<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export async function loadDesignSystemRuntimePackage(
  brandRoot: string,
  paths: DesignSystemRuntimePaths | undefined,
): Promise<DesignSystemRuntimeLoadResult> {
  if (paths === undefined) return { mode: 'legacy' };

  const unsafePath = Object.values(paths).find((runtimePath) => !isSafeDesignSystemRuntimePath(runtimePath));
  if (unsafePath !== undefined) {
    return { mode: 'invalid', errors: [`runtime path ${unsafePath} is not a safe relative path`] };
  }

  const [componentsIndex, intentMap, lint, fallback] = await Promise.all([
    readRuntimeJson(brandRoot, paths.components, DesignSystemComponentsIndexSchema),
    readRuntimeJson(brandRoot, paths.intents, DesignSystemIntentMapSchema),
    readRuntimeJson(brandRoot, paths.lint, DesignSystemLintRulesSchema),
    readRuntimeJson(brandRoot, paths.fallback, DesignSystemFallbackRulesSchema),
  ]);
  const primaryErrors = collectErrors([
    [paths.components, componentsIndex],
    [paths.intents, intentMap],
    [paths.lint, lint],
    [paths.fallback, fallback],
  ]);
  if (primaryErrors.length > 0) return { mode: 'invalid', errors: primaryErrors };

  const parsedIndex = valueOf(componentsIndex);
  const parsedIntentMap = valueOf(intentMap);
  const parsedLint = valueOf(lint);
  const parsedFallback = valueOf(fallback);
  const componentResults = await Promise.all(
    parsedIndex.components.map(async (entry) => ({
      entry,
      parsed: await readRuntimeJson(brandRoot, entry.path, DesignSystemComponentDefinitionSchema),
    })),
  );
  const componentErrors = componentResults.flatMap(({ entry, parsed }) =>
    parsed.ok ? [] : [`${entry.path}: ${parsed.error}`],
  );
  if (componentErrors.length > 0) return { mode: 'invalid', errors: componentErrors };

  const components: LoadedDesignSystemComponent[] = componentResults.map(({ entry, parsed }) => ({
    path: entry.path,
    definition: valueOf(parsed),
  }));
  const referenceErrors = validateDesignSystemRuntimeReferences({
    componentsIndex: parsedIndex,
    components,
    intentMap: parsedIntentMap,
  });
  if (referenceErrors.length > 0) return { mode: 'invalid', errors: referenceErrors };

  return {
    mode: 'structured',
    packageRoot: brandRoot,
    bundle: {
      paths,
      componentsIndex: parsedIndex,
      components,
      intentMap: parsedIntentMap,
      lint: parsedLint,
      fallback: parsedFallback,
    },
  };
}

/**
 * Compact push-layer index for the system prompt. Component implementations,
 * property definitions, and state selectors stay out of the prompt and are
 * returned only when the agent resolves one of these canonical intents.
 */
export function summarizeDesignSystemIntentMapForPrompt(
  bundle: DesignSystemRuntimeBundle,
): string {
  const componentNames = new Map(
    bundle.components.map(({ definition }) => [definition.id, definition.name]),
  );
  const lines = bundle.intentMap.mappings.map((mapping) => {
    const component = componentNames.get(mapping.component) ?? mapping.component;
    const target = `${component}${mapping.variant ? `.${mapping.variant}` : ''}`;
    const description = mapping.description?.trim();
    return `- \`${mapping.intent}\` → ${target}${description ? ` — ${description}` : ''}`;
  });
  return [
    'Canonical business intents declared by the active design system:',
    ...lines,
  ].join('\n');
}

async function readRuntimeJson<T>(
  brandRoot: string,
  relativePath: string,
  schema: RuntimeSchema<T>,
): Promise<ParsedFile<T>> {
  const resolvedRoot = path.resolve(brandRoot);
  const filePath = path.resolve(brandRoot, relativePath);
  if (filePath === resolvedRoot || !filePath.startsWith(`${resolvedRoot}${path.sep}`)) {
    return { ok: false, error: 'path escapes the design-system package root' };
  }

  let value: unknown;
  try {
    const [realRoot, realFile] = await Promise.all([realpath(resolvedRoot), realpath(filePath)]);
    if (realFile === realRoot || !realFile.startsWith(`${realRoot}${path.sep}`)) {
      return { ok: false, error: 'path resolves outside the design-system package root' };
    }
    value = JSON.parse(await readFile(realFile, 'utf8')) as unknown;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    error: parsed.error.issues
      .map((issue) => `${formatIssuePath(issue.path)} ${issue.message}`)
      .join('; '),
  };
}

function collectErrors(
  entries: Array<readonly [string, ParsedFile<unknown>]>,
): string[] {
  return entries.flatMap(([filePath, parsed]) => parsed.ok ? [] : [`${filePath}: ${parsed.error}`]);
}

function valueOf<T>(parsed: ParsedFile<T>): T {
  if (!parsed.ok) throw new Error('attempted to read an invalid design-system runtime file');
  return parsed.value;
}

function formatIssuePath(parts: readonly PropertyKey[]): string {
  if (parts.length === 0) return '$';
  return `$${parts.map((part) => typeof part === 'number' ? `[${part}]` : `.${String(part)}`).join('')}`;
}

export type {
  DesignSystemComponentDefinition,
  DesignSystemComponentsIndex,
  DesignSystemFallbackRules,
  DesignSystemIntentMap,
  DesignSystemLintRules,
};
