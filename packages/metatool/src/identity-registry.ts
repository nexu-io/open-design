import { readFile } from "node:fs/promises";

import type { ContentIdentitySource } from "./identity.ts";

export type ContentIdentitySourceSetDeclaration = Readonly<{
  inherits?: readonly string[];
  normalizePackageVersion?: boolean;
  normalizeTextLineEndings?: boolean;
  paths: readonly (string | ContentIdentitySource)[];
}>;

export type ContentIdentityDeclaration = Readonly<{
  parameters: readonly string[];
  schemaVersion: number;
  sourceSets: readonly string[];
}>;

export type ContentIdentityRegistry = Readonly<{
  defaults?: Readonly<{ excludeDirectoryNames?: readonly string[] }>;
  identities: Readonly<Record<string, ContentIdentityDeclaration>>;
  schemaVersion: number;
  sourceSets: Readonly<Record<string, ContentIdentitySourceSetDeclaration>>;
}>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  return value;
}

function assertKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${label} contains unknown fields: ${unknown.join(", ")}`);
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value == null) return undefined;
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
  return value;
}

function booleanValue(value: unknown, label: string): boolean {
  const parsed = optionalBoolean(value, label);
  if (parsed == null) throw new Error(`${label} is required`);
  return parsed;
}

function sourceDeclaration(value: unknown, label: string): ContentIdentitySource {
  const source = record(value, label);
  assertKeys(source, [
    "excludeDirectoryNames",
    "excludePaths",
    "normalizePackageVersion",
    "normalizeTextLineEndings",
    "path",
  ], label);
  if (typeof source.path !== "string" || source.path.length === 0) throw new Error(`${label}.path is invalid`);
  return {
    ...(source.excludeDirectoryNames == null ? {} : { excludeDirectoryNames: strings(source.excludeDirectoryNames, `${label}.excludeDirectoryNames`) }),
    ...(source.excludePaths == null ? {} : { excludePaths: strings(source.excludePaths, `${label}.excludePaths`) }),
    ...(source.normalizePackageVersion == null ? {} : { normalizePackageVersion: booleanValue(source.normalizePackageVersion, `${label}.normalizePackageVersion`) }),
    ...(source.normalizeTextLineEndings == null ? {} : { normalizeTextLineEndings: booleanValue(source.normalizeTextLineEndings, `${label}.normalizeTextLineEndings`) }),
    path: source.path,
  };
}

export function parseContentIdentityRegistry(value: unknown): ContentIdentityRegistry {
  const root = record(value, "identity registry");
  assertKeys(root, ["defaults", "identities", "schemaVersion", "sourceSets"], "identity registry");
  if (root.schemaVersion !== 1) throw new Error("unsupported identity registry schemaVersion");
  const defaultsValue = root.defaults == null ? {} : record(root.defaults, "identity defaults");
  assertKeys(defaultsValue, ["excludeDirectoryNames"], "identity defaults");
  const defaults = {
    excludeDirectoryNames: defaultsValue.excludeDirectoryNames == null
      ? []
      : strings(defaultsValue.excludeDirectoryNames, "identity defaults.excludeDirectoryNames"),
  };
  const sourceSetsValue = record(root.sourceSets, "identity sourceSets");
  const sourceSets = Object.fromEntries(Object.entries(sourceSetsValue).map(([id, raw]) => {
    if (!/^[a-z][a-z0-9._-]*$/u.test(id)) throw new Error(`invalid identity sourceSet id: ${id}`);
    const sourceSet = record(raw, `identity sourceSet ${id}`);
    assertKeys(sourceSet, ["inherits", "normalizePackageVersion", "normalizeTextLineEndings", "paths"], `identity sourceSet ${id}`);
    if (!Array.isArray(sourceSet.paths) || sourceSet.paths.length === 0) throw new Error(`identity sourceSet ${id}.paths must be non-empty`);
    const paths = sourceSet.paths.map((path, index) => {
      if (typeof path !== "string") return sourceDeclaration(path, `identity sourceSet ${id}.paths[${index}]`);
      if (path.length === 0) throw new Error(`identity sourceSet ${id}.paths[${index}] must be non-empty`);
      return path;
    });
    return [id, {
      inherits: sourceSet.inherits == null ? [] : strings(sourceSet.inherits, `identity sourceSet ${id}.inherits`),
      normalizePackageVersion: optionalBoolean(sourceSet.normalizePackageVersion, `identity sourceSet ${id}.normalizePackageVersion`) ?? false,
      normalizeTextLineEndings: optionalBoolean(sourceSet.normalizeTextLineEndings, `identity sourceSet ${id}.normalizeTextLineEndings`) ?? false,
      paths,
    }];
  }));
  const identitiesValue = record(root.identities, "identity declarations");
  const identities = Object.fromEntries(Object.entries(identitiesValue).map(([id, raw]) => {
    if (!/^[a-z][a-z0-9._-]*$/u.test(id)) throw new Error(`invalid identity id: ${id}`);
    const identity = record(raw, `identity ${id}`);
    assertKeys(identity, ["parameters", "schemaVersion", "sourceSets"], `identity ${id}`);
    if (!Number.isSafeInteger(identity.schemaVersion) || Number(identity.schemaVersion) < 1) throw new Error(`identity ${id}.schemaVersion must be positive`);
    const parameters = strings(identity.parameters, `identity ${id}.parameters`);
    if (new Set(parameters).size !== parameters.length) throw new Error(`identity ${id}.parameters must be unique`);
    if (parameters.some((parameter) => !/^[A-Za-z][A-Za-z0-9]*$/u.test(parameter))) {
      throw new Error(`identity ${id}.parameters contains an invalid name`);
    }
    return [id, {
      parameters,
      schemaVersion: Number(identity.schemaVersion),
      sourceSets: strings(identity.sourceSets, `identity ${id}.sourceSets`),
    }];
  }));
  return { defaults, identities, schemaVersion: 1, sourceSets };
}

export async function readContentIdentityRegistry(path: string): Promise<ContentIdentityRegistry> {
  return parseContentIdentityRegistry(JSON.parse(await readFile(path, "utf8")) as unknown);
}

export function resolveContentIdentityDeclaration(
  registry: ContentIdentityRegistry,
  id: string,
): Readonly<{ declaration: ContentIdentityDeclaration; id: string; sources: readonly ContentIdentitySource[] }> {
  const declaration = registry.identities[id];
  if (declaration == null) throw new Error(`unknown content identity: ${id}`);
  const sources = new Map<string, ContentIdentitySource>();
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function addSourceSet(sourceSetId: string): void {
    if (visited.has(sourceSetId)) return;
    if (visiting.has(sourceSetId)) throw new Error(`content identity sourceSet cycle: ${sourceSetId}`);
    const sourceSet = registry.sourceSets[sourceSetId];
    if (sourceSet == null) throw new Error(`content identity ${id} references unknown sourceSet: ${sourceSetId}`);
    visiting.add(sourceSetId);
    for (const inherited of sourceSet.inherits ?? []) addSourceSet(inherited);
    for (const raw of sourceSet.paths) {
      const source = typeof raw === "string" ? { path: raw } : raw;
      if (sources.has(source.path)) throw new Error(`content identity ${id} contains duplicate source path: ${source.path}`);
      const excludeDirectoryNames = source.excludeDirectoryNames ?? registry.defaults?.excludeDirectoryNames;
      sources.set(source.path, {
        ...source,
        ...(excludeDirectoryNames == null ? {} : { excludeDirectoryNames }),
        ...(source.normalizePackageVersion == null && sourceSet.normalizePackageVersion === true
          ? { normalizePackageVersion: true }
          : {}),
        ...(source.normalizeTextLineEndings == null && sourceSet.normalizeTextLineEndings === true
          ? { normalizeTextLineEndings: true }
          : {}),
      });
    }
    visiting.delete(sourceSetId);
    visited.add(sourceSetId);
  }
  for (const sourceSet of declaration.sourceSets) addSourceSet(sourceSet);
  return { declaration, id, sources: [...sources.values()].sort((left, right) => left.path.localeCompare(right.path)) };
}
