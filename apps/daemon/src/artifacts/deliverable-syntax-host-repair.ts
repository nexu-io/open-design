import fs from 'node:fs/promises';
import path from 'node:path';

import type { DeliverableSyntaxRepairState } from '@open-design/contracts';

import type { DeliverableSyntaxResult } from './deliverable-syntax.js';

const MAX_SNIPPET_FILES = 3;
const SNIPPET_RADIUS = 20;
const MAX_SNIPPET_BYTES = 256 * 1024;

export interface HostManagedSyntaxRepairInvocation {
  prompt: string;
  expectedCandidateHash: string;
  repairState: DeliverableSyntaxRepairState;
}

function portablePath(value: string): string {
  return value.replaceAll('\\', '/');
}

/** Return every physical repair write that escaped the diagnosed file set. */
export function unexpectedHostSyntaxRepairPaths(input: {
  touchedPaths: readonly string[];
  allowedPaths: readonly string[];
}): string[] {
  const allowed = new Set(input.allowedPaths.map(portablePath));
  return input.touchedPaths
    .map(portablePath)
    .filter((candidate) => !allowed.has(candidate));
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

async function renderLocalSnippet(input: {
  projectRoot: string;
  file: string;
  line: number | null;
}): Promise<string | null> {
  const root = path.resolve(input.projectRoot);
  const target = path.resolve(root, input.file);
  if (!isInside(root, target)) return null;

  let rootReal: string;
  let targetReal: string;
  let source: string;
  try {
    [rootReal, targetReal] = await Promise.all([fs.realpath(root), fs.realpath(target)]);
    if (!isInside(rootReal, targetReal)) return null;
    const stat = await fs.stat(targetReal);
    if (!stat.isFile() || stat.size > MAX_SNIPPET_BYTES) return null;
    source = await fs.readFile(targetReal, 'utf8');
  } catch {
    return null;
  }

  const lines = source.split(/\r?\n/u);
  const focus = Number.isInteger(input.line) && Number(input.line) > 0
    ? Math.min(lines.length, Number(input.line))
    : 1;
  const start = Math.max(1, focus - SNIPPET_RADIUS);
  const end = Math.min(lines.length, focus + SNIPPET_RADIUS);
  const numbered = lines
    .slice(start - 1, end)
    .map((line, index) => `${start + index} | ${line}`)
    .join('\n');
  return [
    `<file path="${escapeXml(input.file)}" lines="${start}-${end}">`,
    escapeXml(numbered),
    '</file>',
  ].join('\n');
}

/**
 * Build the complete short-context prompt for a fresh repair executor.
 * The host supplies only deterministic syntax evidence plus bounded source
 * windows; the original conversation and generation prompt are intentionally
 * absent.
 */
export async function buildHostManagedSyntaxRepairInvocation(input: {
  projectRoot: string;
  result: Extract<DeliverableSyntaxResult, { status: 'repairable' }>;
  repairState: DeliverableSyntaxRepairState;
}): Promise<HostManagedSyntaxRepairInvocation> {
  const uniqueFiles = new Map<string, number | null>();
  for (const diagnostic of input.result.diagnostics) {
    if (!uniqueFiles.has(diagnostic.file)) {
      uniqueFiles.set(diagnostic.file, diagnostic.line);
    }
    if (uniqueFiles.size >= MAX_SNIPPET_FILES) break;
  }
  const snippets = (
    await Promise.all(
      [...uniqueFiles].map(([file, line]) => renderLocalSnippet({
        projectRoot: input.projectRoot,
        file,
        line,
      })),
    )
  ).filter((value): value is string => Boolean(value));
  const diagnostics = input.result.diagnostics.map((diagnostic) => (
    `- ${diagnostic.file}:${diagnostic.line ?? '?'}:${diagnostic.column ?? '?'} `
    + `[${diagnostic.code}/${diagnostic.source}] ${diagnostic.message}`
  ));

  return {
    expectedCandidateHash: input.result.candidateHash,
    repairState: input.repairState,
    prompt: [
      `<open_design_host_syntax_repair schema="v1" attempt="${input.repairState.attempt}" max_attempts="${input.repairState.maxAttempts}" candidate_hash="${escapeXml(input.result.candidateHash)}">`,
      'This is an internal, short-context syntax repair invocation. The host has already completed the user task and independently found the parse error below.',
      'Use the native file-editing tool to make the smallest local correction in the existing file. Touch only files named by the diagnostics. Do not redesign, review, explain, inspect unrelated files, or create another deliverable.',
      'Do not run tests, scripts, node --check, or any syntax-check command. The host will re-check the candidate after this invocation exits.',
      'After the minimal edit, stop immediately.',
      '',
      '<diagnostics>',
      ...diagnostics.map(escapeXml),
      '</diagnostics>',
      ...(snippets.length > 0 ? ['', '<local_context>', ...snippets, '</local_context>'] : []),
      '</open_design_host_syntax_repair>',
    ].join('\n'),
  };
}
