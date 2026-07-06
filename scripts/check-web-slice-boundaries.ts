import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

// Boundary guard for the apps/web vertical-slice architecture (ADR 0002).
//
// A slice under `apps/web/src/features/<slice>/` owns ports, pure rules, UI
// types, hooks and dumb components, and reaches transport ONLY through the
// provider adapter its `dependencies.ts` binds. This guard enforces the seams
// that keep that decomposition honest:
//
//   1. Slice files are transport-free — no `fetch`, `EventSource`,
//      `XMLHttpRequest`, `WebSocket`, `localStorage`, `sessionStorage`,
//      `window`, or `document`. Transport lives behind a provider + port.
//   2. Only a slice's `dependencies.ts` may import from `providers/`. Every
//      other feature file depends on the port, not the adapter.
//   3. No cross-slice deep imports: a slice may import another slice only
//      through its public barrel (`features/<other>`), never a deep file.
//   4. One transport home per route: a route fetched inside a multi-adapter
//      provider folder (`providers/<resource>/`) must not also be owned by a
//      second provider folder. A plain component still fetching that route
//      inline is a tracked backlog (reported, not failed) — forcing every
//      caller to migrate the instant a provider home appears would turn a
//      bounded single-file slice PR into an app-wide flag day.
//
// The guard is intentionally scoped to migrated surfaces: it only inspects
// `features/**` and provider *folders* (flat legacy `providers/*.ts` files are
// left untouched), so it can ship and enforce slice-by-slice.

const repoRoot = path.resolve(import.meta.dirname, "..");
const webSrcDir = path.join(repoRoot, "apps", "web", "src");
const featuresDir = path.join(webSrcDir, "features");
const providersDir = path.join(webSrcDir, "providers");

const sourceExtensions = new Set([".ts", ".tsx"]);

// Bare globals that count as transport/DOM reach when used inside a slice file.
const forbiddenSliceGlobals = new Set([
  "fetch",
  "EventSource",
  "XMLHttpRequest",
  "WebSocket",
  "localStorage",
  "sessionStorage",
  "window",
  "document",
]);

type Violation = {
  filePath: string;
  lineNumber: number;
  message: string;
};

function repositoryPath(fullPath: string): string {
  return path.relative(repoRoot, fullPath).split(path.sep).join("/");
}

