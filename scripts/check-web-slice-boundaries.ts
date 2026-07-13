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
//      through its public barrel (`features/<other>`), never a deep file. This
//      also holds from OUTSIDE `features/**`: the orchestrator (and any other
//      app file) may reach a slice only through its barrel, so the boundary the
//      slice publishes is the boundary every consumer sees. Both the relative
//      (`../features/<slice>/...`) and the `@/*` path-alias form of a deep
//      import are rejected — `apps/web/tsconfig.json` maps `@/*` onto the
//      `apps/web` root, so `@/src/features/<slice>/...` resolves to the same
//      file and must not be a boundary escape hatch.
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
const webAppDir = path.join(repoRoot, "apps", "web", "app");
const featuresDir = path.join(webSrcDir, "features");
const providersDir = path.join(webSrcDir, "providers");

// Repo-relative POSIX roots. The import-boundary rules (2 and 3) run in this
// space so they can resolve BOTH relative and `@/*`-aliased specifiers and stay
// unit-testable from a source string without touching disk.
const WEB_ROOT_REL = "apps/web";
const FEATURES_REL = "apps/web/src/features";
const PROVIDERS_REL = "apps/web/src/providers";

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

function isUnderRel(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(root + "/");
}

/**
 * The slice a repo-relative path belongs to, or null for a loose top-level
 * `features/` file or a bare barrel path (`features/<slice>`). A slice is only
 * named once the path reaches INTO it (`features/<slice>/<deeper>`), so a barrel
 * import (`features/<slice>` or `.../index`) is never flagged as a deep import.
 */
function sliceOfRel(rel: string): string | null {
  if (!isUnderRel(rel, FEATURES_REL) || rel === FEATURES_REL) return null;
  const segments = rel.slice(FEATURES_REL.length + 1).split("/");
  return segments.length > 1 ? (segments[0] ?? null) : null;
}

function isSliceBarrelImport(resolved: string, slice: string): boolean {
  const barrel = `${FEATURES_REL}/${slice}`;
  return resolved === barrel || resolved === `${barrel}/index`;
}

/**
 * Resolve a module specifier to a repo-relative POSIX path under `apps/web`, or
 * null for a bare package import that never touches the slice boundary. Handles
 * the relative form and the `@/*` path alias from `apps/web/tsconfig.json`
 * (rooted at `apps/web`), so an aliased deep import is checked exactly like its
 * relative twin instead of slipping past as a non-relative specifier.
 */
export function resolveWebImport(importerRepoPath: string, specifier: string): string | null {
  const pathOnly = specifier.split(/[?#]/, 1)[0];
  if (!pathOnly) return null;
  // Normalize like path.resolve did: strip any trailing slash so a barrel import
  // written `../features/<slice>/` still matches its barrel path.
  const strip = (p: string): string => p.replace(/\/+$/, "") || "/";
  if (pathOnly.startsWith("@/")) {
    return strip(path.posix.normalize(path.posix.join(WEB_ROOT_REL, pathOnly.slice("@/".length))));
  }
  if (pathOnly.startsWith(".")) {
    return strip(path.posix.normalize(path.posix.join(path.posix.dirname(importerRepoPath), pathOnly)));
  }
  return null;
}

/**
 * All per-file import-boundary violations (rules 1–3) for a single web source
 * file, given its repo-relative POSIX path and its text. Pure and disk-free so
 * the guard is unit-testable; the disk walkers below just feed it every file.
 * Whether the importer lives inside `features/**` decides which rules apply:
 * feature files get the transport-free + provider-binding + cross-slice rules,
 * everything else gets the outside-in barrel rule.
 */
export function collectImportBoundaryViolations(
  importerRepoPath: string,
  sourceText: string,
): Violation[] {
  const violations: Violation[] = [];
  const source = ts.createSourceFile(
    importerRepoPath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(importerRepoPath),
  );

  const isFeatureFile = isUnderRel(importerRepoPath, FEATURES_REL) && importerRepoPath !== FEATURES_REL;
  const importerSlice = isFeatureFile ? sliceOfRel(importerRepoPath) : null;
  const isDependenciesFile = path.posix.basename(importerRepoPath) === "dependencies.ts";

  // Rule 1 — transport/DOM globals are not allowed in slice files.
  if (isFeatureFile) {
    for (const use of forbiddenGlobalUses(source)) {
      violations.push({
        filePath: importerRepoPath,
        lineNumber: lineOf(source, use.position),
        message: `slice file uses \`${use.name}\` — move transport behind a provider adapter reached via the port`,
      });
    }
  }

  for (const { specifier, node } of moduleSpecifiersOf(source)) {
    const resolved = resolveWebImport(importerRepoPath, specifier);
    if (!resolved) continue;
    const lineNumber = lineOf(source, node.getStart(source));

    if (isFeatureFile) {
      // Rule 2 — only dependencies.ts may import providers/.
      if (isUnderRel(resolved, PROVIDERS_REL) && !isDependenciesFile) {
        violations.push({
          filePath: importerRepoPath,
          lineNumber,
          message: `feature file imports \`${specifier}\` from providers/ — only dependencies.ts may bind a provider`,
        });
      }

      // Rule 3 (in-slice) — cross-slice imports must go through the sibling barrel.
      if (importerSlice) {
        const targetSlice = sliceOfRel(resolved);
        if (targetSlice && targetSlice !== importerSlice && !isSliceBarrelImport(resolved, targetSlice)) {
          violations.push({
            filePath: importerRepoPath,
            lineNumber,
            message: `deep import into slice \`${targetSlice}\` — import its public barrel \`features/${targetSlice}\` instead`,
          });
        }
      }
      continue;
    }

    // Rule 3 (outside-in) — a file outside features/ may reach a slice only
    // through its public barrel, so the boundary the slice publishes is the
    // boundary every consumer sees.
    const targetSlice = sliceOfRel(resolved);
    if (targetSlice && !isSliceBarrelImport(resolved, targetSlice)) {
      violations.push({
        filePath: importerRepoPath,
        lineNumber,
        message: `deep import into slice \`${targetSlice}\` from outside features/ — import its public barrel \`features/${targetSlice}\` instead`,
      });
    }
  }

  return violations;
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

// Rules 1–3 for every migrated slice file (transport-free, provider-binding,
// and cross-slice barrel), delegated to the pure per-file collector.
async function checkSliceFiles(violations: Violation[]): Promise<void> {
  for (const fullPath of await collectSourceFiles(featuresDir)) {
    violations.push(...collectImportBoundaryViolations(repositoryPath(fullPath), await readFile(fullPath, "utf8")));
  }
}

// Rule 3 (outside-in half): a file outside `features/**` may import a slice only
// through its public barrel. Without this, the orchestrator could deep-import
// slice internals and keep the canary coupled while checkSliceFiles — which only
// walks featuresDir — reports success. The same collector resolves `@/*` aliases
// too, so `@/src/features/<slice>/...` is not a boundary escape hatch.
async function checkExternalSliceImports(violations: Violation[]): Promise<void> {
  // `app/` contains live Next.js entrypoints alongside the shared `src/`
  // runtime. Both are consumers outside a slice and therefore must use its
  // public barrel; scanning only src/ would leave app-route deep imports as an
  // escape hatch.
  for (const root of [webSrcDir, webAppDir]) {
    for (const fullPath of await collectSourceFiles(root)) {
      if (fullPath === featuresDir || fullPath.startsWith(featuresDir + path.sep)) continue;
      violations.push(...collectImportBoundaryViolations(repositoryPath(fullPath), await readFile(fullPath, "utf8")));
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
  await checkExternalSliceImports(violations);
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
