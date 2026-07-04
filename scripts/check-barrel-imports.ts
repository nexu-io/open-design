import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

// Known limits (accepted residue, revisit if the codebase shape changes):
// - Bare `const x = require('...')` call expressions are not scanned; only static
//   import/export declarations, `import()` (value and type position), and
//   `import x = require('...')` are. Fine in an ESM codebase where bare `require`
//   does not resolve.
// - `resolveRelativeSpecifier` strips only `.ts`/`.js` extensions, so `.mjs`/`.cjs`/
//   `.mts`/`.cts` specifiers would misresolve (e.g. `./file.mjs` -> `file.mjs/`).
//   No such specifiers exist in the scanned tree today.
// - tsconfig path aliases bypass the relative-specifier filter entirely (only
//   `./`- and `../`-prefixed specifiers are checked). The daemon defines none.

const repoRoot = path.resolve(import.meta.dirname, '..');

export type CapabilityBarrelDomain = {
  /** Human-readable name used in violation messages. */
  name: string;
  /** Repository-relative path to the domain root, e.g. 'apps/daemon/src/design-systems'. */
  root: string;
  /** Protected subdirectory names directly under root. */
  subdirs: readonly string[];
  /**
   * The foundation subdirectory (the kernel). Every sibling may import it directly,
   * via any path. The foundation itself must not import from a sibling subdirectory.
   */
  foundation: string;
  /**
   * Permitted directed dependency edges between non-foundation siblings, as `[from, to]`.
   * A `from` subdir may reach a listed `to` sibling ONLY through that sibling's barrel
   * (`../<to>/index.js`), never a private file. Edges must stay acyclic — a cycle in this
   * list is a configuration error and fails the check before any file is scanned.
   */
  allowedEdges: ReadonlyArray<readonly [string, string]>;
};

// Capability barrel domains — register each domain here after applying the pattern.
// Rules enforced per domain (numbering matches scripts/check-barrel-imports.test.ts):
//   (1) External code may only import via the domain barrel (root/index.ts), not into subdirs directly.
//   (2) A subdir may import the foundation (`core`) directly, via any path (allowance).
//   (3) Imports within the same subdir are unrestricted (allowance).
//   (4) A subdir may reach a non-foundation sibling only along a declared `allowedEdges` edge,
//       and only through that sibling's barrel; every other cross-subdir import is a violation.
//   (5) A subdir may not import the domain root barrel (`../index.js`) — that re-exports every
//       subdir and invites a circular dependency. Import from `core` or an allowed sibling barrel.
//   (6) A file directly under the domain root (the root `index.ts` and any straggler module)
//       may reach a subdir ONLY through that subdir's barrel (`./<subdir>/index.js`), never a
//       private file inside it.
//   (7) The domain root barrel (root/index.ts) must use explicit named re-exports; `export *`
//       from a subdir hides the public surface and silently swallows name collisions.
// Reference implementation: apps/daemon/src/design-systems/ (see its README.md).
export const CAPABILITY_BARREL_DOMAINS: CapabilityBarrelDomain[] = [
  {
    name: 'design-systems',
    root: 'apps/daemon/src/design-systems',
    subdirs: ['core', 'catalog', 'user', 'import', 'tokens', 'jobs'],
    foundation: 'core',
    allowedEdges: [
      ['user', 'catalog'],
      ['import', 'tokens'],
      ['jobs', 'user'],
      ['jobs', 'catalog'],
    ],
  },
  {
    name: 'telemetry',
    root: 'apps/daemon/src/telemetry',
    subdirs: ['core', 'redaction', 'builder'],
    foundation: 'core',
    allowedEdges: [
      ['builder', 'redaction'],
    ],
  },
];

export type BarrelImportViolation = {
  filePath: string;
  lineNumber: number;
  specifier: string;
  reason: string;
};

const barrelCheckSkippedDirectories = new Set([
  '.next',
  '.od-data',
  '.tmp',
  'dist',
  'node_modules',
  'out',
  'test-results',
]);

/**
 * Validates a domain's static configuration: the foundation and every edge endpoint must be a
 * declared subdir, the foundation may not appear as an edge endpoint, and the edge set must be
 * acyclic. Returns human-readable errors; a non-empty result fails the whole check.
 */
export function validateDomainConfig(domain: CapabilityBarrelDomain): string[] {
  const errors: string[] = [];
  const subdirs = new Set(domain.subdirs);

  if (!subdirs.has(domain.foundation)) {
    errors.push(`domain \`${domain.name}\`: foundation \`${domain.foundation}\` is not a declared subdir`);
  }

  const adjacency = new Map<string, string[]>();
  for (const [from, to] of domain.allowedEdges) {
    if (!subdirs.has(from)) errors.push(`domain \`${domain.name}\`: edge from \`${from}\` is not a declared subdir`);
    if (!subdirs.has(to)) errors.push(`domain \`${domain.name}\`: edge to \`${to}\` is not a declared subdir`);
    if (from === domain.foundation || to === domain.foundation) {
      errors.push(`domain \`${domain.name}\`: foundation \`${domain.foundation}\` must not appear in allowedEdges (it is importable directly)`);
    }
    adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
  }

  // Depth-first cycle detection over the declared edges.
  const state = new Map<string, 'visiting' | 'done'>();
  const hasCycleFrom = (node: string): boolean => {
    state.set(node, 'visiting');
    for (const next of adjacency.get(node) ?? []) {
      const s = state.get(next);
      if (s === 'visiting') return true;
      if (s === undefined && hasCycleFrom(next)) return true;
    }
    state.set(node, 'done');
    return false;
  };
  for (const node of adjacency.keys()) {
    if (state.get(node) === undefined && hasCycleFrom(node)) {
      errors.push(`domain \`${domain.name}\`: allowedEdges form a cycle involving \`${node}\` — cross-subdir dependencies must stay acyclic`);
      break;
    }
  }

  return errors;
}

