// Phase 7 entry slice / spec §20.3 / §21.3.2 — patch-edit atom.
//
// SKILL.md fragment ships at plugins/_official/atoms/patch-edit/.
// The runner applies a unified diff to a project cwd one step at a
// time, enforcing the safety contract:
//
//   - The diff may only touch files listed in the matching
//     plan/steps.json entry.
//   - It may NOT touch a file classified as 'shell' tier in
//     plan/ownership.json unless the matching step's risk='high'.
//   - It refuses to introduce new files outside the step's files[].
//   - It writes per-step receipts under plan/receipts/<id>.json.
//   - It updates plan/steps.json's status field per step
//     (pending → completed | skipped | failed).
//
// The diff format is a strict subset of unified diff:
//
//   --- a/path/to/file
//   +++ b/path/to/file
//   @@ -start,len +start,len @@
//   ␣context line
//   -removed line
//   +added line
//
// Multiple files are supported in one patch; the parser splits on
// `--- a/` markers. For new-file creation, callers use:
//
//   --- /dev/null
//   +++ b/path/to/new-file
//   @@ -0,0 +1,N @@
//   +new line 1
//   +new line 2
//
// For file deletion:
//
//   --- a/path/to/old-file
//   +++ /dev/null
//   @@ -1,N +0,0 @@
//   -old line
//
// The applier validates context lines to catch stale patches.

import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { OwnershipEntry, RewriteStep } from './rewrite-plan.js';

// Plan §3.Z1 — atomic file write helper.
//
// Writes the body to a sibling temp file (`<path>.<random>.tmp`)
// and renames into place. POSIX rename(2) is atomic when source
// and destination are on the same filesystem, so a partial write
// never leaves the consumer staring at a half-truncated file.
//
// The temp file is removed on the failure path so a crash mid-
// write doesn't leak an orphan tmp blob next to every plan step.
async function atomicWriteFile(target: string, body: string | Buffer): Promise<void> {
  const dir = path.dirname(target);
  const base = path.basename(target);
  const tmp = path.join(dir, `${base}.${randomBytes(6).toString('hex')}.tmp`);
  await fsp.mkdir(dir, { recursive: true });
  try {
    await fsp.writeFile(tmp, body);
    await fsp.rename(tmp, target);
  } catch (err) {
    // Best-effort cleanup of the orphan tmp file. We intentionally
    // swallow the unlink error; rename failure is what the caller
    // needs to see.
    try { await fsp.unlink(tmp); } catch { /* tmp may not exist */ }
    throw err;
  }
}

export type PatchStepStatus = 'pending' | 'completed' | 'skipped' | 'failed';

export interface PatchStepRecord extends Omit<RewriteStep, 'rationale'> {
  rationale?: string;
  status?: PatchStepStatus;
  completedAt?: string;
}

export interface PatchReceiptEntry {
  step:        string;
  files:       string[];
  added:       number;
  removed:     number;
  rationale:   string;
  completedAt: string;
}

export interface ApplyPatchInput {
  // Project cwd (the directory plan/steps.json lives under and the
  // diff applies inside).
  cwd: string;
  // The step id in plan/steps.json this patch is supposed to satisfy.
  stepId: string;
  // The unified diff text. May contain multiple file hunks.
  diff: string;
  // Free-text rationale recorded into the receipt.
  rationale?: string;
  // When true (default false), allow file creation outside the
  // step's files[]. Typical use: tests adding fixtures.
  allowOutOfStepCreation?: boolean;
}

export interface ApplyPatchResult {
  status:      'completed' | 'skipped' | 'failed';
  filesTouched: string[];
  added:       number;
  removed:     number;
  // When status='failed' or 'skipped', a structured reason the
  // pipeline runner can surface to the agent.
  reason?:     string;
}

export interface SkipStepInput {
  cwd:        string;
  stepId:     string;
  rationale:  string;
}

