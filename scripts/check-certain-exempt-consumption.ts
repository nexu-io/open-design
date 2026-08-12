import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

import {
  CERTAIN_DAEMON_CORE_EXACT,
  CERTAIN_EXEMPT_EXACT,
  CERTAIN_EXEMPT_PREFIXES,
} from "./scopes.ts";

// Guard for the certain-tier exempt core in `scripts/scopes.ts` (rule
// `certain-exempt-surface`; methodology in `specs/current/ci.md`).
//
// Boundary invariant: no source that a *skippable* merge-gate lane executes may
// consume a certain-exempt file. If that held false, a docs-only change could
// invalidate a lane the promoted rule tells the merge queue to skip.
//
// What "consumption" means here, at two precision levels:
// - a dot-relative literal (`../../docs/...`) that resolves from the file's
//   repo location into the certain-exempt surface: flagged everywhere — it can
//   only mean the repository surface.
// - a bare repo-relative literal (`docs/CHANGELOG`): flagged everywhere unless
//   it is an argument to a known sandbox-fixture writer. Test files can also
//   contain repo-root helpers, so exempting them wholesale would hide real
//   consumption.
// - path.join/path.resolve expressions made from static segments (optionally
//   anchored at repoRoot), and template literals whose static prefix already
//   enters an exempt directory: flagged as the same repository dependency.
//
// Deliberately outside the checked surface:
// - root `scripts/` — policy-floor code. Preflight is armed on every plan, so
//   its guard checks may read the exempt surface (product neutrality validates
//   docs/ prose on every run).
// - `apps/landing-page/` — it IS the exempt surface; landing-page CI owns it.

const repoRoot = path.resolve(import.meta.dirname, "..");

const checkedRoots = ["apps", "packages", "tools", "e2e"] as const;

const skippedDirectoryNames = new Set([
  ".astro",
  ".next",
  ".od-data",
  "dist",
  "node_modules",
  "out",
  "reports",
  "test-results",
  "vendor",
]);

const skippedRepositoryPrefixes = ["apps/landing-page/"];

const checkedExtensions = new Set([".ts", ".tsx"]);

// These helpers interpret their path argument inside a temporary project
// workspace. Keep this list narrow: repo-root readers used by tests must remain
// visible to the guard.
const sandboxFixtureWriterNames = new Set(["writeProjectFile"]);

// File-level exceptions. Every entry must explain why the reference is not
// gate-lane consumption of exempt-file *content*; revisit the entry if the
// file's relationship to the exempt surface changes.
const allowedConsumers = new Map<string, string>([
  [
    "apps/daemon/tests/claude-design-import.test.ts",
    "archive-entry and extracted-project fixture paths; every docs/ literal names data inside a temporary project",
  ],
  [
    "apps/daemon/tests/design-systems/file-score.test.ts",
    "path-classification fixture strings; the test does not open the editor configuration files",
  ],
  [
    "apps/daemon/tests/project-classifiers.test.ts",
    "file-kind classifier input; the LICENSE literal is never resolved or opened",
  ],
  [
    "apps/web/tests/components/ChatPane.imported-folder-artifacts.test.tsx",
    "imported-project artifact fixture paths rendered from in-memory test data",
  ],
  [
    "apps/web/tests/components/file-viewer-markdown-copy.test.tsx",
    "project-relative markdown path inputs used to test URL construction, not repository reads",
  ],
  [
    "apps/web/tests/utils/inlineMentions.test.ts",
    "in-memory mention parser fixture paths; no filesystem access occurs",
  ],
  [
    "tools/release/src/release-note/prepare.ts",
    "docs/CHANGELOG feeds release-note preparation, which runs only in release workflows; @open-design/tools-release tests run in no ci.yml lane",
  ],
  [
    "e2e/tests/packaged-smoke-workflow.test.ts",
    "scope-planner and workflow-text assertion fixtures; certain-exempt literals are passed as data and never opened",
  ],
  [
    "e2e/tests/scripts/product-neutrality.test.ts",
    "virtual source path passed to the product-neutrality collector; it does not access the repository file",
  ],
  [
    "e2e/tests/scripts/scopes.test.ts",
    "behavior fixtures for this very check: source snippets passed to the collector as data, never resolved or opened",
  ],
]);

// Content dependencies whose producers are classified into the same certain
// lane as their consumers. Unlike allowedConsumers, these exceptions are
// exact producer/consumer pairs so another exempt read in the same file still
// fails closed.
const allowedConsumerTargets = new Map<string, ReadonlyMap<string, string>>([
  [
    "apps/daemon/tests/runtimes/trae-cli.test.ts",
    new Map([
      [
        CERTAIN_DAEMON_CORE_EXACT[0],
        "the exact consumed document is daemon core, so producer and consumer run the same suite",
      ],
    ]),
  ],
]);

type ConsumptionViolation = {
  filePath: string;
  lineNumber: number;
  literal: string;
  repositoryTarget: string;
};

