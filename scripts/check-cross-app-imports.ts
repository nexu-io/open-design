import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const repoRoot = path.resolve(import.meta.dirname, "..");

// Apps integrate through HTTP APIs, `packages/contracts`, and app-local
// provider boundaries. Reaching into another app's directory (src/, tests/,
// or even dist/) couples two runtimes through private implementation and is
// a repository boundary violation; `apps/web/**` importing
// `apps/daemon/src/**` is the canonical example.
const crossAppImportSkippedDirectories = new Set([
  ".next",
  ".od-data",
  "dist",
  "node_modules",
  "out",
  "reports",
  "test-results",
]);

const crossAppImportSourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);

export type AppDirectoryRegistry = {
  // app directory name under apps/ (e.g. "daemon") -> package name (e.g. "@open-design/daemon")
  packageNameByDirectory: Map<string, string>;
};

export type CrossAppImportViolation = {
  filePath: string;
  lineNumber: number;
  specifier: string;
  targetApp: string;
  reason: string;
};

type CrossAppImportAllowlistEntry = {
  pathPattern: RegExp;
  specifierPattern: RegExp;
  reason: string;
};

// Only deliberate, documented exceptions belong here. Prefer promoting the
// shared logic to packages/ instead.
const crossAppImportAllowlist: CrossAppImportAllowlistEntry[] = [
  {
    pathPattern: /^apps\/packaged\/(?:src|tests)\//,
    specifierPattern: /^@open-design\/desktop\/main$/,
    reason:
      "apps/packaged is the thin packaged Electron entry that wraps the desktop shell through its declared ./main package export",
  },
];

function appDirectoryForRepositoryPath(repositoryPath: string): string | null {
  const [scope, appDirectory] = repositoryPath.split("/");
  return scope === "apps" && appDirectory ? appDirectory : null;
}

export function isCrossAppImportSourceFile(fileName: string): boolean {
  return crossAppImportSourceExtensions.has(path.extname(fileName));
}

function isCrossAppImportAllowlisted(repositoryPath: string, specifier: string): boolean {
  return crossAppImportAllowlist.some(
    (entry) => entry.pathPattern.test(repositoryPath) && entry.specifierPattern.test(specifier),
  );
}

function targetAppForSpecifier(
  repositoryPath: string,
  specifier: string,
  registry: AppDirectoryRegistry,
): string | null {
  const importingApp = appDirectoryForRepositoryPath(repositoryPath);
  if (importingApp == null) return null;

  const isForeignAppDirectory = (targetApp: string | null): targetApp is string =>
    targetApp != null && targetApp !== importingApp && registry.packageNameByDirectory.has(targetApp);

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(repositoryPath), specifier));
    const targetApp = appDirectoryForRepositoryPath(resolved);
    return isForeignAppDirectory(targetApp) ? targetApp : null;
  }

  if (specifier.startsWith("apps/")) {
    const targetApp = appDirectoryForRepositoryPath(specifier);
    return isForeignAppDirectory(targetApp) ? targetApp : null;
  }

  for (const [appDirectory, packageName] of registry.packageNameByDirectory) {
    if (appDirectory === importingApp) continue;
    if (specifier === packageName || specifier.startsWith(`${packageName}/`)) {
      return appDirectory;
    }
  }

  return null;
}

type ImportSpecifierReference = {
  index: number;
  specifier: string;
};

type CreateRequireBindings = {
  createRequireIdentifiers: Set<string>;
  createRequireNamespaces: Set<string>;
  requireLikeIdentifiers: Set<string>;
};

function scriptKindForRepositoryPath(repositoryPath: string): ts.ScriptKind {
  switch (path.extname(repositoryPath)) {
    case ".js":
      return ts.ScriptKind.JS;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".mjs":
      return ts.ScriptKind.JS;
    case ".cjs":
      return ts.ScriptKind.JS;
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".mts":
      return ts.ScriptKind.TS;
    case ".cts":
      return ts.ScriptKind.TS;
    default:
      return ts.ScriptKind.TS;
  }
}