export async function applyPatchForStep(input: ApplyPatchInput): Promise<ApplyPatchResult> {
  const cwd = path.resolve(input.cwd);
  const stepsPath = path.join(cwd, 'plan', 'steps.json');
  const ownershipPath = path.join(cwd, 'plan', 'ownership.json');

  const steps = await readJson<PatchStepRecord[]>(stepsPath, 'patch-edit: missing plan/steps.json (run rewrite-plan first)');
  const ownership = await readJson<OwnershipEntry[]>(ownershipPath, 'patch-edit: missing plan/ownership.json (run rewrite-plan first)').catch(() => [] as OwnershipEntry[]);

  const step = steps.find((s) => s.id === input.stepId);
  if (!step) {
    return { status: 'failed', filesTouched: [], added: 0, removed: 0, reason: `unknown step '${input.stepId}'` };
  }
  if (step.status === 'completed' || step.status === 'skipped' || step.status === 'failed') {
    return { status: step.status === 'completed' ? 'completed' : 'skipped', filesTouched: [], added: 0, removed: 0,
             reason: `step already in terminal state '${step.status}'` };
  }

  const allowedFiles = new Set(step.files);
  const ownershipMap = new Map(ownership.map((o) => [o.file, o.layer]));
  const hunks = parseUnifiedDiff(input.diff);
  if (hunks.length === 0) {
    return { status: 'failed', filesTouched: [], added: 0, removed: 0, reason: 'patch contained no hunks' };
  }
  // Validate before touching disk: every hunk's target file must be
  // in the step's files[] (unless allowOutOfStepCreation), and shell
  // tier files require risk='high'.
  for (const hunk of hunks) {
    const target = hunk.targetFile;
    const source = hunk.sourceFile;
    // For deletions, source carries the file id and target is null.
    // For everything else, target is the touched file.
    const touched = target ?? source;
    if (!touched) {
      return { status: 'failed', filesTouched: [], added: 0, removed: 0, reason: 'hunk missing both source and target file' };
    }
    const isCreate = source === null;
    if (!allowedFiles.has(touched)) {
      if (!(isCreate && input.allowOutOfStepCreation)) {
        return { status: 'failed', filesTouched: [], added: 0, removed: 0,
                 reason: `hunk targets ${touched} which is not in step.files[]` };
      }
    }
    const layer = ownershipMap.get(touched);
    if (layer === 'shell' && step.risk !== 'high') {
      return { status: 'failed', filesTouched: [], added: 0, removed: 0,
               reason: `step risk='${step.risk}' may not touch shell-tier file ${touched}; promote risk to 'high' or move the change` };
    }
  }

  // Apply each hunk.
  const filesTouched = new Set<string>();
  let added = 0;
  let removed = 0;
  for (const hunk of hunks) {
    try {
      const result = await applyOneFileHunks(cwd, hunk);
      filesTouched.add(hunk.targetFile ?? hunk.sourceFile!);
      added += result.added;
      removed += result.removed;
    } catch (err) {
      const touched = hunk.targetFile ?? hunk.sourceFile ?? '<unknown>';
      return { status: 'failed', filesTouched: [...filesTouched], added, removed,
               reason: `hunk apply failed for ${touched}: ${(err as Error).message}` };
    }
  }

  // Mark the step completed in plan/steps.json + write a receipt.
  step.status = 'completed';
  step.completedAt = new Date().toISOString();
  if (input.rationale) step.rationale = input.rationale;
  await atomicWriteFile(stepsPath, JSON.stringify(steps, null, 2) + '\n');
  const receiptDir = path.join(cwd, 'plan', 'receipts');
  await fsp.mkdir(receiptDir, { recursive: true });
  const receipt: PatchReceiptEntry = {
    step:        step.id,
    files:       [...filesTouched].sort(),
    added,
    removed,
    rationale:   input.rationale ?? '',
    completedAt: step.completedAt,
  };
  await atomicWriteFile(
    path.join(receiptDir, `step-${step.id}.json`),
    JSON.stringify(receipt, null, 2) + '\n',
  );

  return { status: 'completed', filesTouched: [...filesTouched], added, removed };
}

