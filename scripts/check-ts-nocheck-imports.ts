import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const repoRoot = path.resolve(import.meta.dirname, "..");

// `// @ts-nocheck` disables *all* type checking for a file, including
// TS2307 "Cannot find module". That is convenient for large legacy modules
// mid-refactor, but it silently hides broken relative imports: a barrel move
// or file rename can leave a `@ts-nocheck` file importing a path that no
// longer resolves, and `pnpm typecheck` stays green while the module fails to
// load at runtime. (A combined-barrel integration once shipped 51 such dead
// imports across server.ts / cli.ts / start-chat-run.ts, all masked by
// @ts-nocheck.) tsc also never verifies the specifier of a *dynamic*
// `import()` even in a checked file, so those are checked here too.
//
// This guard re-establishes the one guarantee @ts-nocheck takes away: every
// relative import/export/dynamic-import specifier in a @ts-nocheck TypeScript
// source file must resolve to a real module on disk.

const skippedDirectories = new Set([
  ".git",
  ".next",
  ".od",
  ".od-data",
  ".od-e2e",
  ".tmp",
  ".turbo",
  ".vite",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "reports",
  "test-results",
  "vendor",
]);

// Files that can carry a meaningful `@ts-nocheck` (TypeScript sources).
const scannedExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);

// Every source/JS extension a bare (extensionless) or directory-index import
// may resolve to.
const moduleResolutionExtensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

// The source extensions each *emitted* JS extension can legitimately come from
// under NodeNext. This is extension-specific on purpose: `.mts` emits `.mjs`
// and `.cts` emits `.cjs`, while a same-basename `.ts` emits `.js`. So a
// `./x.mjs` import must NOT be satisfied by a sibling `x.ts` (its output is
// `x.js`, not `x.mjs`) — sharing one broad list would let that dead import
// pass, defeating the guard. Keys are checked by suffix; `.mjs`/`.cjs`/`.jsx`
// never end with `.js`, so ordering is irrelevant.
const sourceCandidatesByJsExtension: Record<string, readonly string[]> = {
  ".js": [".ts", ".tsx", ".js", ".jsx"],
  ".jsx": [".tsx", ".jsx"],
  ".mjs": [".mts", ".mjs"],
  ".cjs": [".cts", ".cjs"],
};

export type TsNocheckImportViolation = {
  filePath: string;
  lineNumber: number;
  specifier: string;
};

function scriptKindForPath(filePath: string): ts.ScriptKind {
  switch (path.extname(filePath)) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".mts":
    case ".cts":
      return ts.ScriptKind.TS;
    default:
      return ts.ScriptKind.TS;
  }
}

/**
 * True when the file opts out of type checking via a leading `@ts-nocheck`
 * pragma. Mirrors tsc: the pragma is only honored in the comment block that
 * precedes the first statement, so only leading trivia is inspected.
 */
export function hasLeadingTsNocheck(source: string): boolean {
  const sourceFile = ts.createSourceFile("probe.ts", source, ts.ScriptTarget.Latest, true);
  const firstStatement = sourceFile.statements[0];
  const leadingEnd = firstStatement ? firstStatement.getFullStart() + firstStatement.getLeadingTriviaWidth(sourceFile) : source.length;
  return /@ts-nocheck\b/.test(source.slice(0, leadingEnd));
}

/**
 * Resolve a relative import specifier the way NodeNext + this repo's TS build
 * do, returning whether a real module exists for it.
 *
 * - A JS-flavored specifier resolves only to the source extensions NodeNext
 *   emits it from: `./x.js` from `.ts`/`.tsx`/`.js`/`.jsx`, `./x.mjs` from
 *   `.mts`/`.mjs`, `./x.cjs` from `.cts`/`.cjs`, `./x.jsx` from `.tsx`/`.jsx`.
 * - An explicit `.ts`/`.tsx`/`.mts`/`.cts` or a non-code asset extension
 *   (`.json`, `.css`, ...) must exist verbatim.
 * - An extensionless specifier resolves to a source file or a directory
 *   `index.*` barrel.
 */