function stringLiteralReference(node: ts.Node, sourceFile: ts.SourceFile): ImportSpecifierReference | null {
  if (!ts.isStringLiteralLike(node)) return null;
  return { index: node.getStart(sourceFile), specifier: node.text };
}

function isNodeModuleSpecifier(node: ts.Node | undefined): boolean {
  return node != null && ts.isStringLiteralLike(node) && (node.text === "node:module" || node.text === "module");
}

function isRequireNodeModuleCall(expression: ts.Expression): boolean {
  if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) return false;
  const [moduleSpecifier] = expression.arguments;
  return expression.expression.text === "require" && isNodeModuleSpecifier(moduleSpecifier);
}

function collectCreateRequireBindings(sourceFile: ts.SourceFile): CreateRequireBindings {
  const bindings: CreateRequireBindings = {
    createRequireIdentifiers: new Set(),
    createRequireNamespaces: new Set(),
    requireLikeIdentifiers: new Set(["require"]),
  };

  const collectCreateRequireImports = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      isNodeModuleSpecifier(node.moduleSpecifier) &&
      node.importClause?.namedBindings != null
    ) {
      const { namedBindings } = node.importClause;
      if (ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          const importedName = element.propertyName?.text ?? element.name.text;
          if (importedName === "createRequire") {
            bindings.createRequireIdentifiers.add(element.name.text);
          }
        }
      } else if (ts.isNamespaceImport(namedBindings)) {
        bindings.createRequireNamespaces.add(namedBindings.name.text);
      }
    } else if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)) {
      if (node.initializer != null && isRequireNodeModuleCall(node.initializer)) {
        for (const element of node.name.elements) {
          const propertyName = element.propertyName != null && ts.isIdentifier(element.propertyName)
            ? element.propertyName.text
            : ts.isIdentifier(element.name)
              ? element.name.text
              : null;
          if (propertyName === "createRequire" && ts.isIdentifier(element.name)) {
            bindings.createRequireIdentifiers.add(element.name.text);
          }
        }
      }
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer != null &&
      isRequireNodeModuleCall(node.initializer)
    ) {
      bindings.createRequireNamespaces.add(node.name.text);
    }

    ts.forEachChild(node, collectCreateRequireImports);
  };

  const collectRequireLikeIdentifiers = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer != null &&
      isCreateRequireCall(node.initializer, bindings)
    ) {
      bindings.requireLikeIdentifiers.add(node.name.text);
    }

    ts.forEachChild(node, collectRequireLikeIdentifiers);
  };

  collectCreateRequireImports(sourceFile);
  collectRequireLikeIdentifiers(sourceFile);
  return bindings;
}

function isCreateRequireCall(expression: ts.Expression, bindings: CreateRequireBindings): boolean {
  return (
    ts.isCallExpression(expression) &&
    ((ts.isIdentifier(expression.expression) && bindings.createRequireIdentifiers.has(expression.expression.text)) ||
      (ts.isPropertyAccessExpression(expression.expression) &&
        ts.isIdentifier(expression.expression.expression) &&
        bindings.createRequireNamespaces.has(expression.expression.expression.text) &&
        expression.expression.name.text === "createRequire"))
  );
}

function isRequireResolveExpression(expression: ts.Expression, bindings: CreateRequireBindings): boolean {
  return (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === "resolve" &&
    ((ts.isIdentifier(expression.expression) && bindings.requireLikeIdentifiers.has(expression.expression.text)) ||
      isCreateRequireCall(expression.expression, bindings))
  );
}