export async function skipStep(input: SkipStepInput): Promise<void> {
  const cwd = path.resolve(input.cwd);
  const stepsPath = path.join(cwd, 'plan', 'steps.json');
  const steps = await readJson<PatchStepRecord[]>(stepsPath, 'patch-edit: missing plan/steps.json');
  const step = steps.find((s) => s.id === input.stepId);
  if (!step) throw new Error(`patch-edit: unknown step '${input.stepId}'`);
  step.status = 'skipped';
  step.completedAt = new Date().toISOString();
  step.rationale = input.rationale;
  await atomicWriteFile(stepsPath, JSON.stringify(steps, null, 2) + '\n');
  const receiptDir = path.join(cwd, 'plan', 'receipts');
  await fsp.mkdir(receiptDir, { recursive: true });
  const receipt: PatchReceiptEntry = {
    step:        step.id,
    files:       [],
    added:       0,
    removed:     0,
    rationale:   input.rationale,
    completedAt: step.completedAt,
  };
  await atomicWriteFile(
    path.join(receiptDir, `step-${step.id}.json`),
    JSON.stringify(receipt, null, 2) + '\n',
  );
}

// --- diff parsing -----------------------------------------------------

interface FileHunkBundle {
  sourceFile: string | null; // null when /dev/null (file creation)
  targetFile: string | null; // null when /dev/null (file deletion)
  hunks: ParsedHunk[];
}

interface ParsedHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  body: string[];        // diff body lines (excluding the @@ header)
}

function parseUnifiedDiff(diff: string): FileHunkBundle[] {
  // Split on '\n--- ' markers (keeping the first marker on the
  // leading section). We also accept input that begins with '---'
  // directly.
  const lines = diff.split(/\r?\n/);
  const bundles: FileHunkBundle[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (!line.startsWith('--- ')) { i++; continue; }
    const sourcePath = parsePathLine(line);
    const next = lines[i + 1] ?? '';
    if (!next.startsWith('+++ ')) {
      throw new Error(`expected '+++ ' after '--- ' at line ${i + 1}`);
    }
    const targetPath = parsePathLine(next);
    i += 2;
    const hunks: ParsedHunk[] = [];
    while (i < lines.length) {
      const cursor = lines[i] ?? '';
      if (cursor.startsWith('--- ')) break;
      if (cursor.startsWith('@@ ')) {
        const header = parseHunkHeader(cursor);
        i++;
        const body: string[] = [];
        while (i < lines.length) {
          const c = lines[i] ?? '';
          if (c.startsWith('--- ') || c.startsWith('@@ ')) break;
          body.push(c);
          i++;
        }
        hunks.push({ ...header, body });
        continue;
      }
      i++;
    }
    bundles.push({
      sourceFile: sourcePath === '/dev/null' ? null : sourcePath,
      targetFile: targetPath === '/dev/null' ? null : targetPath,
      hunks,
    });
  }
  return bundles;
}

function parsePathLine(line: string): string {
  const after = line.slice(4).trim();
  if (after === '/dev/null') return '/dev/null';
  // Strip the 'a/' or 'b/' prefix when present.
  if (after.startsWith('a/')) return after.slice(2);
  if (after.startsWith('b/')) return after.slice(2);
  return after;
}

function parseHunkHeader(line: string): { oldStart: number; oldLines: number; newStart: number; newLines: number } {
  const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
  if (!m) throw new Error(`malformed hunk header: ${line}`);
  return {
    oldStart: parseInt(m[1]!, 10),
    oldLines: m[2] ? parseInt(m[2], 10) : 1,
    newStart: parseInt(m[3]!, 10),
    newLines: m[4] ? parseInt(m[4], 10) : 1,
  };
}

function resolvePatchFile(cwd: string, file: string): string {
  const unsafe = `unsafe path '${file}'`;
  if (file.includes('\0')) throw new Error(unsafe);
  if (/^[A-Za-z]:/.test(file)) throw new Error(unsafe);
  if (path.isAbsolute(file) || path.win32.isAbsolute(file) || path.posix.isAbsolute(file)) {
    throw new Error(unsafe);
  }
  if (file.replace(/\\/g, '/').split('/').some((segment) => segment === '..')) {
    throw new Error(unsafe);
  }
  const abs = path.resolve(cwd, file);
  const relative = path.relative(cwd, abs);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(unsafe);
  }
  return abs;
}

