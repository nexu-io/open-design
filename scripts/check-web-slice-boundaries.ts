import { readFile, readdir, realpath, stat } from "node:fs/promises";
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
//      `window`, or `document`, whether reached as a bare identifier or
//      qualified through `globalThis.<name>` or `globalThis["name"]`.
//      Transport lives behind a
//      provider + port.
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
//      file and must not be a boundary escape hatch. This applies equally to a
//      static `import ... from`, a dynamic `import("...")` call, and an
//      `import("...").Type` type-only reference — all three resolve to the
//      same file.
//   4. One transport home per route: a route fetched inside a provider
//      resource home — either a multi-adapter folder (`providers/<resource>/`)
//      or a flat single-file provider (`providers/<resource>.ts`) — must not
//      also be owned by a second provider home of either shape. An
//      interpolated route template (`` `/api/memory/${id}` ``) is normalized
//      to its route family (`/api/memory/*`) before comparison, so two
//      provider homes templating the same route family are recognized as
//      owning the same route. A plain component still fetching that route
//      inline is a tracked backlog (reported, not failed) — forcing every
//      caller to migrate the instant a provider home appears would turn a
//      bounded single-file slice PR into an app-wide flag day.
//
// The guard is intentionally scoped to migrated surfaces: it only inspects
// `features/**` for rules 1–3. Rule 4 also inspects every provider resource
// home (folder or flat file) directly under `providers/`, since a new slice's
// provider folder can silently duplicate a route a pre-existing flat provider
// already owns.

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

// `allowJs` is enabled by apps/web/tsconfig.json, and TypeScript accepts the
// Node module suffixes too. Every source extension it can include must be
// scanned; otherwise changing a feature or provider's suffix becomes a bypass.
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);

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
  if (fileName.endsWith(".tsx") || fileName.endsWith(".jsx")) return ts.ScriptKind.TSX;
  return /\.(?:js|mjs|cjs)$/.test(fileName) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

function lineOf(source: ts.SourceFile, position: number): number {
  return source.getLineAndCharacterOfPosition(position).line + 1;
}

async function collectSourceFiles(directory: string, ancestorDirectories = new Set<string>()): Promise<string[]> {
  // readdir's Dirent methods do not follow symlinks. A symlinked feature file
  // or directory still participates in the module graph at its lexical path,
  // so follow it while tracking real ancestor directories to avoid cycles.
  const realDirectory = await realpath(directory).catch(() => directory);
  if (ancestorDirectories.has(realDirectory)) return [];
  const nextAncestors = new Set(ancestorDirectories).add(realDirectory);
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
      files.push(...(await collectSourceFiles(fullPath, nextAncestors)));
      continue;
    }
    if (entry.isSymbolicLink()) {
      const target = await stat(fullPath).catch(() => null);
      if (target?.isDirectory()) {
        files.push(...(await collectSourceFiles(fullPath, nextAncestors)));
      } else if (target?.isFile() && sourceExtensions.has(path.extname(entry.name))) {
        files.push(fullPath);
      }
      continue;
    }
    if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function isUnderRel(candidate: string, root: string): boolean {
  const normalizedCandidate = candidate.toLowerCase();
  const normalizedRoot = root.toLowerCase();
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(normalizedRoot + "/");
}

function isSameRelPath(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
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
  return segments.length > 1 ? (segments[0]?.toLowerCase() ?? null) : null;
}

