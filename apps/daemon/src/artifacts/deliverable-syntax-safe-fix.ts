import {
  type DeliverableSyntaxDiagnostic,
  type DeliverableSyntaxSafeFixRule,
} from '@open-design/contracts';
import { load } from 'cheerio';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { DeliverableSyntaxResult } from './deliverable-syntax.js';

export interface DeliverableSyntaxSafeFixPatch {
  content: string;
  expectedDiskContent: string;
  file: string;
  mode: number;
  rule: DeliverableSyntaxSafeFixRule;
  targetPath: string;
}

export type DeliverableSyntaxSafeFixProposal =
  | {
      action: 'proposed';
      patch: DeliverableSyntaxSafeFixPatch;
    }
  | {
      action: 'none';
      reason:
        | 'ambiguous_diagnostic'
        | 'file_unreadable'
        | 'path_outside_project'
        | 'unsupported_syntax_error';
    };

export type DeliverableSyntaxSafeFixCommitResult =
  | { action: 'committed' }
  | { action: 'none'; reason: 'concurrent_modification' | 'write_failed' };

interface SourceSegment {
  end: number;
  start: number;
}

interface ScanResult {
  delimiterStack: Array<'(' | '[' | '{'>;
  state:
    | 'base'
    | 'block_comment'
    | 'double_quote'
    | 'line_comment'
    | 'single_quote'
    | 'template';
  stringOpenedAt: number | null;
  templateHasExpression: boolean;
}

const CLOSING_DELIMITER = {
  '(': ')',
  '[': ']',
  '{': '}',
} as const;

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

function offsetAt(source: string, line: number, column: number): number | null {
  if (!Number.isInteger(line) || line < 1 || !Number.isInteger(column) || column < 1) {
    return null;
  }
  let offset = 0;
  for (let currentLine = 1; currentLine < line; currentLine += 1) {
    const newline = source.indexOf('\n', offset);
    if (newline < 0) return null;
    offset = newline + 1;
  }
  const candidate = offset + column - 1;
  return candidate <= source.length ? candidate : null;
}

function inlineScriptSegment(source: string, diagnosticOffset: number | null): SourceSegment | null {
  if (diagnosticOffset === null) return null;
  const $ = load(source, { sourceCodeLocationInfo: true });
  for (const node of $('script').toArray()) {
    const location = (node as typeof node & {
      sourceCodeLocation?: {
        startTag?: { endOffset: number };
        endTag?: { startOffset: number };
      };
    }).sourceCodeLocation;
    const start = location?.startTag?.endOffset;
    const end = location?.endTag?.startOffset;
    if (start === undefined || end === undefined) continue;
    if (diagnosticOffset >= start && diagnosticOffset <= end) return { start, end };
  }
  return null;
}

function sourceSegment(
  source: string,
  diagnostic: DeliverableSyntaxDiagnostic,
): SourceSegment | null {
  if (diagnostic.source === 'file') return { start: 0, end: source.length };
  if (diagnostic.source !== 'inline_script') return null;
  const diagnosticOffset = diagnostic.line !== null && diagnostic.column !== null
    ? offsetAt(source, diagnostic.line, diagnostic.column)
    : null;
  return inlineScriptSegment(source, diagnosticOffset);
}

