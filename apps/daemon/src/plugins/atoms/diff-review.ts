// Phase 7-8 entry slice / spec §20.3 / §21.3.2 — diff-review atom.
//
// SKILL.md fragment ships at plugins/_official/atoms/diff-review/.
// The runner walks the project cwd's `plan/receipts/` directory,
// re-reads each touched file's current state, and emits the four
// files the SKILL.md fragment promises:
//
//   <cwd>/review/diff.patch     — concatenation of every receipt's
//                                  files in canonical 'unified diff'
//                                  shape, derived from a snapshot of
//                                  the original file content.
//   <cwd>/review/summary.md     — per-step walkthrough with stats.
//   <cwd>/review/decision.json  — { decision, accepted_files,
//                                  rejected_files, reviewer }
//   <cwd>/review/meta.json      — { generatedAt, atomDigest,
//                                  planRevision }
//
// `decision.json` is owned by the user-facing GenUI surface; this
// runner only generates the file when the caller passes an explicit
// decision (or when a previous decision exists at <cwd>/review/decision.json).
//
// The runner does NOT compute a real line-by-line diff — it relies
// on the receipts the patch-edit atom already wrote and just records
// the file list, before/after sizes, and added/removed counts. The
// SKILL.md fragment documents that the diff.patch artefact is a
// receipt-derived summary, not a precise hunk replay; precise hunks
// live in plan/receipts/<id>.json where the agent stored them.

import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { createHash } from 'node:crypto';
import type { PatchReceiptEntry, PatchStepRecord } from './patch-edit.js';

export type DiffReviewDecision = 'accept' | 'reject' | 'partial';
export type DiffReviewer = 'user' | 'agent';

export interface DiffReviewDecisionFile {
  decision: DiffReviewDecision;
  accepted_files: string[];
  rejected_files: string[];
  reviewer: DiffReviewer;
  reason?: string;
  decidedAt: string;
}

export interface DiffReviewMeta {
  generatedAt:    string;
  atomDigest:     string;
  planRevision:   number;
}

export interface DiffReviewReport {
  files:           string[];
  added:           number;
  removed:         number;
  receipts:        PatchReceiptEntry[];
  decision?:       DiffReviewDecisionFile;
  meta:            DiffReviewMeta;
}

export interface DiffReviewOptions {
  cwd: string;
  // Optional explicit decision. When omitted, the runner produces
  // the diff/summary/meta artefacts but leaves decision.json
  // untouched (so a GenUI surface can write it later).
  decision?: {
    decision: DiffReviewDecision;
    reviewer: DiffReviewer;
    accepted_files?: string[];
    rejected_files?: string[];
    reason?: string;
  };
}

