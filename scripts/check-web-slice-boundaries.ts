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
//      `window`, or `document`, whether reached as a bare identifier,
//      qualified through `globalThis.<name>` / `globalThis["name"]` (or the
//      `self.<name>` / `self["name"]` worker-safe alias), or extracted by
//      destructuring one of those two global objects (`const { fetch } =
//      globalThis`, including a renamed binding: `const { fetch: doFetch } =
//      self`). Transport lives behind a provider + port.
//   2. Only a slice's `dependencies.ts` may import from `providers/`. Every
//      other feature file depends on the port, not the adapter.
//   3. No cross-slice deep imports: a slice may import another slice only
//      through its public barrel (`features/<other>`), never a deep file. This
//      also holds from OUTSIDE `features/**`: the orchestrator (and any other
//      app file) may reach a slice only through its barrel, so the boundary the
//      slice publishes is the boundary every consumer sees. A specifier is
//      resolved the way the real TypeScript compiler would resolve it — the
//      relative (`../features/<slice>/...`) and `@/*` path-alias
//      (`apps/web/tsconfig.json` maps `@/*` onto the `apps/web` root) forms are
//      matched directly, and any other specifier falls through to
//      `ts.resolveModuleName` against the actual parsed `apps/web/tsconfig.json`
//      — so a future tsconfig `paths` entry, `baseUrl`-relative specifier, or
//      `package.json` `imports` subpath field resolving INTO this repo is still
//      caught, instead of silently passing as an assumed-harmless bare package.
//      This applies equally to a static `import ... from`, a dynamic
//      `import("...")` call, and an `import("...").Type` type-only reference —
//      all three resolve to the same file.
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
//
// Scope statement: this is a best-effort static-analysis guard, not an
// adversarial security boundary. It is built to catch the common, accidental
// ways a normal PR can violate the slice architecture — a forgotten port, a
// stray deep import, a duplicated `fetch` — and has been hardened over several
// review rounds against real (non-adversarial) bypasses: path aliases,
// dynamic imports, `require`/`import =`, `globalThis`/`self` bracket access
// and destructuring, template routes, flat vs. folder provider homes, JS/JSX/
// symlinked files. Rules 2-3's specifier resolution is delegated to
// TypeScript's own `ts.resolveModuleName` (see `resolveWebImport` below)
// rather than a hand-matched syntax list, specifically so a future resolver
// config change doesn't quietly reopen the fail-open gap that motivated this
// rewrite — but the semantic RULES on top of that resolution (which slice
// owns a path, which files may hold a `dependencies.ts` exception, etc.) are
// still this file's own bespoke logic and can still have gaps. It is NOT
// designed to withstand a deliberately obfuscated bypass (e.g. an import
// specifier assembled at runtime from string fragments, reflection, or
// tooling outside this repo's TS/JS build). Finding a new theoretical gap is
// useful as a follow-up to extend this file; it is not, on its own, a
// blocking finding against a PR that isn't the one introducing or exploiting
// that specific gap.

const repoRoot = path.resolve(import.meta.dirname, "..");
const webRootDir = path.join(repoRoot, "apps", "web");
const webSrcDir = path.join(webRootDir, "src");
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

/** Parse `apps/web/tsconfig.json`, resolving `extends`, `include`, and
 *  `exclude` the same way the real compiler would. Always fresh (not
 *  memoized) — callers that run once per guard invocation (like the rule-3
 *  outside-in file enumeration) should call this directly so they reflect
 *  the current filesystem; `webTsConfig()` below memoizes it for the
 *  per-specifier resolver hot path instead. */
function parseWebTsConfig(): ts.ParsedCommandLine {
  const tsconfigPath = path.join(webRootDir, "tsconfig.json");
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(
      `check-web-slice-boundaries: failed to read ${tsconfigPath}: ` +
        ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"),
    );
  }
  return ts.parseJsonConfigFileContent(configFile.config, ts.sys, webRootDir);
}

let cachedWebTsConfig: ts.ParsedCommandLine | null = null;