function scanJavaScript(source: string, end: number): ScanResult | null {
  const delimiterStack: ScanResult['delimiterStack'] = [];
  let state: ScanResult['state'] = 'base';
  let escaped = false;
  let stringOpenedAt: number | null = null;
  let templateHasExpression = false;

  for (let index = 0; index < end; index += 1) {
    const current = source[index]!;
    const next = source[index + 1];
    if (state === 'line_comment') {
      if (current === '\n' || current === '\r') state = 'base';
      continue;
    }
    if (state === 'block_comment') {
      if (current === '*' && next === '/') {
        state = 'base';
        index += 1;
      }
      continue;
    }
    if (state === 'single_quote' || state === 'double_quote') {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (current === '\\') {
        escaped = true;
        continue;
      }
      if (
        (state === 'single_quote' && current === "'")
        || (state === 'double_quote' && current === '"')
      ) {
        state = 'base';
        stringOpenedAt = null;
      }
      continue;
    }
    if (state === 'template') {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (current === '\\') {
        escaped = true;
        continue;
      }
      if (current === '$' && next === '{') templateHasExpression = true;
      if (current === '`') state = 'base';
      continue;
    }
    if (current === '/' && next === '/') {
      state = 'line_comment';
      index += 1;
      continue;
    }
    if (current === '/' && next === '*') {
      state = 'block_comment';
      index += 1;
      continue;
    }
    // A slash outside comments may begin a regular expression. Delimiters
    // inside regex literals are not JavaScript grouping tokens, so decline
    // instead of relying on a lexer heuristic.
    if (current === '/') return null;
    if (current === "'") {
      state = 'single_quote';
      stringOpenedAt = index;
      continue;
    }
    if (current === '"') {
      state = 'double_quote';
      stringOpenedAt = index;
      continue;
    }
    if (current === '`') {
      state = 'template';
      templateHasExpression = false;
      continue;
    }
    if (current === '(' || current === '[' || current === '{') {
      delimiterStack.push(current);
      continue;
    }
    if (current === ')' || current === ']' || current === '}') {
      const open = delimiterStack.pop();
      if (!open || CLOSING_DELIMITER[open] !== current) return null;
    }
  }
  return { delimiterStack, state, stringOpenedAt, templateHasExpression };
}

function insertAt(source: string, offset: number, value: string): string {
  return `${source.slice(0, offset)}${value}${source.slice(offset)}`;
}

function proposePatch(input: {
  diagnostic: DeliverableSyntaxDiagnostic;
  segment: SourceSegment;
  source: string;
}): { content: string; rule: DeliverableSyntaxSafeFixRule } | null {
  const { diagnostic, segment, source } = input;
  const segmentText = source.slice(segment.start, segment.end);
  if (diagnostic.code === 'JS_UNTERMINATED_COMMENT') {
    const scan = scanJavaScript(segmentText, segmentText.length);
    return scan?.state === 'block_comment'
      ? {
          content: insertAt(source, segment.end, '*/'),
          rule: 'close_unterminated_block_comment',
        }
      : null;
  }
  if (diagnostic.code === 'JS_UNTERMINATED_TEMPLATE') {
    const scan = scanJavaScript(segmentText, segmentText.length);
    return scan?.state === 'template' && !scan.templateHasExpression
      ? {
          content: insertAt(source, segment.end, '`'),
          rule: 'close_unterminated_template',
        }
      : null;
  }
  if (diagnostic.code === 'JS_UNTERMINATED_STRING') {
    const scan = scanJavaScript(segmentText, segmentText.length);
    if (
      !scan
      || (scan.state !== 'single_quote' && scan.state !== 'double_quote')
      || scan.stringOpenedAt === null
      || /[\r\n]/u.test(segmentText.slice(scan.stringOpenedAt))
    ) {
      return null;
    }
    return {
      content: insertAt(source, segment.end, scan.state === 'single_quote' ? "'" : '"'),
      rule: 'close_unterminated_string',
    };
  }
  if (
    diagnostic.code !== 'JS_UNEXPECTED_TOKEN'
    || diagnostic.line === null
    || diagnostic.column === null
  ) {
    return null;
  }
  const absoluteDiagnosticOffset = offsetAt(source, diagnostic.line, diagnostic.column);
  if (
    absoluteDiagnosticOffset === null
    || absoluteDiagnosticOffset < segment.start
    || absoluteDiagnosticOffset > segment.end
  ) {
    return null;
  }
  const localOffset = absoluteDiagnosticOffset - segment.start;
  const scan = scanJavaScript(segmentText, localOffset);
  if (!scan || scan.state !== 'base') return null;
  const open = scan.delimiterStack.at(-1);
  if (!open) return null;
  const current = segmentText[localOffset];
  if (current !== undefined && !/^[,;\)\]\}]$/u.test(current)) return null;
  return {
    content: insertAt(source, absoluteDiagnosticOffset, CLOSING_DELIMITER[open]),
    rule: 'insert_missing_closing_delimiter',
  };
}