function scriptKindFor(fileName: string): ts.ScriptKind {
  return fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function lineOf(source: ts.SourceFile, position: number): number {
  return source.getLineAndCharacterOfPosition(position).line + 1;
}

async function collectSourceFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      files.push(...(await collectSourceFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

/** The slice a features/ file belongs to, or null for a loose top-level file. */
function sliceOf(fullPath: string): string | null {
  const rel = path.relative(featuresDir, fullPath);
  const segments = rel.split(path.sep);
  return segments.length > 1 ? (segments[0] ?? null) : null;
}

function moduleSpecifiersOf(source: ts.SourceFile): Array<{ specifier: string; node: ts.Node }> {
  const specifiers: Array<{ specifier: string; node: ts.Node }> = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push({ specifier: node.moduleSpecifier.text, node });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

/** First-argument route literals of `fetch(...)` calls in a source file. */
function fetchRouteLiteralsOf(source: ts.SourceFile): string[] {
  const routes: string[] = [];
  const visit = (node: ts.Node): void => {
    const firstArg = ts.isCallExpression(node) ? node.arguments[0] : undefined;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "fetch" &&
      firstArg &&
      ts.isStringLiteralLike(firstArg)
    ) {
      routes.push(firstArg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return routes;
}

/** Bare-identifier uses of a forbidden global (not a property name / import). */
function forbiddenGlobalUses(source: ts.SourceFile): Array<{ name: string; position: number }> {
  const uses: Array<{ name: string; position: number }> = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && forbiddenSliceGlobals.has(node.text)) {
      const parent = node.parent;
      const isPropertyName =
        parent &&
        ((ts.isPropertyAccessExpression(parent) && parent.name === node) ||
          (ts.isPropertyAssignment(parent) && parent.name === node) ||
          (ts.isBindingElement(parent) && parent.propertyName === node));
      const isImportBinding = parent && (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent));
      if (!isPropertyName && !isImportBinding) {
        uses.push({ name: node.text, position: node.getStart(source) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return uses;
}

/** Provider *folders* (a multi-adapter resource home: `providers/<x>/index.ts`). */
async function providerResourceFolders(): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(providersDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const folders: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const indexTs = path.join(providersDir, entry.name, "index.ts");
    try {
      await readFile(indexTs, "utf8");
      folders.push(path.join(providersDir, entry.name));
    } catch {
      // A folder without an index barrel is not a declared resource home.
    }
  }
  return folders;
}

async function checkSliceFiles(violations: Violation[]): Promise<void> {
  for (const fullPath of await collectSourceFiles(featuresDir)) {
    const rel = repositoryPath(fullPath);
    const source = ts.createSourceFile(
      fullPath,
      await readFile(fullPath, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      scriptKindFor(fullPath),
    );

    // Rule 1 — transport/DOM globals are not allowed in slice files.
    for (const use of forbiddenGlobalUses(source)) {
      violations.push({
        filePath: rel,
        lineNumber: lineOf(source, use.position),
        message: `slice file uses \`${use.name}\` — move transport behind a provider adapter reached via the port`,
      });
    }

    const isDependenciesFile = path.basename(fullPath) === "dependencies.ts";
    const importerSlice = sliceOf(fullPath);

    for (const { specifier, node } of moduleSpecifiersOf(source)) {
      if (!specifier.startsWith(".")) continue;
      const resolved = path.resolve(path.dirname(fullPath), specifier);

      // Rule 2 — only dependencies.ts may import providers/.
      if ((resolved === providersDir || resolved.startsWith(providersDir + path.sep)) && !isDependenciesFile) {
        violations.push({
          filePath: rel,
          lineNumber: lineOf(source, node.getStart(source)),
          message: `feature file imports \`${specifier}\` from providers/ — only dependencies.ts may bind a provider`,
        });
      }

      // Rule 3 — cross-slice imports must go through the sibling barrel.
      if (resolved.startsWith(featuresDir + path.sep) && importerSlice) {
        const targetSlice = sliceOf(resolved);
        if (targetSlice && targetSlice !== importerSlice) {
          const barrel = path.join(featuresDir, targetSlice);
          const isBarrelImport = resolved === barrel || resolved === path.join(barrel, "index");
          if (!isBarrelImport) {
            violations.push({
              filePath: rel,
              lineNumber: lineOf(source, node.getStart(source)),
              message: `deep import into slice \`${targetSlice}\` — import its public barrel \`features/${targetSlice}\` instead`,
            });
          }
        }
      }
    }
  }
}

async function parseSourceFile(fullPath: string): Promise<ts.SourceFile> {
  return ts.createSourceFile(
    fullPath,
    await readFile(fullPath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(fullPath),
  );
}

async function checkTransportHomes(violations: Violation[]): Promise<void> {
  const folders = await providerResourceFolders();
  if (folders.length === 0) return;

  // route -> the set of provider resource folders that fetch it.
  const routeOwners = new Map<string, Set<string>>();
  for (const folder of folders) {
    for (const fullPath of await collectSourceFiles(folder)) {
      const source = await parseSourceFile(fullPath);
      for (const route of fetchRouteLiteralsOf(source)) {
        const owners = routeOwners.get(route) ?? new Set<string>();
        owners.add(folder);
        routeOwners.set(route, owners);
      }
    }
  }
  if (routeOwners.size === 0) return;

  // Hard rule: a route may have at most ONE provider home. Two provider folders
  // fetching the same route is the drift the seam exists to prevent. We do NOT
  // fail on a plain component still fetching an owned route inline: forcing
  // every caller to migrate the instant a provider home appears would turn a
  // single-file slice PR into an app-wide flag day (see ADR 0002). Feature
  // files are separately barred from fetching at all (rule 1).
  for (const [route, owners] of routeOwners) {
    if (owners.size > 1) {
      violations.push({
        filePath: [...owners].map(repositoryPath).sort().join(", "),
        lineNumber: 0,
        message: `route '${route}' has ${owners.size} provider homes — a route may have only one transport home`,
      });
    }
  }

  // Informational (non-failing): components that still inline-fetch a
  // provider-owned route are a tracked migration backlog. Surfacing them keeps
  // the rollout visible without blocking a bounded slice PR.
  const ownedRoutes = new Set(routeOwners.keys());
  const pending = new Set<string>();
  for (const fullPath of await collectSourceFiles(webSrcDir)) {
    if (folders.some((folder) => fullPath.startsWith(folder + path.sep))) continue;
    if (fullPath.startsWith(featuresDir + path.sep)) continue;
    const source = await parseSourceFile(fullPath);
    for (const route of fetchRouteLiteralsOf(source)) {
      if (ownedRoutes.has(route)) pending.add(`${repositoryPath(fullPath)} fetch('${route}')`);
    }
  }
  if (pending.size > 0) {
    console.warn(
      `apps/web vertical-slice: ${pending.size} inline fetch(es) of a provider-owned route pending migration (not blocking):`,
    );
    for (const entry of [...pending].sort()) console.warn(`  - ${entry}`);
  }
}

export async function checkWebSliceBoundaries(): Promise<boolean> {
  const violations: Violation[] = [];
  await checkSliceFiles(violations);
  await checkTransportHomes(violations);

  if (violations.length > 0) {
    console.error("apps/web vertical-slice boundary violations found:");
    for (const violation of violations.sort((a, b) =>
      a.filePath === b.filePath ? a.lineNumber - b.lineNumber : a.filePath.localeCompare(b.filePath),
    )) {
      const at = violation.lineNumber > 0 ? `:${violation.lineNumber}` : "";
      console.error(`- ${violation.filePath}${at} ${violation.message}`);
    }
    console.error("See docs/adr/0002-frontend-vertical-slice-decomposition.md for the slice architecture.");
    return false;
  }

  console.log("apps/web vertical-slice boundary check passed.");
  return true;
}
