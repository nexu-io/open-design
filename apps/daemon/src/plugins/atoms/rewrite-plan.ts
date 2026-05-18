// Phase 7 entry slice / spec §20.3 / §21.3.2 — rewrite-plan atom.
//
// SKILL.md fragment ships at plugins/_official/atoms/rewrite-plan/.
// Given a project cwd that already has code/index.json (from
// code-import) + an optional code/tokens.json (from design-extract),
// the runner produces a heuristic ownership classification and a
// per-component step list. The narrative `plan.md` is intentionally
// short — it's a scaffold the agent overwrites once the LLM-driven
// stage runs; the heuristic baseline gives subsequent stages
// (`patch-edit` / `diff-review` / `build-test`) an audit trail to
// reference even if the LLM step is skipped or fails.
//
// Ownership tiers (spec §11.5.1 / §20.3):
//   leaf   — single-component leaf files (Button.tsx, Card.css)
//   shared — shared infrastructure (hooks/, lib/, utils/)
//   route  — page-level / route entry points (app/page.tsx,
//            pages/index.tsx, src/app/(group)/page.tsx)
//   shell  — top-level layout / framework boundaries
//            (layout.tsx, _app.tsx, providers/, root css)
//
// The classifier keeps false-positive `shell` rare: only files that
// match a strict allowlist (layout|root|provider|theme|tokens|globals)
// are tagged `shell`. Everything else collapses to `leaf` so the
// patch-edit safety gate doesn't lock the agent out of plain
// component edits.

import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { createHash } from 'node:crypto';
import type { CodeImportIndex } from './code-import.js';
import type { DesignExtractReport } from './design-extract.js';

export type OwnershipTier = 'leaf' | 'shared' | 'route' | 'shell';

export interface OwnershipEntry {
  file: string;
  layer: OwnershipTier;
}

export interface RewriteStep {
  id: string;
  files: string[];
  rationale: string;
  risk: 'low' | 'medium' | 'high';
}

export interface RewritePlanReport {
  steps:    RewriteStep[];
  ownership: OwnershipEntry[];
  // SHA-1 digests of the inputs we relied on. The handoff atom
  // promotes these into ArtifactManifest provenance so a reviewer
  // can prove "this plan was generated against this snapshot of
  // code-import / token-map".
  meta: {
    generatedAt:     string;
    atomDigest:      string;     // hash of canonicalised code/index.json
    tokenMapDigest:  string;     // hash of code/tokens.json (or 'none')
    intent:          string;     // user-supplied intent string (echoed)
  };
  // The narrative plan.md scaffold the runner emits. The agent is
  // expected to overwrite this with its own narrative; we ship a
  // baseline so downstream stages always see a non-empty file.
  planMarkdown: string;
}

export interface RewritePlanOptions {
  cwd: string;
  // The user's brief, copied into plan.md and into steps[].rationale
  // when the heuristic can't think of anything better.
  intent?: string;
  // Override the build-test step id name (default 'build-test').
  buildTestStepId?: string;
}

const SHELL_BASENAMES = new Set([
  'layout.tsx', 'layout.jsx', 'layout.ts', 'layout.js',
  '_app.tsx', '_app.jsx', '_app.ts', '_app.js',
  '_document.tsx', '_document.jsx',
  'providers.tsx', 'providers.tsx', 'providers.ts',
  'theme.ts', 'theme.tsx',
  'globals.css', 'global.css',
  'tokens.css', 'design-tokens.css',
]);

const ROUTE_DIR_HINT = /(?:^|\/)(?:app|pages)\//;
const ROUTE_BASENAME = /^(?:page|index|route)\.[tj]sx?$/;

const SHARED_DIR_HINT = /(?:^|\/)(?:hooks|lib|utils|providers|context|store|stores|services|api|shared|common)\//;

const COMPONENT_DIR_HINT = /(?:^|\/)components?\//;

