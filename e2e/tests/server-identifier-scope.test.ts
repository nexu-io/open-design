import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * `apps/daemon/src/server.ts` opts out of type checking with `@ts-nocheck`, so
 * the compiler never reports an identifier that is referenced where its
 * declaration is not in scope. Nothing else in the toolchain does either: the
 * file is bundled, not linted for scope, and a bad reference only surfaces as a
 * runtime `ReferenceError` on whichever request path happens to evaluate it.
 *
 * That is how `appVersionForCapture` shipped in 0.16.2-beta.148. The name is a
 * local of `createFinalizedMessageTelemetryReporter`; #6221 called it ~7,500
 * lines away inside `startChatRun`'s AMR workspace-scope telemetry, on the spawn
 * path, so every AMR run died with
 * `spawn failed: appVersionForCapture is not defined`.
 *
 * This suite re-checks the one thing `@ts-nocheck` suppresses and nothing else:
 * every identifier that survives to runtime resolves to a real binding. It runs
 * the TypeScript checker over `server.ts` with the pragma stripped, keeps only
 * "Cannot find name" diagnostics, and drops the ones in type positions (erased
 * before execution, so they cannot throw — those belong to the separate project
 * of removing `@ts-nocheck` from this file).
 *
 * It is deliberately not a typecheck of `server.ts`. Only unresolvable
 * value-position identifiers fail it.
 *
 * ## Why this lives in `e2e/tests/` and not `apps/daemon/tests/`
 *
 * A guard is worth exactly the lane that runs it. `ci.yml`'s daemon lane
 * executes one file — `tests/project-watchers.test.ts` — and that exclusive
 * invocation is itself pinned by the certain-exempt consumption guard
 * (`workflowRunsOnlyAllowedDaemonTest` in
 * `scripts/check-certain-exempt-consumption.ts`), so widening it is a coupled
 * policy change, not a lane edit. A daemon-hosted guard therefore protects
 * nothing on the merge gate.
 *
 * `e2e/tests/` closes that gap, and the closure is structural rather than
 * incidental:
 *
 * - Any change under `apps/daemon/src/` matches the `certain-daemon-core` rule
 *   in `scripts/scopes.ts`, whose effects include `ui_p0_validation_required`;
 *   `run_e2e_vitest` is `isFull || web_tests_required ||
 *   ui_p0_validation_required`. So a `server.ts`-only change arms the `E2E
 *   Vitest` lane even at the merge queue's `certain` threshold — the strictest
 *   context there is. An unresolved file list escalates fail-closed to full,
 *   which arms it too.
 * - That wiring cannot rot silently. The `daemon core boundary` guard
 *   (`scripts/lib/guard/scope.ts`) asserts `ci.yml` still contains both
 *   `run_e2e_vitest == 'true'` and `pnpm --filter @open-design/e2e test`, and
 *   it runs in the always-on policy floor.
 *
 * The placement also follows the root `AGENTS.md` boundary rule — cross-app and
 * repository-resource consistency checks belong here, not inside an app package
 * — for the same reason `e2e/tests/critique-coverage.test.ts` does: the check
 * reads another app's tree as a repository resource. Nothing here boots a
 * daemon or needs a fixture; `server.ts` is only ever read as text.
 */

const CANNOT_FIND_NAME = 2304;

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const SERVER_TS = path.join(REPO_ROOT, 'apps/daemon/src/server.ts');

/**
 * Names TypeScript cannot resolve here only because the scope check runs without
 * ambient type packages, not because the binding is missing at runtime. Keep
 * this list to genuine host globals; anything a module has to declare or import
 * does not belong here.
 */
const AMBIENT_RUNTIME_GLOBALS = new Set([
  'AbortSignal',
  'Buffer',
  'NodeJS',
  'TextDecoder',
  'TextEncoder',
  'URL',
  'URLSearchParams',
  '__dirname',
  '__filename',
  'clearInterval',
  'clearTimeout',
  'console',
  'fetch',
  'global',
  'globalThis',
  'module',
  'process',
  'queueMicrotask',
  'require',
  'setInterval',
  'setTimeout',
  'structuredClone',
]);

interface UnresolvedReference {
  readonly name: string;
  readonly line: number;
}

/** Strip the blanket opt-out so the checker actually reports on this file. */
function withoutTsNocheck(source: string): string {
  return source.replace(/^\s*\/\/\s*@ts-nocheck.*$/m, '// (@ts-nocheck stripped by the scope guard)');
}

/**
 * True when the identifier lives inside a type annotation, and so is erased
 * before the code runs. A value-position `typeof x` is a `TypeOfExpression` and
 * is NOT covered here on purpose: `typeof` does not throw on an undeclared name,
 * which is exactly how an out-of-scope reference can hide as a silent
 * `undefined` rather than a crash.
 */