function collectImportSpecifierReferences(repositoryPath: string, source: string): ImportSpecifierReference[] {
  const sourceFile = ts.createSourceFile(
    repositoryPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForRepositoryPath(repositoryPath),
  );
  const references: ImportSpecifierReference[] = [];
  const createRequireBindings = collectCreateRequireBindings(sourceFile);

  const pushStringLiteral = (node: ts.Node | undefined): void => {
    if (node == null) return;
    const reference = stringLiteralReference(node, sourceFile);
    if (reference != null) references.push(reference);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      pushStringLiteral(node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node)) {
      pushStringLiteral(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      pushStringLiteral(node.moduleReference.expression);
    } else if (ts.isImportTypeNode(node)) {
      if (ts.isLiteralTypeNode(node.argument)) {
        pushStringLiteral(node.argument.literal);
      }
    } else if (ts.isCallExpression(node)) {
      const firstArgument = node.arguments[0];
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        pushStringLiteral(firstArgument);
      } else if (
        ts.isIdentifier(node.expression) &&
        createRequireBindings.requireLikeIdentifiers.has(node.expression.text)
      ) {
        pushStringLiteral(firstArgument);
      } else if (isRequireResolveExpression(node.expression, createRequireBindings)) {
        pushStringLiteral(firstArgument);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return references;
}

export function collectCrossAppImportViolationsFromSource(
  repositoryPath: string,
  source: string,
  registry: AppDirectoryRegistry,
): CrossAppImportViolation[] {
  const violations: CrossAppImportViolation[] = [];
  const seen = new Set<string>();
  const sourceFile = ts.createSourceFile(
    repositoryPath,
    source,
    ts.ScriptTarget.Latest,
    false,
    scriptKindForRepositoryPath(repositoryPath),
  );

  for (const reference of collectImportSpecifierReferences(repositoryPath, source)) {
    const dedupeKey = `${reference.index}\0${reference.specifier}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const targetApp = targetAppForSpecifier(repositoryPath, reference.specifier, registry);
    if (targetApp == null || isCrossAppImportAllowlisted(repositoryPath, reference.specifier)) continue;

    violations.push({
      filePath: repositoryPath,
      lineNumber: sourceFile.getLineAndCharacterOfPosition(reference.index).line + 1,
      specifier: reference.specifier,
      targetApp,
      reason: `apps must not import another app's private implementation (apps/${targetApp}); integrate via HTTP APIs and packages/contracts`,
    });
  }

  return violations.sort((left, right) => left.lineNumber - right.lineNumber);
}

export async function loadAppDirectoryRegistry(
  appsRoot = path.join(repoRoot, "apps"),
): Promise<AppDirectoryRegistry> {
  const packageNameByDirectory = new Map<string, string>();

  for (const entry of await readdir(appsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const manifestPath = path.join(appsRoot, entry.name, "package.json");
    let manifest: { name?: unknown };
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { name?: unknown };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load app package manifest at ${manifestPath}: ${reason}`);
    }

    if (typeof manifest.name !== "string" || manifest.name.trim().length === 0) {
      throw new Error(`Failed to load app package manifest at ${manifestPath}: package name must be a non-empty string`);
    }

    packageNameByDirectory.set(entry.name, manifest.name);
  }

  return { packageNameByDirectory };
}

async function collectAppSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (crossAppImportSkippedDirectories.has(entry.name)) continue;
      files.push(...(await collectAppSourceFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && isCrossAppImportSourceFile(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

export async function checkCrossAppImports(): Promise<boolean> {
  const registry = await loadAppDirectoryRegistry();
  const violations: CrossAppImportViolation[] = [];

  for (const appDirectory of [...registry.packageNameByDirectory.keys()].sort()) {
    for (const fullPath of await collectAppSourceFiles(path.join(repoRoot, "apps", appDirectory))) {
      const repositoryPath = path.relative(repoRoot, fullPath).split(path.sep).join("/");
      const source = await readFile(fullPath, "utf8");
      violations.push(...collectCrossAppImportViolationsFromSource(repositoryPath, source, registry));
    }
  }

  if (violations.length > 0) {
    console.error("Cross-app import boundary violations found:");
    for (const violation of violations) {
      console.error(`- ${violation.filePath}:${violation.lineNumber} \`${violation.specifier}\` -> ${violation.reason}`);
    }
    console.error(
      "Move shared logic to packages/ (DTOs belong in packages/contracts) or call the owning app's HTTP API instead.",
    );
    return false;
  }

  console.log("Cross-app import check passed: apps do not import another app's private implementation.");
  return true;
}
