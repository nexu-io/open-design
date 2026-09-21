import path from 'node:path';

import type { RunArtifactDiff } from '../../run-artifact-fs.js';
import type { RunSideEffectLedger } from '../../runtimes/run-lifecycle-analytics.js';

/**
 * What the host itself saw one OD Next round write.
 *
 * Two sources, taken together. The filesystem diff (`run.artifactOutcome.diff`)
 * lists every artifact and render-dependency path it fingerprinted and only
 * counts files of other types; the tool-stream ledger lists every path a
 * Write/Edit tool reported, whatever its extension, but exists only on agents
 * that report tool events. A deliverable is any non-Markdown file, or
 * DESIGN.md on a brand (design-system) project — the definition that keeps a
 * "just change the stylesheet" follow-up from being judged unfinished.
 *
 * Files the user saved by hand while the round ran are subtracted from both
 * sources when the daemon knows about them (`userWrittenPaths`), so a manual
 * edit does not read as the agent's delivery.
 */
export interface StrategyRunWriteEvidence {
  /** The agent wrote a deliverable this round. */
  deliverableWritten: boolean;
  /** Files were written, but only notes (Markdown) or files of a type the diff cannot name. */
  noteOnly: boolean;
  /** Neither source could establish whether anything was written. */
  unknown: boolean;
  /** Distinct files of any type this round wrote (best of both sources). */
  filesWritten: number;
  /** Which sources contributed. */
  sources: ReadonlyArray<'filesystem' | 'tool_stream'>;
}

export interface StrategyWriteEvidenceRun {
  artifactOutcome?: {
    filesWritten?: number;
    filesWrittenUnknown?: boolean;
    filesWrittenSource?: 'filesystem' | 'tool_stream' | 'unknown';
    diff?: RunArtifactDiff;
  } | undefined;
  sideEffectLedger?: RunSideEffectLedger | undefined;
  /** Project-relative paths the user saved by hand while this run was active. */
  userWrittenPaths?: ReadonlySet<string> | undefined;
}

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdx']);

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function isMarkdownPath(filePath: string): boolean {
  return MARKDOWN_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isDesignSystemFilePath(filePath: string): boolean {
  return normalizePath(filePath).split('/').at(-1) === 'DESIGN.md';
}

function isUserWritten(filePath: string, userWritten: ReadonlySet<string> | undefined): boolean {
  if (!userWritten || userWritten.size === 0) return false;
  const normalized = normalizePath(filePath);
  for (const candidate of userWritten) {
    const relative = normalizePath(candidate);
    if (!relative) continue;
    if (normalized === relative || normalized.endsWith(`/${relative}`)) return true;
  }
  return false;
}

/**
 * Derive the round's write evidence from the run's settled artifact outcome
 * and its truncation-proof side-effect ledger. Pure: reads only what the run
 * lifecycle already folded onto the run object.
 */
export function strategyRunWriteEvidence(
  run: StrategyWriteEvidenceRun,
  options: { projectKind: string | null | undefined },
): StrategyRunWriteEvidence {
  const designSystemProject = options.projectKind === 'brand';
  const userWritten = run.userWrittenPaths;
  const diff = run.artifactOutcome?.diff;
  const ledger = run.sideEffectLedger;
  const sources: Array<'filesystem' | 'tool_stream'> = [];

  let deliverableWritten = false;
  let filesWritten = 0;

  if (ledger) {
    const ledgerPaths = [...ledger.writtenFilePaths].filter(
      (filePath) => !isUserWritten(filePath, userWritten),
    );
    if (ledgerPaths.length > 0 || ledger.toolCallSeen) sources.push('tool_stream');
    filesWritten = Math.max(filesWritten, ledgerPaths.length);
    if (ledgerPaths.some((filePath) => !isMarkdownPath(filePath))) deliverableWritten = true;
    if (
      designSystemProject
      && ledgerPaths.some((filePath) => isDesignSystemFilePath(filePath))
    ) deliverableWritten = true;
  }

  if (diff) {
    sources.push('filesystem');
    const trackedPaths = [...new Set([
      ...diff.touchedPaths,
      ...diff.renderDependencyTouchedPaths,
    ])].filter((filePath) => !isUserWritten(filePath, userWritten));
    filesWritten = Math.max(filesWritten, diff.filesWritten);
    if (trackedPaths.length > 0) deliverableWritten = true;
    if (designSystemProject && diff.designSystemCreated) deliverableWritten = true;
  } else if (
    !ledger
    && typeof run.artifactOutcome?.filesWritten === 'number'
  ) {
    // A tool-stream fallback count without a ledger (legacy run objects).
    filesWritten = Math.max(filesWritten, run.artifactOutcome.filesWritten);
    if (run.artifactOutcome.filesWrittenSource === 'tool_stream') sources.push('tool_stream');
  }

  const diffIncomplete = !diff || diff.filesWrittenUnknown === true;
  const ledgerSilent = !ledger || !ledger.toolCallSeen;
  const unknown = !deliverableWritten && filesWritten === 0 && diffIncomplete && ledgerSilent;
  const noteOnly = !deliverableWritten && filesWritten > 0;
  return { deliverableWritten, noteOnly, unknown, filesWritten, sources };
}
