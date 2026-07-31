import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

import type { GuardContext } from "./core.ts";

const suiteModule = "e2e/lib/playwright/suites.ts";
const scopesModule = "scripts/scopes.ts";
const guardModule = "scripts/guard.ts";
const guardLibraryPrefix = "scripts/lib/guard/";
const scopePolicyModule = `${guardLibraryPrefix}scope.ts`;
const scopeLibraryPrefix = "scripts/lib/scope/";

function repositoryPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

async function collectTypeScriptSources(
  root: string,
  directory = "scripts",
): Promise<Map<string, string>> {
  const sources = new Map<string, string>();
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = repositoryPath(path.join(directory, entry.name));
    if (entry.isDirectory()) {
      for (const [file, source] of await collectTypeScriptSources(root, relativePath)) {
        sources.set(file, source);
      }
    } else if (entry.isFile() && /\.(?:[cm]?ts|tsx)$/.test(entry.name)) {
      sources.set(relativePath, await readFile(path.join(root, relativePath), "utf8"));
    }
  }
  return sources;
}

export async function loadScriptsArchitectureSources(repoRoot: string): Promise<Map<string, string>> {
  const sources = await collectTypeScriptSources(repoRoot);
  sources.set(suiteModule, await readFile(path.join(repoRoot, suiteModule), "utf8"));
  return sources;
}

function importsFrom(source: string): string[] {
  return ts.preProcessFile(source, true, true).importedFiles.map(({ fileName }) => fileName);
}

function hasCliProcessControl(source: string): boolean {
  const sourceFile = ts.createSourceFile("module.ts", source, ts.ScriptTarget.Latest, true);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "process" &&
      ["argv", "exit", "exitCode"].includes(node.name.text)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function resolveImport(
  importer: string,
  specifier: string,
  sources: ReadonlyMap<string, string>,
): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const unresolved = path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
  const candidates = [
    unresolved,
    unresolved.replace(/\.js$/, ".ts"),
    unresolved.replace(/\.mjs$/, ".mts"),
    unresolved.replace(/\.cjs$/, ".cts"),
    `${unresolved}.ts`,
    `${unresolved}/index.ts`,
  ];
  return candidates.find((candidate) => sources.has(candidate)) ?? unresolved;
}

function cycleErrors(graph: ReadonlyMap<string, readonly string[]>, roots: readonly string[]): string[] {
  const errors: string[] = [];
  const visited = new Set<string>();
  const active = new Set<string>();
  const stack: string[] = [];

  function visit(module: string): void {
    if (active.has(module)) {
      const start = stack.indexOf(module);
      errors.push(`module cycle: ${[...stack.slice(start), module].join(" -> ")}`);
      return;
    }
    if (visited.has(module)) return;
    visited.add(module);
    active.add(module);
    stack.push(module);
    for (const dependency of graph.get(module) ?? []) visit(dependency);
    stack.pop();
    active.delete(module);
  }

  for (const root of roots) visit(root);
  return errors;
}

export function scriptsArchitectureErrors(sources: ReadonlyMap<string, string>): string[] {
  const errors: string[] = [];
  const graph = new Map<string, string[]>();

  for (const [module, source] of sources) {
    const dependencies: string[] = [];
    for (const specifier of importsFrom(source)) {
      const dependency = resolveImport(module, specifier, sources);
      if (dependency != null) dependencies.push(dependency);

      if (
        dependency?.startsWith(guardLibraryPrefix) &&
        module !== guardModule &&
        !module.startsWith(guardLibraryPrefix)
      ) {
        errors.push(`${module} must consume guard policy through ${guardModule}, not ${dependency}`);
      }

      if (!module.startsWith(guardLibraryPrefix)) continue;
      if (specifier.startsWith("node:") || specifier === "typescript") continue;
      if (dependency != null && specifier.startsWith(".") && !sources.has(dependency)) {
        errors.push(`${module} imports missing module ${dependency}`);
      }
      if (
        dependency == null ||
        (!dependency.startsWith(guardLibraryPrefix) &&
          (module !== scopePolicyModule ||
            (dependency !== scopesModule && dependency !== suiteModule)))
      ) {
        errors.push(`${module} imports ${specifier} outside the guard library closure`);
      }
      if (dependency === guardModule) {
        errors.push(`${module} must not depend on the guard CLI entrypoint`);
      }
    }
    graph.set(module, dependencies.filter((dependency) => sources.has(dependency)));

    if (module.startsWith(guardLibraryPrefix) && hasCliProcessControl(source)) {
      errors.push(`${module} contains CLI process control; keep entrypoint effects in ${guardModule}`);
    }
  }

  const scopeClosure = new Set<string>();
  const visitScope = (module: string): void => {
    if (scopeClosure.has(module)) return;
    scopeClosure.add(module);
    const source = sources.get(module);
    if (source == null) {
      errors.push(`${module} is missing from the preinstall scope closure`);
      return;
    }
    for (const specifier of importsFrom(source)) {
      if (specifier.startsWith("node:")) continue;
      const dependency = resolveImport(module, specifier, sources);
      if (
        dependency == null ||
        (dependency !== suiteModule && !dependency.startsWith(scopeLibraryPrefix))
      ) {
        errors.push(`${module} imports ${specifier} outside the install-independent scope closure`);
        continue;
      }
      visitScope(dependency);
    }
  };
  visitScope(scopesModule);

  errors.push(
    ...cycleErrors(graph, [
      scopesModule,
      ...[...sources.keys()].filter((module) => module.startsWith("scripts/lib/")),
    ]),
  );
  return [...new Set(errors)].sort();
}

export async function checkScriptsLibraryArchitecture(context: GuardContext): Promise<boolean> {
  const errors = scriptsArchitectureErrors(await loadScriptsArchitectureSources(context.repoRoot));
  if (errors.length > 0) {
    console.error("Scripts library architecture violations found:");
    for (const error of errors) console.error(`- ${error}`);
    return false;
  }
  console.log("Scripts library architecture check passed: scope startup and guard internals stay layered.");
  return true;
}