function isSliceBarrelImport(resolved: string, slice: string): boolean {
  const barrel = `${FEATURES_REL}/${slice}`;
  return isSameRelPath(resolved, barrel) || isSameRelPath(resolved, `${barrel}/index`);
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
 * feature files get the transport-free + provider-binding rules, files inside
 * a named slice get the cross-slice rule, and everything without a slice of
 * its own — including a loose top-level `features/*.ts` file — gets the
 * outside-in barrel rule.
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
  // The provider-binding exception is for a slice's root binder only. A
  // nested `components/dependencies.ts` (or a loose features/dependencies.ts)
  // is not that binder and must not become an alternate transport home.
  const isDependenciesFile =
    importerSlice !== null && isSameRelPath(importerRepoPath, `${FEATURES_REL}/${importerSlice}/dependencies.ts`);

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
    }

    const targetSlice = sliceOfRel(resolved);
    if (importerSlice) {
      // Rule 3 (in-slice) — cross-slice imports must go through the sibling barrel.
      if (targetSlice && targetSlice !== importerSlice && !isSliceBarrelImport(resolved, targetSlice)) {
        violations.push({
          filePath: importerRepoPath,
          lineNumber,
          message: `deep import into slice \`${targetSlice}\` — import its public barrel \`features/${targetSlice}\` instead`,
        });
      }
    } else if (targetSlice && !isSliceBarrelImport(resolved, targetSlice)) {
      // Rule 3 (outside-in) — any consumer with no slice of its own may reach
      // a slice only through its public barrel, so the boundary the slice
      // publishes is the boundary every consumer sees. That covers files
      // outside features/ AND loose top-level `features/*.ts` files, which are
      // feature files but belong to no slice (`sliceOfRel` is null for them);
      // exempting those would leave a slice-less spot inside features/ from
      // which every slice's internals are reachable.
      violations.push({
        filePath: importerRepoPath,
        lineNumber,
        message: `deep import into slice \`${targetSlice}\` from outside features/ — import its public barrel \`features/${targetSlice}\` instead`,
      });
    }
  }

  return violations;
}

/**
 * Every module specifier a file resolves to at build/runtime: static
 * `import`/`export ... from "..."` declarations, CommonJS/TypeScript require
 * forms, dynamic `import("...")` calls, and `import("...").Type` type-only
 * references. A slice boundary enforced only against one syntactic form is
 * not enforced — every form resolves to the same file and must be checked
 * identically.
 */