/** Memoized `parseWebTsConfig()` so `resolveViaTypeScript` stays a cheap
 *  per-specifier call rather than re-reading and re-parsing config on every
 *  resolution — it's called once per specifier, potentially many times per
 *  guard run, unlike the once-per-run file enumeration above. */
function webTsConfig(): ts.ParsedCommandLine {
  if (cachedWebTsConfig) return cachedWebTsConfig;
  cachedWebTsConfig = parseWebTsConfig();
  return cachedWebTsConfig;
}

const realModuleResolutionHost: ts.ModuleResolutionHost = {
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  directoryExists: ts.sys.directoryExists,
  getCurrentDirectory: () => webRootDir,
  getDirectories: ts.sys.getDirectories,
  // `exactOptionalPropertyTypes` rejects assigning `ts.sys.realpath`
  // directly (its type is `(...) => string | undefined`); only include the
  // key when a real implementation exists, matching the interface's own
  // optional-property contract instead of forcing an `undefined` value in.
  ...(ts.sys.realpath ? { realpath: ts.sys.realpath } : {}),
};

/**
 * Resolve a specifier neither of `resolveWebImport`'s two hand-matched forms
 * (relative, `@/*`) covers, via TypeScript's own `ts.resolveModuleName`
 * against the real parsed `apps/web/tsconfig.json` — so a future tsconfig
 * `paths` entry, `baseUrl`-relative specifier, or `package.json` `imports`
 * subpath field resolving into this repo is still caught, instead of falling
 * through as an assumed-harmless bare package (the fail-open gap this
 * function replaces). Returns the repo-relative POSIX path (extension and any
 * trailing `/index` stripped) when the specifier resolves to a file inside
 * `apps/web`, or null when it resolves into `node_modules` (a genuine
 * external package) or doesn't resolve at all. `host` and `compilerOptions`
 * are both injectable — defaulting to the real filesystem and the real
 * parsed tsconfig — so a test can prove a HYPOTHETICAL future config change
 * (a `paths` entry this repo doesn't have yet) is caught, without mutating
 * the real `apps/web/tsconfig.json` or touching real disk.
 */
export function resolveViaTypeScript(
  importerRepoPath: string,
  specifier: string,
  host: ts.ModuleResolutionHost = realModuleResolutionHost,
  compilerOptions: ts.CompilerOptions = webTsConfig().options,
): string | null {
  const importerFullPath = path.join(repoRoot, importerRepoPath);
  const result = ts.resolveModuleName(specifier, importerFullPath, compilerOptions, host);
  const resolvedFileName = result.resolvedModule?.resolvedFileName;
  if (!resolvedFileName) return null;
  const normalized = resolvedFileName.split(path.sep).join("/");
  // Case-insensitive to match this file's own convention elsewhere
  // (`isUnderRel`/`isSameRelPath`) — on a case-insensitive filesystem or an
  // unusually-cased checkout, a case-sensitive check here could let an
  // external dependency be misclassified as an internal web path.
  if (normalized.toLowerCase().includes("/node_modules/")) return null;
  const rel = repositoryPath(resolvedFileName.split(path.sep).join(path.sep));
  if (!isUnderRel(rel, WEB_ROOT_REL)) return null;
  return rel.replace(/\.[cm]?[tj]sx?$/, "").replace(/\/index$/, "");
}

/**
 * Resolve a module specifier to a repo-relative POSIX path under `apps/web`, or
 * null for a bare package import that never touches the slice boundary. The
 * relative form is matched directly, string-only — plain relative path-joining
 * never drifts with tsconfig, so it stays pure and disk-free. Every OTHER
 * specifier (including `@/*`) is resolved through `resolveViaTypeScript`
 * FIRST, against the real configured mapping: hand-mapping `@/* -> apps/web`
 * here as the primary path would silently keep using that assumption even
 * after `apps/web/tsconfig.json`'s `@/*` entry is repointed (e.g. to `src/*`
 * instead of `./*`), which is exactly the config-drift false-negative this
 * rewrite exists to close. The hand-mapped `@/*` join is kept ONLY as a
 * fallback for when real resolution fails outright — e.g. a specifier whose
 * casing doesn't match the real file on a case-sensitive filesystem, which a
 * real resolver correctly refuses to resolve, but which must still be caught
 * as an escape attempt rather than silently dropped.
 */
