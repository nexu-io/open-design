import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { resolveContentIdentity, type ContentIdentityResult } from "@open-design/metatool";

import { readIdentityRegistry, resolveIdentityDeclaration } from "../declaration/registry.ts";

export async function resolveReleaseIdentity(options: Readonly<{
  id: string;
  parameters: Readonly<Record<string, unknown>>;
  workspaceRoot: string;
}>): Promise<ContentIdentityResult> {
  const registry = await readIdentityRegistry(options.workspaceRoot);
  const resolved = resolveIdentityDeclaration(registry, options.id);
  const actualNames = Object.keys(options.parameters).sort();
  const expectedNames = [...resolved.declaration.parameters].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`release identity ${options.id} parameters must be exactly: ${expectedNames.join(", ")}`);
  }
  return await resolveContentIdentity({
    id: options.id,
    parameters: { declaration: resolved.declaration, values: options.parameters },
    root: options.workspaceRoot,
    schemaVersion: resolved.declaration.schemaVersion,
    sources: resolved.sources,
  });
}

export async function resolveReleaseIdentityCli(options: Readonly<{
  id: string;
  output?: string;
  parameter?: string | string[];
  parameters?: string;
  root?: string;
}>): Promise<void> {
  const workspaceRoot = resolve(options.root ?? process.cwd());
  if (options.parameters != null && options.parameter != null) {
    throw new Error("identity resolve accepts either --parameters or --parameter, not both");
  }
  const parameters = options.parameters == null
    ? parseParameters(options.parameter)
    : JSON.parse(await readFile(resolve(options.parameters), "utf8")) as Record<string, unknown>;
  const result = await resolveReleaseIdentity({ id: options.id, parameters, workspaceRoot });
  const body = `${JSON.stringify(result, null, 2)}\n`;
  if (options.output == null) process.stdout.write(body);
  else await writeFile(resolve(options.output), body, "utf8");
}

function parseParameter(value: string): readonly [string, unknown] {
  const separator = value.indexOf("=");
  if (separator < 1) throw new Error(`identity parameter must be key=value: ${value}`);
  const key = value.slice(0, separator);
  const raw = value.slice(separator + 1);
  if (!/^[A-Za-z][A-Za-z0-9]*$/u.test(key)) throw new Error(`invalid identity parameter name: ${key}`);
  try {
    return [key, JSON.parse(raw) as unknown];
  } catch {
    return [key, raw];
  }
}

function parseParameters(value?: string | string[]): Record<string, unknown> {
  const values = value == null ? [] : Array.isArray(value) ? value : [value];
  const entries = values.map(parseParameter);
  if (new Set(entries.map(([key]) => key)).size !== entries.length) {
    throw new Error("identity parameters must be unique");
  }
  return Object.fromEntries(entries);
}

export async function printReleaseIdentityDigest(options: Readonly<{
  id: string;
  parameter?: string | string[];
  root?: string;
}>): Promise<void> {
  const parameters = parseParameters(options.parameter);
  const result = await resolveReleaseIdentity({
    id: options.id,
    parameters,
    workspaceRoot: resolve(options.root ?? process.cwd()),
  });
  process.stdout.write(`${result.digest}\n`);
}