function moduleSpecifiersOf(source: ts.SourceFile): Array<{ specifier: string; node: ts.Node }> {
  const specifiers: Array<{ specifier: string; node: ts.Node }> = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push({ specifier: node.moduleSpecifier.text, node });
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      specifiers.push({ specifier: node.moduleReference.expression.text, node });
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push({ specifier: (node.arguments[0] as ts.StringLiteralLike).text, node });
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      specifiers.push({ specifier: node.argument.literal.text, node });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

/**
 * Collapse an interpolated route template (`` `/api/memory/${id}` ``) into a
 * family key (`/api/memory/*`) so two provider folders templating the same
 * route family are recognized as sharing one route, not as two unrelated
 * literals. Every interpolated span collapses to the same `*` placeholder —
 * the guard only needs to know the route SHAPE collides, not the values.
 */
function templateRouteFamily(template: ts.TemplateExpression): string {
  let route = template.head.text;
  for (const span of template.templateSpans) {
    route += "*" + span.literal.text;
  }
  return route;
}

/**
 * First-argument route (or route family) of `fetch(...)` calls in a source
 * file. A plain string/no-substitution-template literal is used as-is; a
 * template WITH interpolation (`` `/api/memory/${id}` ``) is normalized to
 * its route family so it registers ownership the same way a same-shaped
 * literal would.
 */
function fetchRouteLiteralsOf(source: ts.SourceFile): string[] {
  const routes: string[] = [];
  const visit = (node: ts.Node): void => {
    const firstArg = ts.isCallExpression(node) ? node.arguments[0] : undefined;
    if (
      ts.isCallExpression(node) &&
      isGlobalFetchExpression(node.expression) &&
      firstArg
    ) {
      const route = routeLiteralOf(firstArg);
      if (route !== null) routes.push(route);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return routes;
}

/** Literal routes remain literal when parenthesized or narrowed with TS syntax. */
function routeLiteralOf(expression: ts.Expression): string | null {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  if (ts.isStringLiteralLike(current)) return current.text;
  return ts.isTemplateExpression(current) ? templateRouteFamily(current) : null;
}

/** Direct `fetch` and its `globalThis.fetch` / `globalThis["fetch"]` twins. */
function isGlobalFetchExpression(expression: ts.Expression): boolean {
  return (
    (ts.isIdentifier(expression) && expression.text === "fetch") || globalThisPropertyName(expression) === "fetch"
  );
}

/** The statically named member read directly from globalThis, if any. */
function globalThisPropertyName(node: ts.Node): string | null {
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "globalThis") {
    return node.name.text;
  }
  if (
    ts.isElementAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "globalThis" &&
    node.argumentExpression &&
    ts.isStringLiteralLike(node.argumentExpression)
  ) {
    return node.argumentExpression.text;
  }
  return null;
}

/**
 * Bare-identifier uses of a forbidden global (not a property name / import),
 * plus the qualified `globalThis.<forbidden>` and `globalThis["forbidden"]`
 * forms. A bare `fetch` and either globalThis form reach the exact same
 * transport; scoping the check to unqualified identifiers alone would leave
 * an unchecked alias for every forbidden global.
 */
function forbiddenGlobalUses(source: ts.SourceFile): Array<{ name: string; position: number }> {
  const uses: Array<{ name: string; position: number }> = [];
  const visit = (node: ts.Node): void => {
    const globalThisProperty = globalThisPropertyName(node);
    if (globalThisProperty && forbiddenSliceGlobals.has(globalThisProperty)) {
      uses.push({ name: globalThisProperty, position: node.getStart(source) });
      return;
    }
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

/**
 * Route (or route family) of every `fetch(...)` call in a source string.
 * Exported alongside `collectImportBoundaryViolations` so the route-family
 * normalization is unit-testable without touching disk.
 */
export function fetchedRoutesOf(sourceText: string, fileName = "test.ts"): string[] {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, scriptKindFor(fileName));
  return fetchRouteLiteralsOf(source);
}

interface ProviderHome {
  /** The folder (multi-adapter) or file (flat) path identifying this home. */
  path: string;
  /** Every source file that belongs to this home. */
  files: string[];
}

/**
 * Every provider resource home directly under `providers/`: a multi-adapter
 * folder (`providers/<x>/index.ts`) or a flat single-file provider
 * (`providers/<x>.ts`). Both shapes are declared resource homes and are
 * compared against each other for route ownership (rule 4) — a flat file
 * like `registry.ts` owns its fetched routes exactly like a provider folder
 * does.
 */
async function providerResourceHomes(): Promise<ProviderHome[]> {
  let entries;
  try {
    entries = await readdir(providersDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const homes: ProviderHome[] = [];
  for (const entry of entries) {
    const fullPath = path.join(providersDir, entry.name);
    if (entry.isDirectory()) {
      const indexTs = path.join(fullPath, "index.ts");
      try {
        await readFile(indexTs, "utf8");
      } catch {
        continue; // A folder without an index barrel is not a declared resource home.
      }
      homes.push({ path: fullPath, files: await collectSourceFiles(fullPath) });
      continue;
    }
    if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      homes.push({ path: fullPath, files: [fullPath] });
    }
  }
  return homes;
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
  const homes = await providerResourceHomes();
  if (homes.length === 0) return;

  // route -> the set of provider resource homes that fetch it.
  const routeOwners = new Map<string, Set<string>>();
  for (const home of homes) {
    for (const fullPath of home.files) {
      const source = await parseSourceFile(fullPath);
      for (const route of fetchRouteLiteralsOf(source)) {
        const owners = routeOwners.get(route) ?? new Set<string>();
        owners.add(home.path);
        routeOwners.set(route, owners);
      }
    }
  }
  if (routeOwners.size === 0) return;

  // Hard rule: a route may have at most ONE provider home. Two provider homes
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
    if (homes.some((home) => fullPath === home.path || fullPath.startsWith(home.path + path.sep))) continue;
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