type ImportSpecifierOccurrence = {
  lineNumber: number;
  specifier: string;
  /** True for `export * from '...'` (a star re-export with no named export clause). */
  isExportStar: boolean;
};

function collectImportSpecifiers(
  repositoryPath: string,
  source: string,
): ImportSpecifierOccurrence[] {
  const sourceFile = ts.createSourceFile(
    repositoryPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    repositoryPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers: ImportSpecifierOccurrence[] = [];

  const push = (node: ts.Node | undefined, isExportStar = false): void => {
    if (!node || !ts.isStringLiteralLike(node)) return;
    specifiers.push({
      lineNumber: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
      specifier: node.text,
      isExportStar,
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      // Static `import ... from '...'`.
      push(node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node)) {
      // `export ... from '...'`; no exportClause means `export * from '...'`
      // (a namespace re-export `export * as ns from '...'` has a clause and is not a star).
      push(node.moduleSpecifier, node.exportClause === undefined);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      // Inline `import('...')` type positions.
      push(node.argument.literal);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      // Dynamic `import('...')` — a real value-level dependency that must obey the same rules.
      push(node.arguments[0]);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      // `import x = require('...')` (CommonJS interop form).
      push(node.moduleReference.expression);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return specifiers;
}

function resolveRelativeSpecifier(fromRepositoryPath: string, specifier: string): string {
  const withoutExt = specifier.replace(/\.[jt]s$/, '');
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromRepositoryPath), withoutExt));
}

function checkBarrelViolationsForDomain(
  domain: CapabilityBarrelDomain,
  fromRepositoryPath: string,
  specifiers: ImportSpecifierOccurrence[],
): BarrelImportViolation[] {
  const violations: BarrelImportViolation[] = [];
  const isInDomain = fromRepositoryPath.startsWith(`${domain.root}/`);
  const isDomainRootBarrel = fromRepositoryPath === `${domain.root}/index.ts`;
  const allowedEdges = new Set(domain.allowedEdges.map(([from, to]) => `${from}->${to}`));

  let fromSubdir: string | null = null;
  if (isInDomain) {
    const firstSegment = fromRepositoryPath.slice(`${domain.root}/`.length).split('/')[0] ?? '';
    if (domain.subdirs.includes(firstSegment)) fromSubdir = firstSegment;
  }

  for (const { lineNumber, specifier, isExportStar } of specifiers) {
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) continue;

    const resolved = resolveRelativeSpecifier(fromRepositoryPath, specifier);
    if (resolved !== domain.root && !resolved.startsWith(`${domain.root}/`)) continue;

    // Rule 7: the domain root barrel must enumerate its public surface with named
    // re-exports; `export *` hides the surface and silently swallows name collisions.
    if (isDomainRootBarrel && isExportStar) {
      violations.push({
        filePath: fromRepositoryPath,
        lineNumber,
        specifier,
        reason: `the \`${domain.name}\` domain root barrel must re-export named symbols, not \`export * from '${specifier}'\` — enumerate the public surface explicitly`,
      });
      continue;
    }

    // Rule 5: a subdir reaching the domain root barrel invites a circular dependency.
    if (fromSubdir !== null && resolved === `${domain.root}/index`) {
      violations.push({
        filePath: fromRepositoryPath,
        lineNumber,
        specifier,
        reason: `\`${domain.name}/${fromSubdir}/\` must not import the domain root barrel (\`../index.js\`); import from \`../${domain.foundation}/index.js\` or an allowed sibling barrel instead`,
      });
      continue;
    }

    const firstSegment = resolved.slice(`${domain.root}/`.length).split('/')[0] ?? '';
    const resolvedSubdir = domain.subdirs.includes(firstSegment) ? firstSegment : null;
    if (resolvedSubdir === null) continue;

    if (!isInDomain) {
      // Rule 1: external code reached into a subdir, bypassing the barrel.
      violations.push({
        filePath: fromRepositoryPath,
        lineNumber,
        specifier,
        reason: `external code must import \`${domain.name}\` via its barrel (\`${domain.root}/index.ts\`), not directly from \`${domain.name}/${resolvedSubdir}/\``,
      });
      continue;
    }

    // Rule 6: a file directly under the domain root (the root barrel or a straggler
    // module such as server-services.ts) may reach a subdir only through that
    // subdir's barrel — never a private file inside it.
    if (fromSubdir === null) {
      const targetsSubdirBarrel =
        resolved === `${domain.root}/${resolvedSubdir}` || resolved === `${domain.root}/${resolvedSubdir}/index`;
      if (!targetsSubdirBarrel) {
        violations.push({
          filePath: fromRepositoryPath,
          lineNumber,
          specifier,
          reason: `files directly under \`${domain.name}/\` must import \`${resolvedSubdir}/\` through its barrel (\`./${resolvedSubdir}/index.js\`), not a private file`,
        });
      }
      continue;
    }

    if (fromSubdir === resolvedSubdir) continue; // Rule 3 allowance: same subdir

    // Rule 4: cross-subdir import within the domain.
    if (resolvedSubdir === domain.foundation) continue; // Rule 2 allowance: foundation kernel — importable directly

    if (!allowedEdges.has(`${fromSubdir}->${resolvedSubdir}`)) {
      violations.push({
        filePath: fromRepositoryPath,
        lineNumber,
        specifier,
        reason: `\`${domain.name}/${fromSubdir}/\` may not import sibling \`${resolvedSubdir}/\` — only \`${domain.foundation}/\` (the foundation) or a sibling declared in allowedEdges is permitted`,
      });
      continue;
    }

    // Allowed edge — but it must go through the sibling's barrel, not a private file.
    const targetsBarrel = resolved === `${domain.root}/${resolvedSubdir}` || resolved === `${domain.root}/${resolvedSubdir}/index`;
    if (!targetsBarrel) {
      violations.push({
        filePath: fromRepositoryPath,
        lineNumber,
        specifier,
        reason: `\`${domain.name}/${fromSubdir}/\` must import sibling \`${resolvedSubdir}/\` through its barrel (\`../${resolvedSubdir}/index.js\`), not a private file`,
      });
    }
  }

  return violations;
}