function isErasedTypePosition(node: ts.Node): boolean {
  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    if (ts.isTypeNode(current) || ts.isTypeParameterDeclaration(current)) return true;
    if (ts.isImportTypeNode(current)) return true;
    if (ts.isStatement(current) || ts.isSourceFile(current)) return false;
  }
  return false;
}

function identifierAt(sourceFile: ts.SourceFile, pos: number): ts.Identifier | null {
  function visit(node: ts.Node): ts.Identifier | null {
    if (pos < node.getStart(sourceFile) || pos >= node.getEnd()) return null;
    for (const child of node.getChildren(sourceFile)) {
      const found = visit(child);
      if (found) return found;
    }
    return ts.isIdentifier(node) ? node : null;
  }
  return visit(sourceFile);
}

/**
 * Report every identifier in `source` that reaches runtime without a binding.
 *
 * `noResolve` keeps this to one file: imports still declare their names, so an
 * unresolved module never masquerades as an unresolved identifier, and the whole
 * dependency graph stays out of the check.
 */
function unresolvedRuntimeReferences(source: string, fileName: string): UnresolvedReference[] {
  const options: ts.CompilerOptions = {
    allowJs: false,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    noResolve: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
  };

  const host = ts.createCompilerHost(options, true);
  const baseGetSourceFile = host.getSourceFile.bind(host);
  const isTarget = (candidate: string) => path.resolve(candidate) === path.resolve(fileName);

  host.getSourceFile = (candidate, languageVersion, onError, shouldCreate) =>
    isTarget(candidate)
      ? ts.createSourceFile(candidate, source, languageVersion, true, ts.ScriptKind.TS)
      : baseGetSourceFile(candidate, languageVersion, onError, shouldCreate);
  host.fileExists = (candidate) => isTarget(candidate) || ts.sys.fileExists(candidate);
  host.readFile = (candidate) => (isTarget(candidate) ? source : ts.sys.readFile(candidate));

  const program = ts.createProgram([fileName], options, host);
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) throw new Error(`scope guard could not load ${fileName}`);

  const found: UnresolvedReference[] = [];
  for (const diagnostic of program.getSemanticDiagnostics(sourceFile)) {
    if (diagnostic.code !== CANNOT_FIND_NAME) continue;
    if (diagnostic.start === undefined) continue;
    const identifier = identifierAt(sourceFile, diagnostic.start);
    if (!identifier) continue;
    if (AMBIENT_RUNTIME_GLOBALS.has(identifier.text)) continue;
    if (isErasedTypePosition(identifier)) continue;
    found.push({
      name: identifier.text,
      line: sourceFile.getLineAndCharacterOfPosition(diagnostic.start).line + 1,
    });
  }
  return found;
}

describe('server.ts identifier scope', () => {
  it('reports a helper called from outside the function that declares it', () => {
    // The shape of the shipped bug, in miniature: a local of one function called
    // from another. If this stops failing, the guard below has gone vacuous.
    const reproduction = `export function makeReporter(getAppVersion: () => string) {
  const appVersionForCapture = () => getAppVersion();
  return () => ({ appVersion: appVersionForCapture() });
}
export function startRun(capture: (payload: unknown) => void) {
  capture({ appVersion: appVersionForCapture() });
}
`;
    expect(unresolvedRuntimeReferences(reproduction, path.join(path.dirname(SERVER_TS), 'scope-guard-fixture.ts')))
      .toEqual([{ name: 'appVersionForCapture', line: 6 }]);
  });

  it('leaves an identifier that a typeof guard hides still reportable', () => {
    // `typeof missing === 'string'` never throws, so this class of out-of-scope
    // reference degrades to a silent wrong value instead of a crash. It has to
    // stay visible to the guard — that is how the `effectiveSkillId` sibling of
    // the beta.148 bug went unnoticed through a whole release.
    const reproduction = `export function startRun(fallback: string) {
  return typeof missingSkillId === 'string' && missingSkillId ? missingSkillId : fallback;
}
`;
    expect(
      unresolvedRuntimeReferences(reproduction, path.join(path.dirname(SERVER_TS), 'scope-guard-fixture.ts'))
        .map((reference) => reference.name),
    ).toEqual(['missingSkillId', 'missingSkillId', 'missingSkillId']);
  });

  it('has no identifier that reaches runtime unbound', () => {
    const source = fs.readFileSync(SERVER_TS, 'utf8');
    expect(source).toMatch(/@ts-nocheck/);

    const unresolved = unresolvedRuntimeReferences(withoutTsNocheck(source), SERVER_TS);

    expect(
      unresolved.map((reference) => `${reference.name} (line ${reference.line})`),
    ).toEqual([]);
  }, 120_000);
});