export async function runRewritePlan(opts: RewritePlanOptions): Promise<RewritePlanReport> {
  const cwd = path.resolve(opts.cwd);
  const indexPath = path.join(cwd, 'code', 'index.json');
  const tokensPath = path.join(cwd, 'code', 'tokens.json');
  const intent = (opts.intent ?? '').trim();
  const buildTestStepId = opts.buildTestStepId ?? 'build-test';

  let index: CodeImportIndex;
  try {
    index = JSON.parse(await fsp.readFile(indexPath, 'utf8')) as CodeImportIndex;
  } catch (err) {
    throw new Error(`rewrite-plan: missing or unreadable code/index.json (run code-import first): ${(err as Error).message}`);
  }

  let tokens: DesignExtractReport | undefined;
  try {
    tokens = JSON.parse(await fsp.readFile(tokensPath, 'utf8')) as DesignExtractReport;
  } catch {
    tokens = undefined;
  }

  const ownership = classifyOwnership(index);
  const steps = composeSteps({ index, ownership, tokens, intent, buildTestStepId });
  const meta = {
    generatedAt:    new Date().toISOString(),
    atomDigest:     digestObject(canonicaliseIndex(index)),
    tokenMapDigest: tokens ? digestObject(tokens) : 'none',
    intent:         intent || '',
  };
  const planMarkdown = renderNarrative({ intent, ownership, steps, tokens });

  // Persist all four files under <cwd>/plan/.
  const planDir = path.join(cwd, 'plan');
  await fsp.mkdir(planDir, { recursive: true });
  await fsp.writeFile(path.join(planDir, 'plan.md'),       planMarkdown,                 'utf8');
  await fsp.writeFile(path.join(planDir, 'ownership.json'), JSON.stringify(ownership, null, 2) + '\n', 'utf8');
  await fsp.writeFile(path.join(planDir, 'steps.json'),    JSON.stringify(steps,     null, 2) + '\n', 'utf8');
  await fsp.writeFile(path.join(planDir, 'meta.json'),     JSON.stringify(meta,      null, 2) + '\n', 'utf8');

  return { steps, ownership, meta, planMarkdown };
}

function classifyOwnership(index: CodeImportIndex): OwnershipEntry[] {
  const out: OwnershipEntry[] = [];
  for (const f of index.files) {
    out.push({ file: f.path, layer: classifyOne(f.path) });
  }
  // Ownership is sorted lexicographically so the JSON output is
  // diff-friendly across runs.
  out.sort((a, b) => a.file.localeCompare(b.file));
  return out;
}

function classifyOne(file: string): OwnershipTier {
  const base = path.posix.basename(file);
  if (SHELL_BASENAMES.has(base)) return 'shell';
  if (ROUTE_DIR_HINT.test(file) && ROUTE_BASENAME.test(base)) return 'route';
  // Layout files in the App Router that aren't in SHELL_BASENAMES list:
  if (ROUTE_DIR_HINT.test(file) && /^layout\.[tj]sx?$/.test(base)) return 'shell';
  if (SHARED_DIR_HINT.test(file)) return 'shared';
  if (COMPONENT_DIR_HINT.test(file)) return 'leaf';
  // Files at the repo root that aren't shell are usually config — keep them
  // as `shared` so the patch-edit gate insists on `risk: 'medium'+'.
  if (!file.includes('/')) return 'shared';
  return 'leaf';
}

function composeSteps(args: {
  index: CodeImportIndex;
  ownership: OwnershipEntry[];
  tokens: DesignExtractReport | undefined;
  intent: string;
  buildTestStepId: string;
}): RewriteStep[] {
  const steps: RewriteStep[] = [];

  // Step 0: token alignment when design-extract found anything. The
  // step's files[] enumerates leaf files that contain hex literals;
  // patch-edit replaces them with the active DS token references.
  if (args.tokens && (args.tokens.colors.length > 0 || args.tokens.spacing.length > 0)) {
    const filesWithTokens = new Set<string>();
    for (const t of args.tokens.colors) for (const s of t.sources) filesWithTokens.add(s.split(':')[0]!);
    for (const t of args.tokens.spacing) for (const s of t.sources) filesWithTokens.add(s.split(':')[0]!);
    if (filesWithTokens.size > 0) {
      steps.push({
        id: 'tokens-alignment',
        files: [...filesWithTokens].sort(),
        rationale: 'Replace inline literal colours / spacing with active design-system tokens; keep semantic shape unchanged.',
        risk: 'low',
      });
    }
  }

  // Step 1..N: per-leaf-component step (one step per leaf file in
  // the components/ tree). Each step bundles the leaf file with any
  // sibling stylesheet of the same basename.
  const leafFiles = args.ownership.filter((o) => o.layer === 'leaf' && /\.(?:tsx|jsx|ts|js|vue|svelte)$/.test(o.file));
  for (const f of leafFiles) {
    const sibling = findSiblingStylesheet(args.index, f.file);
    const files = sibling ? [f.file, sibling] : [f.file];
    steps.push({
      id: `rewrite-${slug(f.file)}`,
      files,
      rationale: `Rewrite ${f.file} per the user's intent${args.intent ? `: ${args.intent}` : ''}.`,
      risk: 'low',
    });
  }

  // Step N+1: shared / route refactors when present, marked medium.
  const sharedRouteFiles = args.ownership
    .filter((o) => o.layer === 'shared' || o.layer === 'route')
    .map((o) => o.file);
  if (sharedRouteFiles.length > 0) {
    steps.push({
      id: 'shared-and-route-touchups',
      files: sharedRouteFiles,
      rationale: 'Update shared infrastructure / route entry points to reflect leaf rewrites; cross-cutting changes only.',
      risk: 'medium',
    });
  }

  // Final step: build-test gate. patch-edit refuses to mark the
  // pipeline converged without this step's file list reaching
  // build.passing && tests.passing.
  steps.push({
    id: args.buildTestStepId,
    files: [],
    rationale: 'Run typecheck + tests; iterate until build.passing && tests.passing.',
    risk: 'low',
  });

  return steps;
}