/**
 * Pure test seam: parse one source file's imports and evaluate them against a domain's barrel
 * rules, returning any violations. Used by `scripts/check-barrel-imports.test.ts` to exercise
 * each rule against synthetic sources without scanning the real tree.
 */
export function collectBarrelImportViolationsFromSource(
  fromRepositoryPath: string,
  source: string,
  domain: CapabilityBarrelDomain,
): BarrelImportViolation[] {
  return checkBarrelViolationsForDomain(domain, fromRepositoryPath, collectImportSpecifiers(fromRepositoryPath, source));
}

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (barrelCheckSkippedDirectories.has(entry.name)) continue;
      files.push(...(await collectSourceFiles(path.join(directory, entry.name))));
      continue;
    }
    if (entry.isFile() && /\.[jt]sx?$/.test(entry.name)) {
      files.push(path.relative(repoRoot, path.join(directory, entry.name)).split(path.sep).join('/'));
    }
  }

  return files;
}

export async function checkCapabilityBarrelImports(): Promise<boolean> {
  const configErrors = CAPABILITY_BARREL_DOMAINS.flatMap(validateDomainConfig);
  if (configErrors.length > 0) {
    console.error('Capability barrel configuration is invalid:');
    for (const error of configErrors) console.error(`- ${error}`);
    return false;
  }

  const violations: BarrelImportViolation[] = [];
  // Scope is intentionally runtime code only (`apps/daemon/src`). Test code under
  // `apps/daemon/tests` is NOT scanned: unit tests legitimately white-box import
  // subdir internals that are deliberately absent from the public barrel (e.g.
  // `core/swift-colors`, `user/migration`, `tokens/token-contract`). Widening the
  // scan to tests would force those internal-only helpers onto the public surface,
  // defeating the encapsulation this check exists to protect. The
  // barrel-only guarantee therefore covers external RUNTIME importers; the
  // "prefer the barrel for public-surface symbols" test convention is documented,
  // not enforced (see design-systems/README.md → Import conventions).
  const scanRoot = path.join(repoRoot, 'apps', 'daemon', 'src');

  for (const repositoryPath of await collectSourceFiles(scanRoot)) {
    const source = await readFile(path.join(repoRoot, repositoryPath), 'utf8');
    const specifiers = collectImportSpecifiers(repositoryPath, source);

    for (const domain of CAPABILITY_BARREL_DOMAINS) {
      violations.push(...checkBarrelViolationsForDomain(domain, repositoryPath, specifiers));
    }
  }

  if (violations.length > 0) {
    console.error('Capability barrel import violations found:');
    for (const violation of violations) {
      console.error(
        `- ${violation.filePath}:${violation.lineNumber} \`${violation.specifier}\` -> ${violation.reason}`,
      );
    }
    console.error(
      'Import from the domain barrel (index.ts), the foundation subdir, or an allowed sibling barrel. ' +
      'To register a new protected domain, add it to CAPABILITY_BARREL_DOMAINS in scripts/check-barrel-imports.ts.',
    );
    return false;
  }

  const domainNames = CAPABILITY_BARREL_DOMAINS.map((d) => d.name).join(', ');
  console.log(
    `Capability barrel check passed: ${CAPABILITY_BARREL_DOMAINS.length} domain(s) enforce barrel-only imports (${domainNames}).`,
  );
  return true;
}