export function resolvesRelativeSpecifier(fromDirectory: string, specifier: string): boolean {
  const target = path.resolve(fromDirectory, specifier);

  for (const [jsExtension, candidates] of Object.entries(sourceCandidatesByJsExtension)) {
    if (specifier.endsWith(jsExtension)) {
      const base = target.slice(0, -jsExtension.length);
      return candidates.some((extension) => existsSync(base + extension));
    }
  }
  if (path.extname(specifier) !== "") {
    // Explicit .ts/.tsx/.mts/.cts source or a non-code asset (.json/.css/...).
    return existsSync(target);
  }
  // Extensionless: a source file or a directory index barrel.
  return (
    moduleResolutionExtensions.some((extension) => existsSync(target + extension)) ||
    moduleResolutionExtensions.some((extension) => existsSync(path.join(target, `index${extension}`)))
  );
}

export type RelativeSpecifierReference = {
  specifier: string;
  lineNumber: number;
};

/**
 * Collect every *relative* module specifier that TypeScript treats as a real
 * import edge: static `import`/`export … from`, `import type`, `import x =
 * require(...)`, and dynamic `import(...)`. String literals in comments or in
 * ordinary expressions are not import edges and are ignored (the AST only
 * yields the specifier positions). Source-only and side-effect free, so the
 * extraction is unit-testable without the filesystem.
 */
export function collectRelativeSpecifiers(filePath: string, source: string): RelativeSpecifierReference[] {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKindForPath(filePath));
  const found: RelativeSpecifierReference[] = [];

  const push = (node: ts.Node | undefined): void => {
    if (node != null && ts.isStringLiteralLike(node) && node.text.startsWith(".")) {
      found.push({
        specifier: node.text,
        lineNumber: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
      });
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      push(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      push(node.moduleReference.expression);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      push(node.argument.literal);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      push(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

/**
 * Collect unresolved relative imports for a single `@ts-nocheck` source file,
 * resolving specifiers against `fromDirectory`. Non-`@ts-nocheck` files return
 * no violations. `fromDirectory` defaults to the file's directory under the
 * repository root; tests pass a temp directory instead.
 */
export function collectTsNocheckImportViolationsFromSource(
  repositoryPath: string,
  source: string,
  fromDirectory: string = path.dirname(path.resolve(repoRoot, repositoryPath)),
): TsNocheckImportViolation[] {
  if (!hasLeadingTsNocheck(source)) return [];

  const violations: TsNocheckImportViolation[] = [];
  for (const { specifier, lineNumber } of collectRelativeSpecifiers(repositoryPath, source)) {
    if (resolvesRelativeSpecifier(fromDirectory, specifier)) continue;
    violations.push({ filePath: repositoryPath, lineNumber, specifier });
  }

  return violations.sort((left, right) => left.lineNumber - right.lineNumber);
}

async function collectScannedFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (skippedDirectories.has(entry.name)) continue;
      files.push(...(await collectScannedFiles(fullPath)));
    } else if (entry.isFile() && scannedExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

export async function checkTsNocheckImports(): Promise<boolean> {
  const violations: TsNocheckImportViolation[] = [];

  for (const fullPath of await collectScannedFiles(repoRoot)) {
    const source = await readFile(fullPath, "utf8");
    if (!source.includes("@ts-nocheck")) continue;
    const repositoryPath = path.relative(repoRoot, fullPath).split(path.sep).join("/");
    violations.push(...collectTsNocheckImportViolationsFromSource(repositoryPath, source));
  }

  if (violations.length > 0) {
    console.error("@ts-nocheck files with unresolved relative imports:");
    for (const violation of violations) {
      console.error(`- ${violation.filePath}:${violation.lineNumber} \`${violation.specifier}\` does not resolve to a module on disk`);
    }
    console.error(
      "@ts-nocheck suppresses TS2307, so these dead imports pass typecheck but fail at runtime. Repoint each specifier to the module's current path (usually a capability-barrel index), or remove the import.",
    );
    return false;
  }

  console.log("@ts-nocheck import check passed: every @ts-nocheck file's relative imports resolve.");
  return true;
}