async function applyOneFileHunks(cwd: string, bundle: FileHunkBundle): Promise<{ added: number; removed: number }> {
  if (bundle.sourceFile === null && bundle.targetFile === null) {
    throw new Error('hunk has /dev/null on both sides');
  }
  const sourceAbs = bundle.sourceFile === null ? null : resolvePatchFile(cwd, bundle.sourceFile);
  const targetAbs = bundle.targetFile === null ? null : resolvePatchFile(cwd, bundle.targetFile);

  if (bundle.targetFile === null) {
    // File deletion.
    let body: string;
    try { body = await fsp.readFile(sourceAbs!, 'utf8'); } catch { throw new Error(`file not found: ${bundle.sourceFile}`); }
    await fsp.unlink(sourceAbs!);
    return { added: 0, removed: body.split('\n').length };
  }

  if (bundle.sourceFile === null) {
    // File creation.
    await fsp.mkdir(path.dirname(targetAbs!), { recursive: true });
    let added = 0;
    const lines: string[] = [];
    for (const hunk of bundle.hunks) {
      for (const l of hunk.body) {
        if (l.startsWith('+')) { lines.push(l.slice(1)); added++; }
        else if (l === '' || l.startsWith('\\')) { /* trailing newline marker */ }
      }
    }
    await atomicWriteFile(targetAbs!, lines.join('\n') + (lines.length > 0 ? '\n' : ''));
    return { added, removed: 0 };
  }

  // Plain edit.
  let original: string;
  try { original = await fsp.readFile(targetAbs!, 'utf8'); } catch { throw new Error(`file not found: ${bundle.targetFile}`); }
  const originalLines = original.split('\n');
  // Trailing newline produces an empty last element after split; we
  // preserve that and add it back at the end.
  const trailingNL = original.endsWith('\n');
  if (trailingNL) originalLines.pop();

  // Apply hunks in reverse order so prior offsets stay valid.
  const hunks = [...bundle.hunks].sort((a, b) => b.oldStart - a.oldStart);
  let added = 0;
  let removed = 0;
  let working = originalLines.slice();
  for (const hunk of hunks) {
    const oldIndex = hunk.oldStart - 1;
    const result = applyHunkBody(working, oldIndex, hunk.body);
    added += result.added;
    removed += result.removed;
    working = result.working;
  }
  const final = working.join('\n') + (trailingNL ? '\n' : '');
  await atomicWriteFile(targetAbs!, final);
  return { added, removed };
}

function applyHunkBody(lines: string[], oldIndex: number, body: string[]): { working: string[]; added: number; removed: number } {
  // Walk the body: '-' / ' ' lines must match `lines[i]`; '+' lines
  // are inserts.
  const before = lines.slice(0, oldIndex);
  const after: string[] = [];
  const replacement: string[] = [];
  let cursor = oldIndex;
  let added = 0;
  let removed = 0;
  for (const raw of body) {
    if (raw === '' || raw.startsWith('\\')) continue;
    const tag = raw[0];
    const content = raw.slice(1);
    if (tag === ' ') {
      if (lines[cursor] !== content) {
        throw new Error(`context mismatch at line ${cursor + 1}: expected ${JSON.stringify(content)} got ${JSON.stringify(lines[cursor])}`);
      }
      replacement.push(content);
      cursor++;
    } else if (tag === '-') {
      if (lines[cursor] !== content) {
        throw new Error(`removal mismatch at line ${cursor + 1}: expected ${JSON.stringify(content)} got ${JSON.stringify(lines[cursor])}`);
      }
      cursor++;
      removed++;
    } else if (tag === '+') {
      replacement.push(content);
      added++;
    } else {
      // Unknown line tag; treat as context for safety.
      replacement.push(raw);
      cursor++;
    }
  }
  for (const l of lines.slice(cursor)) after.push(l);
  return { working: [...before, ...replacement, ...after], added, removed };
}

async function readJson<T>(p: string, missingMsg: string): Promise<T> {
  try {
    return JSON.parse(await fsp.readFile(p, 'utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(missingMsg);
    throw err;
  }
}

// --- aggregate progress helper ---------------------------------------

export async function readPlanProgress(cwd: string): Promise<{ total: number; terminal: number }> {
  const stepsPath = path.join(cwd, 'plan', 'steps.json');
  const steps = await readJson<PatchStepRecord[]>(stepsPath, 'plan/steps.json missing');
  const terminal = steps.filter((s) => s.status === 'completed' || s.status === 'skipped' || s.status === 'failed').length;
  return { total: steps.length, terminal };
}