function findSiblingStylesheet(index: CodeImportIndex, file: string): string | undefined {
  const dir = path.posix.dirname(file);
  const base = path.posix.basename(file).replace(/\.[^.]+$/, '');
  const candidates = [`${base}.css`, `${base}.scss`, `${base}.module.css`];
  for (const f of index.files) {
    const fdir = path.posix.dirname(f.path);
    if (fdir !== dir) continue;
    if (candidates.includes(path.posix.basename(f.path))) return f.path;
  }
  return undefined;
}

function slug(file: string): string {
  return file
    .replace(/^.*\//, '')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function canonicaliseIndex(index: CodeImportIndex): unknown {
  // Strip the walk-time fields (walkedAt / walkBudgetMs) and
  // skipped[] so the digest only changes when the file roster
  // changes. Otherwise re-walks would invalidate every plan even
  // when the source tree is identical.
  return {
    framework:      index.framework,
    packageManager: index.packageManager,
    styleSystem:    index.styleSystem,
    routes:         index.routes,
    files: index.files
      .map((f) => ({ path: f.path, language: f.language, size: f.size, imports: f.imports ?? [] }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  };
}

function digestObject(obj: unknown): string {
  return createHash('sha1').update(JSON.stringify(obj)).digest('hex');
}

function renderNarrative(args: {
  intent: string;
  ownership: OwnershipEntry[];
  steps: RewriteStep[];
  tokens: DesignExtractReport | undefined;
}): string {
  const lines: string[] = [];
  lines.push('# Rewrite plan');
  lines.push('');
  if (args.intent) {
    lines.push(`**Intent**: ${args.intent}`);
    lines.push('');
  }
  const tierCount = (tier: OwnershipTier) => args.ownership.filter((o) => o.layer === tier).length;
  lines.push('## Ownership snapshot');
  lines.push('');
  lines.push(`- shell:  ${tierCount('shell')} files`);
  lines.push(`- route:  ${tierCount('route')} files`);
  lines.push(`- shared: ${tierCount('shared')} files`);
  lines.push(`- leaf:   ${tierCount('leaf')} files`);
  lines.push('');
  if (args.tokens) {
    lines.push('## Design tokens detected');
    lines.push('');
    lines.push(`- colors:     ${args.tokens.colors.length}`);
    lines.push(`- typography: ${args.tokens.typography.length}`);
    lines.push(`- spacing:    ${args.tokens.spacing.length}`);
    lines.push(`- radius:     ${args.tokens.radius.length}`);
    lines.push(`- shadow:     ${args.tokens.shadow.length}`);
    lines.push('');
  }
  lines.push('## Steps');
  lines.push('');
  for (const step of args.steps) {
    lines.push(`### ${step.id} — risk: ${step.risk}`);
    lines.push('');
    lines.push(step.rationale);
    if (step.files.length > 0) {
      lines.push('');
      for (const f of step.files) lines.push(`- \`${f}\``);
    }
    lines.push('');
  }
  return lines.join('\n');
}