/**
 * Propose one syntax-only patch without mutating the project. Unsupported or
 * ambiguous diagnostics return `none`, and callers can validate the staged
 * content before committing it.
 */
export async function proposeDeliverableSyntaxSafeFix(input: {
  contentOverrides?: ReadonlyMap<string, string>;
  projectRoot: string;
  result: Extract<DeliverableSyntaxResult, { status: 'repairable' }>;
}): Promise<DeliverableSyntaxSafeFixProposal> {
  if (
    input.result.diagnostics.length !== 1
    || !input.result.diagnostics[0]?.code.startsWith('JS_')
  ) {
    return { action: 'none', reason: 'ambiguous_diagnostic' };
  }
  const diagnostic = input.result.diagnostics[0];
  const projectRoot = path.resolve(input.projectRoot);
  const target = path.resolve(projectRoot, diagnostic.file);
  if (!isInside(projectRoot, target)) {
    return { action: 'none', reason: 'path_outside_project' };
  }

  let projectRootReal: string;
  let targetReal: string;
  let diskContent: string;
  let mode: number;
  try {
    const values = await Promise.all([
      fs.realpath(projectRoot),
      fs.realpath(target),
      fs.readFile(target, 'utf8'),
      fs.stat(target),
    ]);
    [projectRootReal, targetReal, diskContent] = values;
    mode = values[3].mode;
  } catch {
    return { action: 'none', reason: 'file_unreadable' };
  }
  if (!isInside(projectRootReal, targetReal)) {
    return { action: 'none', reason: 'path_outside_project' };
  }

  const source = input.contentOverrides?.get(diagnostic.file) ?? diskContent;
  const segment = sourceSegment(source, diagnostic);
  if (!segment) return { action: 'none', reason: 'unsupported_syntax_error' };
  const proposed = proposePatch({ diagnostic, segment, source });
  if (!proposed || proposed.content === source) {
    return { action: 'none', reason: 'unsupported_syntax_error' };
  }
  return {
    action: 'proposed',
    patch: {
      content: proposed.content,
      expectedDiskContent: diskContent,
      file: diagnostic.file,
      mode,
      rule: proposed.rule,
      targetPath: targetReal,
    },
  };
}

/**
 * Commit a fully verified staged patch using two content checks around a
 * sibling fsynced temporary file, followed by an atomic rename. This narrows
 * the concurrent-edit window without claiming an OS-level compare-and-swap.
 */
export async function commitDeliverableSyntaxSafeFix(
  patch: DeliverableSyntaxSafeFixPatch,
): Promise<DeliverableSyntaxSafeFixCommitResult> {
  let current: string;
  try {
    current = await fs.readFile(patch.targetPath, 'utf8');
  } catch {
    return { action: 'none', reason: 'write_failed' };
  }
  if (current !== patch.expectedDiskContent) {
    return { action: 'none', reason: 'concurrent_modification' };
  }

  const directory = path.dirname(patch.targetPath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(patch.targetPath)}.od-syntax-${randomBytes(6).toString('hex')}.tmp`,
  );
  try {
    const handle = await fs.open(temporaryPath, 'wx', patch.mode);
    try {
      await handle.writeFile(patch.content, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }

    // Check again immediately before the atomic replacement so an Agent or
    // external editor cannot be overwritten after the first comparison.
    const beforeRename = await fs.readFile(patch.targetPath, 'utf8');
    if (beforeRename !== patch.expectedDiskContent) {
      await fs.unlink(temporaryPath).catch(() => undefined);
      return { action: 'none', reason: 'concurrent_modification' };
    }
    await fs.rename(temporaryPath, patch.targetPath);
    return { action: 'committed' };
  } catch {
    await fs.unlink(temporaryPath).catch(() => undefined);
    return { action: 'none', reason: 'write_failed' };
  }
}