export function resolveWebImport(importerRepoPath: string, specifier: string): string | null {
  const pathOnly = specifier.split(/[?#]/, 1)[0];
  if (!pathOnly) return null;
  // Normalize like path.resolve did: strip any trailing slash so a barrel import
  // written `../features/<slice>/` still matches its barrel path.
  const strip = (p: string): string => p.replace(/\/+$/, "") || "/";
  if (pathOnly.startsWith(".")) {
    return strip(path.posix.normalize(path.posix.join(path.posix.dirname(importerRepoPath), pathOnly)));
  }
  const viaCompiler = resolveViaTypeScript(importerRepoPath, pathOnly);
  if (viaCompiler) return viaCompiler;
  if (pathOnly.startsWith("@/")) {
    return strip(path.posix.normalize(path.posix.join(WEB_ROOT_REL, pathOnly.slice("@/".length))));
  }
  return null;
}

/**
 * All per-file import-boundary violations (rules 1–3) for a single web source
 * file, given its repo-relative POSIX path and its text. Pure and disk-free
 * for every relative and `@/*`-aliased specifier (the common case, and what
 * every existing unit test below exercises); a specifier that resolves via
 * `resolveViaTypeScript`'s fallback reads the real `apps/web` filesystem and
 * tsconfig instead. The disk walkers below just feed this every file.
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

/**
 * Unwrap parenthesization and the TS-only wrapper expressions (`as`, an
 * angle-bracket type assertion, non-null `!`, `satisfies`) that don't change
 * an expression's runtime value — shared by every check below that needs to
 * recognize a literal or identifier regardless of how it's wrapped, so a
 * harmless-looking wrapper (`(globalThis)`, `x as typeof x`, `["fetch"]`'s
 * inner literal written as `("fetch")`) can't hide what's underneath.
 */
function unwrapExpression(expression: ts.Expression): ts.Expression {
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
  return current;
}

/** Literal routes remain literal when parenthesized or narrowed with TS syntax. */
function routeLiteralOf(expression: ts.Expression): string | null {
  const current = unwrapExpression(expression);
  if (ts.isStringLiteralLike(current)) return current.text;
  return ts.isTemplateExpression(current) ? templateRouteFamily(current) : null;
}

// `self` is the worker-safe alias for `globalThis` (and, in a browser window,
// for `window` itself) — `self.fetch(...)` / `self["fetch"]` reach the exact
// same transport as `globalThis.fetch(...)`, so both object names are checked
// identically everywhere below.
const globalObjectAliases = new Set(["globalThis", "self"]);

/** Direct `fetch` and its `globalThis.fetch` / `self["fetch"]` twins. */
function isGlobalFetchExpression(expression: ts.Expression): boolean {
  return (
    (ts.isIdentifier(expression) && expression.text === "fetch") || globalObjectPropertyName(expression) === "fetch"
  );
}

/** The statically named member read directly from `globalThis` or `self`, if any
 *  — through a wrapper like `(globalThis).fetch` or `self[("fetch")]` too. */
function globalObjectPropertyName(node: ts.Node): string | null {
  if (ts.isPropertyAccessExpression(node)) {
    const target = unwrapExpression(node.expression);
    if (ts.isIdentifier(target) && globalObjectAliases.has(target.text)) {
      return node.name.text;
    }
  }
  if (ts.isElementAccessExpression(node)) {
    const target = unwrapExpression(node.expression);
    if (ts.isIdentifier(target) && globalObjectAliases.has(target.text) && node.argumentExpression) {
      const key = unwrapExpression(node.argumentExpression);
      if (ts.isStringLiteralLike(key)) return key.text;
    }
  }
  return null;
}

/**
 * True when a `{ propertyName }` (or `{ propertyName: renamed }`) binding
 * element destructures directly from `globalThis` or `self` — e.g.
 * `const { fetch } = globalThis`, `const { fetch: doFetch } = self`, or a
 * parameter default `function f({ fetch: doFetch } = self) {}`. This
 * extracts the forbidden global exactly as effectively as a direct property
 * read; a rename doesn't change what was extracted, only the local name it's
 * called by afterward, and a parameter default is just as reachable a source
 * as a variable initializer.
 */
function isDestructuredFromGlobalObject(bindingElement: ts.BindingElement): boolean {
  const pattern = bindingElement.parent;
  if (!ts.isObjectBindingPattern(pattern)) return false;
  const owner = pattern.parent;
  const initializer =
    ts.isVariableDeclaration(owner) || ts.isParameter(owner) ? owner.initializer : undefined;
  if (!initializer) return false;
  const source = unwrapExpression(initializer);
  return ts.isIdentifier(source) && globalObjectAliases.has(source.text);
}

/**
 * The statically-determinable string key a binding element's `propertyName`
 * names, for the forms that are NOT a plain `Identifier` — `{"fetch": x}`
 * (a direct string-literal key) and `{["fetch"]: x}` (a `ComputedPropertyName`
 * wrapping a string-literal expression). These never surface as an
 * `Identifier` node, so `forbiddenGlobalUses`'s generic identifier scan below
 * never visits them; this is a dedicated, non-overlapping check for them.
 */
function bindingElementLiteralPropertyName(bindingElement: ts.BindingElement): string | null {
  const propertyName = bindingElement.propertyName;
  if (!propertyName) return null;
  if (ts.isStringLiteralLike(propertyName)) return propertyName.text;
  if (ts.isComputedPropertyName(propertyName)) {
    const key = unwrapExpression(propertyName.expression);
    if (ts.isStringLiteralLike(key)) return key.text;
  }
  return null;
}

/**
 * True when an object literal is itself an ASSIGNMENT-destructuring target —
 * `({ fetch: request } = globalThis)` — whose right-hand side unwraps to
 * `globalThis` or `self`. This is a different AST shape from a binding
 * pattern (`const { ... } = ...`): the same syntax reused as an assignment
 * expression's left side instead of a declaration, but it extracts a
 * forbidden global exactly as effectively.
 */
function isAssignmentDestructuredFromGlobalObject(objectLiteral: ts.ObjectLiteralExpression): boolean {
  const parent = objectLiteral.parent;
  if (!ts.isBinaryExpression(parent)) return false;
  if (parent.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return false;
  if (parent.left !== objectLiteral) return false;
  const source = unwrapExpression(parent.right);
  return ts.isIdentifier(source) && globalObjectAliases.has(source.text);
}

/**
 * The statically-determinable string key an assignment-pattern object
 * literal's property names — the `{ fetch: request }`-inside-an-assignment
 * counterpart of `bindingElementLiteralPropertyName`, for the non-Identifier
 * key forms (`{"fetch": x}`, `{["fetch"]: x}`) that never surface as an
 * `Identifier` node.
 */
function assignmentPropertyLiteralKeyName(property: ts.ObjectLiteralElementLike): string | null {
  if (!ts.isPropertyAssignment(property)) return null;
  const name = property.name;
  if (ts.isStringLiteralLike(name)) return name.text;
  if (ts.isComputedPropertyName(name)) {
    const key = unwrapExpression(name.expression);
    if (ts.isStringLiteralLike(key)) return key.text;
  }
  return null;
}

/**
 * Bare-identifier uses of a forbidden global (not an unrelated property name
 * or import binding), plus the qualified `globalThis.<forbidden>` /
 * `self["forbidden"]` forms, plus destructuring one out of `globalThis` or
 * `self` — as a plain or renamed identifier key, a string-literal key, or a
 * computed string-literal key, from a variable initializer, a parameter
 * default, OR a plain assignment-expression destructure. A bare `fetch`,
 * either global-object form, and any of these destructured-extraction forms
 * all reach the exact same transport; scoping the check to unqualified
 * identifiers alone would leave an unchecked alias for every forbidden global.
 */
function forbiddenGlobalUses(source: ts.SourceFile): Array<{ name: string; position: number }> {
  const uses: Array<{ name: string; position: number }> = [];
  const visit = (node: ts.Node): void => {
    const globalObjectProperty = globalObjectPropertyName(node);
    if (globalObjectProperty && forbiddenSliceGlobals.has(globalObjectProperty)) {
      uses.push({ name: globalObjectProperty, position: node.getStart(source) });
      return;
    }
    if (ts.isBindingElement(node)) {
      const literalName = bindingElementLiteralPropertyName(node);
      if (literalName && forbiddenSliceGlobals.has(literalName) && isDestructuredFromGlobalObject(node)) {
        uses.push({ name: literalName, position: node.getStart(source) });
      }
    }
    if (ts.isObjectLiteralExpression(node) && isAssignmentDestructuredFromGlobalObject(node)) {
      for (const property of node.properties) {
        const literalName = assignmentPropertyLiteralKeyName(property);
        if (literalName && forbiddenSliceGlobals.has(literalName)) {
          uses.push({ name: literalName, position: property.getStart(source) });
        }
      }
    }
    if (ts.isIdentifier(node) && forbiddenSliceGlobals.has(node.text)) {
      const parent = node.parent;
      const isDestructuredFromGlobal =
        !!parent &&
        ((ts.isBindingElement(parent) && parent.propertyName === node && isDestructuredFromGlobalObject(parent)) ||
          (ts.isPropertyAssignment(parent) &&
            parent.name === node &&
            ts.isObjectLiteralExpression(parent.parent) &&
            isAssignmentDestructuredFromGlobalObject(parent.parent)));
      const isPropertyName =
        !isDestructuredFromGlobal &&
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
 * folder (`providers/<x>/index.<ext>`, any supported source extension) or a
 * flat single-file provider (`providers/<x>.ts`). Both shapes are declared
 * resource homes and are compared against each other for route ownership
 * (rule 4) — a flat file like `registry.ts` owns its fetched routes exactly
 * like a provider folder does.
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
      // `sourceExtensions` covers every source shape this guard scans
      // (.ts/.tsx/.js/.jsx/.mts/.cts/.mjs/.cjs) — the folder-root check must
      // match, or a JS/MJS-backed provider folder (`index.js`, `index.mjs`)
      // silently fails to register as a declared resource home even though
      // its own files are otherwise fully scanned by rule 4.
      let hasIndex = false;
      for (const ext of sourceExtensions) {
        try {
          await readFile(path.join(fullPath, `index${ext}`), "utf8");
          hasIndex = true;
          break;
        } catch {
          // Try the next supported extension.
        }
      }
      if (!hasIndex) continue; // A folder without an index barrel is not a declared resource home.
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
  // The concrete file set is the real compiler-resolved list — parsed FRESH
  // here via `parseWebTsConfig()` (not the memoized `webTsConfig()` the
  // per-specifier resolver uses), so it reflects the current filesystem on
  // every guard run. This correctly handles every way a file can be
  // "included": explicit standalone entries (`next.config.ts`), glob
  // patterns (`app/**/*`, `sidecar/**/*`), and `extends` semantics — an
  // approximation from each include pattern's leading path segment would
  // miss standalone file entries and mis-resolve an inherited config.
  const testsDir = path.join(webRootDir, "tests") + path.sep;
  for (const fullPath of parseWebTsConfig().fileNames) {
    if (!sourceExtensions.has(path.extname(fullPath))) continue;
    if (fullPath === featuresDir || fullPath.startsWith(featuresDir + path.sep)) continue;
    // Unit tests intentionally reach into a slice's internals directly to
    // test them in isolation (this repo's convention: AGENTS.md keeps tests
    // in a sibling `tests/` directory, not colocated) — that is not the
    // outside-in barrel escape rule 3 exists to catch, which is about
    // PRODUCTION consumers coupling to slice internals.
    if (fullPath.startsWith(testsDir)) continue;
    let text: string;
    try {
      text = await readFile(fullPath, "utf8");
    } catch {
      continue; // A config-listed file that vanished mid-scan isn't this guard's concern.
    }
    violations.push(...collectImportBoundaryViolations(repositoryPath(fullPath), text));
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