export async function runDiffReview(opts: DiffReviewOptions): Promise<DiffReviewReport> {
  const cwd = path.resolve(opts.cwd);
  const planDir = path.join(cwd, 'plan');
  const receiptDir = path.join(planDir, 'receipts');
  const reviewDir = path.join(cwd, 'review');

  // Read steps.json so we can attribute each receipt to its step.
  let steps: PatchStepRecord[] = [];
  try {
    steps = JSON.parse(await fsp.readFile(path.join(planDir, 'steps.json'), 'utf8')) as PatchStepRecord[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  let receiptFiles: string[] = [];
  try {
    receiptFiles = await fsp.readdir(receiptDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  const receipts: PatchReceiptEntry[] = [];
  for (const fname of receiptFiles) {
    if (!fname.startsWith('step-') || !fname.endsWith('.json')) continue;
    try {
      const r = JSON.parse(await fsp.readFile(path.join(receiptDir, fname), 'utf8')) as PatchReceiptEntry;
      receipts.push(r);
    } catch {
      // skip malformed receipt
    }
  }
  // Stable sort: by step id so the diff.patch concatenation is
  // deterministic across runs.
  receipts.sort((a, b) => a.step.localeCompare(b.step));

  const fileSet = new Set<string>();
  let added = 0;
  let removed = 0;
  for (const r of receipts) {
    for (const f of r.files) fileSet.add(f);
    added += r.added;
    removed += r.removed;
  }
  const files = [...fileSet].sort();

  const meta: DiffReviewMeta = {
    generatedAt:  new Date().toISOString(),
    atomDigest:   digestObject({ receipts, files }),
    planRevision: steps.length,
  };

  await fsp.mkdir(reviewDir, { recursive: true });
  await fsp.writeFile(path.join(reviewDir, 'diff.patch'), renderDiffPatch(receipts, steps), 'utf8');
  await fsp.writeFile(path.join(reviewDir, 'summary.md'), renderSummary({ receipts, steps, added, removed }), 'utf8');
  await fsp.writeFile(path.join(reviewDir, 'meta.json'),  JSON.stringify(meta, null, 2) + '\n', 'utf8');

  let decisionFile: DiffReviewDecisionFile | undefined;
  // Honour an existing decision.json on disk.
  try {
    const raw = await fsp.readFile(path.join(reviewDir, 'decision.json'), 'utf8');
    decisionFile = JSON.parse(raw) as DiffReviewDecisionFile;
  } catch {
    decisionFile = undefined;
  }
  if (opts.decision) {
    decisionFile = composeDecisionFile(opts.decision, files);
    await fsp.writeFile(path.join(reviewDir, 'decision.json'), JSON.stringify(decisionFile, null, 2) + '\n', 'utf8');
  }

  const report: DiffReviewReport = {
    files,
    added,
    removed,
    receipts,
    meta,
  };
  if (decisionFile) report.decision = decisionFile;
  return report;
}

function composeDecisionFile(
  input: NonNullable<DiffReviewOptions['decision']>,
  allFiles: string[],
): DiffReviewDecisionFile {
  let accepted: string[];
  let rejected: string[];
  if (input.decision === 'accept') {
    accepted = input.accepted_files ?? allFiles.slice();
    rejected = input.rejected_files ?? [];
  } else if (input.decision === 'reject') {
    accepted = [];
    rejected = input.rejected_files ?? allFiles.slice();
  } else {
    accepted = input.accepted_files ?? [];
    rejected = input.rejected_files ?? [];
  }
  // Spec invariant: on 'partial' the union must equal the touched
  // file set so the reviewer cannot leave a file ambiguous.
  if (input.decision === 'partial') {
    const union = new Set([...accepted, ...rejected]);
    for (const f of allFiles) if (!union.has(f)) {
      throw new Error(`diff-review: 'partial' decision must cover every touched file; missing ${f}`);
    }
  }
  const decisionFile: DiffReviewDecisionFile = {
    decision:        input.decision,
    accepted_files:  [...new Set(accepted)].sort(),
    rejected_files:  [...new Set(rejected)].sort(),
    reviewer:        input.reviewer,
    decidedAt:       new Date().toISOString(),
  };
  if (input.reason) decisionFile.reason = input.reason;
  return decisionFile;
}

function renderDiffPatch(receipts: PatchReceiptEntry[], steps: PatchStepRecord[]): string {
  const stepIndex = new Map(steps.map((s) => [s.id, s]));
  const lines: string[] = [];
  for (const r of receipts) {
    const step = stepIndex.get(r.step);
    lines.push(`# step: ${r.step}`);
    if (step?.rationale) lines.push(`# rationale: ${step.rationale}`);
    if (r.rationale) lines.push(`# patch-rationale: ${r.rationale}`);
    lines.push(`# files: ${r.files.join(', ')}`);
    lines.push(`# +${r.added} -${r.removed}`);
    lines.push('');
  }
  return lines.join('\n');
}

function renderSummary(args: {
  receipts: PatchReceiptEntry[];
  steps: PatchStepRecord[];
  added: number;
  removed: number;
}): string {
  const lines: string[] = [];
  lines.push('# Patch review summary');
  lines.push('');
  lines.push(`- steps applied: ${args.receipts.length}`);
  lines.push(`- lines added:   ${args.added}`);
  lines.push(`- lines removed: ${args.removed}`);
  lines.push('');
  for (const r of args.receipts) {
    const step = args.steps.find((s) => s.id === r.step);
    lines.push(`## ${r.step}`);
    lines.push('');
    if (step?.risk) lines.push(`- risk: ${step.risk}`);
    if (step?.rationale) lines.push(`- step rationale: ${step.rationale}`);
    if (r.rationale) lines.push(`- patch rationale: ${r.rationale}`);
    lines.push(`- files (+${r.added} -${r.removed}):`);
    for (const f of r.files) lines.push(`  - \`${f}\``);
    lines.push('');
  }
  return lines.join('\n');
}

function digestObject(obj: unknown): string {
  return createHash('sha1').update(JSON.stringify(obj)).digest('hex');
}