function toRepositoryPath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function landsInCertainExemptSurface(repositoryPath: string): boolean {
  return (
    CERTAIN_EXEMPT_PREFIXES.some((prefix) => repositoryPath.startsWith(prefix)) ||
    (CERTAIN_EXEMPT_EXACT as readonly string[]).includes(repositoryPath)
  );
}

function literalConsumesCertainExemptSurface(fromRepositoryPath: string, literal: string): boolean {
  if (literal.startsWith("./") || literal.startsWith("../")) {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromRepositoryPath), literal));
    return landsInCertainExemptSurface(resolved);
  }
  return landsInCertainExemptSurface(literal);
}

function isSandboxFixtureWriterArgument(node: ts.Expression): boolean {
  const call = node.parent;
  if (!ts.isCallExpression(call) || !call.arguments.includes(node)) return false;

  const callee = call.expression;
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : undefined;
  return name !== undefined && sandboxFixtureWriterNames.has(name);
}

type StaticPath = {
  path: string;
  display: string;
  prefixOnly: boolean;
};

function staticPathFromExpression(node: ts.Expression, sourceFile: ts.SourceFile): StaticPath | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { path: node.text, display: node.text, prefixOnly: false };
  }

  if (ts.isTemplateExpression(node)) {
    const prefix = node.head.text;
    if (!CERTAIN_EXEMPT_PREFIXES.some((exemptPrefix) => prefix.startsWith(exemptPrefix))) {
      return undefined;
    }
    return { path: prefix, display: node.getText(sourceFile), prefixOnly: true };
  }

  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return undefined;
  const callee = node.expression;
  if (
    !ts.isIdentifier(callee.expression) ||
    callee.expression.text !== "path" ||
    (callee.name.text !== "join" && callee.name.text !== "resolve")
  ) {
    return undefined;
  }

  const segments: string[] = [];
  for (const [index, argument] of node.arguments.entries()) {
    if (index === 0 && ts.isIdentifier(argument) && argument.text === "repoRoot") continue;
    const segment = staticPathFromExpression(argument, sourceFile);
    if (segment === undefined || segment.prefixOnly) return undefined;
    segments.push(segment.path);
  }
  if (segments.length === 0) return undefined;

  return {
    path: path.posix.join(...segments),
    display: node.getText(sourceFile),
    prefixOnly: false,
  };
}

export function collectCertainExemptConsumptionFromSource(
  repositoryPath: string,
  source: string,
): ConsumptionViolation[] {
  const sourceFile = ts.createSourceFile(
    repositoryPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    repositoryPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations: ConsumptionViolation[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isExpression(node)) {
      const candidate = staticPathFromExpression(node, sourceFile);
      if (candidate !== undefined && !isSandboxFixtureWriterArgument(node)) {
        const consumes = candidate.prefixOnly
          ? CERTAIN_EXEMPT_PREFIXES.some((prefix) => candidate.path.startsWith(prefix))
          : literalConsumesCertainExemptSurface(repositoryPath, candidate.path);
        if (consumes) {
          violations.push({
            filePath: repositoryPath,
            lineNumber: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
            literal: candidate.display,
            repositoryTarget: candidate.path,
          });
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

export function collectDisallowedCertainExemptConsumptionFromSource(
  repositoryPath: string,
  source: string,
): ConsumptionViolation[] {
  if (allowedConsumers.has(repositoryPath)) return [];
  const allowedTargets = allowedConsumerTargets.get(repositoryPath);
  return collectCertainExemptConsumptionFromSource(repositoryPath, source).filter(
    (violation) => !allowedTargets?.has(violation.repositoryTarget),
  );
}

async function collectCheckedFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    const repositoryPath = toRepositoryPath(fullPath);

    if (entry.isDirectory()) {
      if (
        skippedDirectoryNames.has(entry.name) ||
        entry.name.startsWith(".next-") ||
        skippedRepositoryPrefixes.some((prefix) => `${repositoryPath}/`.startsWith(prefix))
      ) {
        continue;
      }
      files.push(...(await collectCheckedFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && checkedExtensions.has(path.extname(entry.name))) {
      files.push(repositoryPath);
    }
  }

  return files;
}

export async function checkCertainExemptConsumption(): Promise<boolean> {
  const violations: ConsumptionViolation[] = [];

  for (const root of checkedRoots) {
    for (const repositoryPath of await collectCheckedFiles(path.join(repoRoot, root))) {
      const source = await readFile(path.join(repoRoot, repositoryPath), "utf8");
      violations.push(...collectDisallowedCertainExemptConsumptionFromSource(repositoryPath, source));
    }
  }

  if (violations.length > 0) {
    console.error("Certain-exempt surface consumption found in gate-lane sources:");
    for (const violation of violations) {
      console.error(`- ${violation.filePath}:${violation.lineNumber} \`${violation.literal}\``);
    }
    console.error(
      "Certain-tier exempt files must stay unconsumed by skippable merge-gate lanes (see specs/current/ci.md). Move the dependency, or add a justified allowlist entry in scripts/check-certain-exempt-consumption.ts.",
    );
    return false;
  }

  console.log("Certain-exempt consumption check passed: gate-lane sources do not read the certain-exempt surface.");
  return true;
}
