/** @module token-contract-rebuild
 * Assesses a design system's token quality report and prepares a rebuild revision when A1 evidence is weak.
 * Reads the token contract report, scores against thresholds, and generates a rebuild-request artifact for agent review.
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { DesignSystemTokenContractRebuildDecision } from '@open-design/contracts';
import type { DesignSystemRevisionFileChange } from '../core/index.js';

export type DesignTokenContractRebuildPreparation = {
  decision: DesignSystemTokenContractRebuildDecision;
  revision?: {
    feedback: string;
    sectionTitle: string;
    baseBody: string;
    proposedBody: string;
    fileChanges: DesignSystemRevisionFileChange[];
  };
};

type PrepareOptions = {
  force?: boolean;
  now?: Date;
};

type TokenContractReport = {
  contract?: string;
  summary?: {
    score?: number;
    grade?: 'excellent' | 'usable' | 'needs-review' | 'needs-rebuild';
    recommendRebuild?: boolean;
    sourceBackedA1?: number;
    requiredA1?: number;
    fallbackTokens?: number;
    declaredTokens?: number;
  };
  selfCheck?: {
    ok?: boolean;
    errors?: string[];
    warnings?: string[];
  };
  tokens?: Array<{
    name?: string;
    layer?: string;
    confidence?: string;
    reason?: string;
    sources?: string[];
  }>;
};

const KEY_A1_TOKENS = new Set(['--bg', '--surface', '--fg', '--accent']);
const WEAK_CONFIDENCE = new Set(['low', 'fallback', 'alias']);

/**
 * Reads a design system's token contract quality report and decides whether a rebuild is recommended based on A1 coverage and fallback ratios.
 * If recommended or forced, returns a revision with feedback and a rebuild-request artifact for agent review.
 */
export async function prepareDesignTokenContractRebuild(
  root: string,
  id: string,
  options: PrepareOptions = {},
): Promise<DesignTokenContractRebuildPreparation> {
  const dirId = sanitizeDesignSystemId(id);
  if (!dirId) {
    return {
      decision: unavailableDecision(id, options.force === true, 'Editable user design system id is invalid.'),
    };
  }

  const baseDir = path.join(root, dirId);
  const designPath = path.join(baseDir, 'DESIGN.md');
  let baseBody = '';
  try {
    const designStats = await stat(designPath);
    if (!designStats.isFile()) {
      return {
        decision: unavailableDecision(`user:${dirId}`, options.force === true, 'Editable design system was not found.'),
      };
    }
    baseBody = await readFile(designPath, 'utf8');
  } catch {
    return {
      decision: unavailableDecision(`user:${dirId}`, options.force === true, 'Editable design system was not found.'),
    };
  }

  const manifest = await readManifest(baseDir, dirId);
  const reportPath = manifest?.sourceFiles?.report ?? 'source/token-contract.report.json';
  const report = await readReport(baseDir, reportPath);
  if (!report) {
    return {
      decision: unavailableDecision(
        `user:${dirId}`,
        options.force === true,
        'No token contract quality report was found for this design system.',
        reportPath,
      ),
    };
  }

  const evidenceExcerpt = await readTextOptional(baseDir, manifest?.sourceFiles?.evidence ?? 'source/evidence.md');
  const sourceTokens = await readTextOptional(baseDir, manifest?.sourceFiles?.tokens ?? 'source/tokens.source.json');
  const existingRequest = await readTextOptional(baseDir, 'source/token-contract.rebuild-request.md');
  const decision = decideRebuild(`user:${dirId}`, report, {
    force: options.force === true,
    reportPath,
  });
  if (!decision.recommended && !decision.forced) return { decision };

  const generatedAt = (options.now ?? new Date()).toISOString();
  const feedback = renderFeedback(decision, generatedAt);
  const requestMd = renderRebuildRequest({
    decision,
    generatedAt,
    evidenceExcerpt,
    sourceTokens,
  });
  const proposedBody = appendRebuildSection(baseBody, {
    decision,
    feedback,
    generatedAt,
  });

  return {
    decision,
    revision: {
      feedback,
      sectionTitle: 'Token Contract',
      baseBody,
      proposedBody,
      fileChanges: [{
        path: 'source/token-contract.rebuild-request.md',
        baseContent: existingRequest ?? '',
        proposedContent: requestMd,
      }],
    },
  };
}

/**
 * Evaluates token quality metrics and identifies rebuild triggers based on A1 coverage, fallback ratios, and key weak A1 tokens.
 * Returns a detailed rebuild decision with reasoning and weak token inventory for agent review.
 */
function decideRebuild(
  designSystemId: string,
  report: TokenContractReport,
  input: { force: boolean; reportPath: string },
): DesignSystemTokenContractRebuildDecision {
  const summary = report.summary ?? {};
  const selfCheckOk = report.selfCheck?.ok !== false;
  const triggers: string[] = [];
  if (report.selfCheck?.ok === false) triggers.push('token output self-check failed');
  if (summary.recommendRebuild === true) triggers.push('quality report recommends rebuild');
  if (summary.grade === 'needs-review' || summary.grade === 'needs-rebuild') {
    triggers.push(`quality grade is ${summary.grade}`);
  }
  const sourceBackedA1 = numberOrUndefined(summary.sourceBackedA1);
  const requiredA1 = numberOrUndefined(summary.requiredA1);
  if (sourceBackedA1 !== undefined && requiredA1 !== undefined && requiredA1 > 0) {
    const coverage = sourceBackedA1 / requiredA1;
    if (coverage < 0.7) triggers.push(`A1 source-backed coverage is ${Math.round(coverage * 100)}%`);
  }
  const fallbackTokens = numberOrUndefined(summary.fallbackTokens);
  const declaredTokens = numberOrUndefined(summary.declaredTokens);
  if (fallbackTokens !== undefined && declaredTokens !== undefined && declaredTokens > 0) {
    const ratio = fallbackTokens / declaredTokens;
    if (ratio > 0.4) triggers.push(`fallback token ratio is ${Math.round(ratio * 100)}%`);
  }

  const weakTokens = weakReportTokens(report);
  const keyWeakTokens = weakTokens.filter((token) => KEY_A1_TOKENS.has(token.name));
  if (keyWeakTokens.length > 0) {
    triggers.push(`key A1 slots need evidence: ${keyWeakTokens.map((token) => token.name).join(', ')}`);
  }

  const recommended = triggers.length > 0;
  const reason = input.force
    ? recommended
      ? `Forced rebuild; report also triggered ${triggers.length} quality condition(s).`
      : 'Forced rebuild; the quality report did not require rebuild.'
    : recommended
      ? `Token contract rebuild recommended: ${triggers.slice(0, 3).join('; ')}.`
      : 'Token contract report is usable; no rebuild recommended.';

  return {
    designSystemId,
    available: true,
    recommended,
    forced: input.force,
    reason,
    triggers,
    reportPath: input.reportPath,
    ...(summary.grade ? { grade: summary.grade } : {}),
    ...(typeof summary.score === 'number' ? { score: summary.score } : {}),
    ...(sourceBackedA1 !== undefined ? { sourceBackedA1 } : {}),
    ...(requiredA1 !== undefined ? { requiredA1 } : {}),
    ...(fallbackTokens !== undefined ? { fallbackTokens } : {}),
    selfCheckOk,
    weakTokens: weakTokens.slice(0, 12),
  };
}

/**
 * Filters and normalizes weak-confidence tokens from the report, focusing on key A1 identity slots.
 * Returns a clean list of weak tokens with reason and source references for rebuild guidance.
 */
function weakReportTokens(report: TokenContractReport): NonNullable<DesignSystemTokenContractRebuildDecision['weakTokens']> {
  return (report.tokens ?? [])
    .filter((token) => {
      const name = typeof token.name === 'string' ? token.name : '';
      const confidence = typeof token.confidence === 'string' ? token.confidence : '';
      if (!name || !WEAK_CONFIDENCE.has(confidence)) return false;
      return KEY_A1_TOKENS.has(name) || token.layer === 'A1-identity' || token.layer === 'A1-structure';
    })
    .map((token) => ({
      name: token.name ?? '',
      ...(typeof token.layer === 'string' ? { layer: token.layer } : {}),
      confidence: token.confidence ?? 'low',
      reason: token.reason ?? 'Token has weak or fallback evidence.',
      sources: Array.isArray(token.sources)
        ? token.sources.filter((source): source is string => typeof source === 'string').slice(0, 6)
        : [],
    }));
}

/**
 * Generates agent-facing rebuild feedback describing the quality decision, weak tokens, and review requirements.
 * Formatted as markdown with timestamped context and actionable guidance for contract improvement.
 */
function renderFeedback(
  decision: DesignSystemTokenContractRebuildDecision,
  generatedAt: string,
): string {
  const weak = decision.weakTokens?.slice(0, 6).map((token) => `- ${token.name}: ${token.confidence}; ${token.reason}`);
  return [
    'Rebuild the OD TOKEN_SCHEMA token contract from the imported source evidence.',
    '',
    `Generated at: ${generatedAt}`,
    `Report: ${decision.reportPath ?? 'source/token-contract.report.json'}`,
    `Decision: ${decision.reason}`,
    '',
    'Requirements:',
    '- Keep the target token names aligned to OD TOKEN_SCHEMA; do not introduce a parallel role vocabulary.',
    '- Prefer source-backed values over fallback values, and preserve source references in the review notes.',
    '- Treat fallback-heavy or low-confidence A1 slots as review blockers until evidence is cited.',
    '- Do not overwrite active source evidence; this revision must remain reviewable before activation.',
    '',
    ...(weak && weak.length > 0 ? ['Weak token evidence to inspect:', ...weak, ''] : []),
  ].join('\n');
}

/**
 * Renders a detailed markdown rebuild-request artifact containing quality signals, trigger conditions, weak token evidence, and source snippets.
 * Designed for agent consumption during token contract rebuilding workflows.
 */
function renderRebuildRequest(input: {
  decision: DesignSystemTokenContractRebuildDecision;
  generatedAt: string;
  evidenceExcerpt: string | undefined;
  sourceTokens: string | undefined;
}): string {
  const decision = input.decision;
  const weakTokens = decision.weakTokens ?? [];
  return [
    '# Token Contract Rebuild Request',
    '',
    `Generated at: ${input.generatedAt}`,
    `Design system: ${decision.designSystemId}`,
    `Report: ${decision.reportPath ?? 'source/token-contract.report.json'}`,
    `Decision: ${decision.reason}`,
    '',
    '## Quality Signals',
    '',
    `- Grade: ${decision.grade ?? 'unknown'}`,
    `- Score: ${decision.score ?? 'unknown'}`,
    `- A1 source-backed coverage: ${decision.sourceBackedA1 ?? 'unknown'} / ${decision.requiredA1 ?? 'unknown'}`,
    `- Fallback tokens: ${decision.fallbackTokens ?? 'unknown'}`,
    `- Self-check: ${decision.selfCheckOk === false ? 'failed' : 'passed or unavailable'}`,
    '',
    '## Trigger Conditions',
    '',
    ...(decision.triggers.length > 0 ? decision.triggers.map((trigger) => `- ${trigger}`) : ['- Forced rebuild without quality-triggered blockers.']),
    '',
    '## Weak Token Evidence',
    '',
    ...(weakTokens.length > 0
      ? weakTokens.map((token) => {
          const sources = token.sources.length > 0 ? ` Sources: ${token.sources.join(', ')}` : '';
          return `- ${token.name} (${token.confidence}): ${token.reason}${sources}`;
        })
      : ['- No weak A1 token evidence was reported.']),
    '',
    '## Source Evidence Excerpt',
    '',
    input.evidenceExcerpt?.trim().split(/\r?\n/).slice(0, 24).join('\n') || 'No evidence excerpt was available.',
    '',
    '## Source Token Snapshot',
    '',
    truncateForRequest(input.sourceTokens),
    '',
  ].join('\n');
}

/**
 * Appends a rebuild review section to the existing DESIGN.md body, documenting the decision, feedback, and artifact reference.
 * Preserves the original content and adds timestamped rebuild metadata for version tracking.
 */
function appendRebuildSection(
  body: string,
  input: {
    decision: DesignSystemTokenContractRebuildDecision;
    feedback: string;
    generatedAt: string;
  },
): string {
  const heading = '## Token Contract Rebuild Review';
  return [
    body.trim(),
    '',
    heading,
    '',
    `Status: pending review`,
    `Generated at: ${input.generatedAt}`,
    `Quality decision: ${input.decision.reason}`,
    '',
    input.feedback.trim(),
    '',
    'Review artifact: `source/token-contract.rebuild-request.md`',
    '',
  ].join('\n');
}

/**
 * Constructs a negative rebuild decision when the design system or its token report is not available for analysis.
 * Preserves the reason and optional report path for error messaging.
 */
function unavailableDecision(
  designSystemId: string,
  forced: boolean,
  reason: string,
  reportPath?: string,
): DesignSystemTokenContractRebuildDecision {
  return {
    designSystemId,
    available: false,
    recommended: false,
    forced,
    reason,
    triggers: [],
    ...(reportPath ? { reportPath } : {}),
  };
}

/**
 * Reads and validates the design system manifest.json, extracting safe source file paths for evidence, tokens, and report.
 * Returns null if the file is missing, malformed, or has a mismatched schema version or id.
 */
async function readManifest(
  baseDir: string,
  expectedId: string,
): Promise<{ sourceFiles?: { evidence?: string; tokens?: string; report?: string } } | null> {
  try {
    const raw = await readFile(path.join(baseDir, 'manifest.json'), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (record.schemaVersion !== 'od-design-system-project/v1' || record.id !== expectedId) return null;
    const sourceFiles = record.sourceFiles;
    if (!sourceFiles || typeof sourceFiles !== 'object' || Array.isArray(sourceFiles)) return {};
    const sourceRecord = sourceFiles as Record<string, unknown>;
    return {
      sourceFiles: {
        ...(safeManifestPath(sourceRecord.evidence) ? { evidence: sourceRecord.evidence } : {}),
        ...(safeManifestPath(sourceRecord.tokens) ? { tokens: sourceRecord.tokens } : {}),
        ...(safeManifestPath(sourceRecord.report) ? { report: sourceRecord.report } : {}),
      },
    };
  } catch {
    return null;
  }
}

/**
 * Reads and parses the token contract quality report from a JSON file, with path safety validation.
 * Returns null if the path is unsafe, the file is missing, or the content is invalid JSON or not an object.
 */
async function readReport(baseDir: string, relativePath: string): Promise<TokenContractReport | null> {
  if (!safeManifestPath(relativePath)) return null;
  try {
    const raw = await readFile(path.join(baseDir, relativePath), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as TokenContractReport;
  } catch {
    return null;
  }
}

/**
 * Attempts to read text from a relative path within a base directory, with path safety validation.
 * Returns undefined if the path is unsafe, not provided, or if the file cannot be read; errors are silently suppressed.
 */
async function readTextOptional(baseDir: string, relativePath: string | undefined): Promise<string | undefined> {
  if (!relativePath || !safeManifestPath(relativePath)) return undefined;
  try {
    return await readFile(path.join(baseDir, relativePath), 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * Validates that a path is safe for manifest references: must be a non-empty string, relative, and not escape the base directory.
 * Returns false for absolute paths, '.', '..', or paths with parent directory traversal.
 */
function safeManifestPath(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim().replace(/\\/g, '/');
  if (!trimmed || path.posix.isAbsolute(trimmed)) return false;
  const normalized = path.posix.normalize(trimmed);
  return normalized !== '.' && normalized !== '..' && !normalized.startsWith('../') && !normalized.includes('/../');
}

/**
 * Validates and extracts a design system directory id from a string, stripping the 'user:' prefix if present.
 * Returns null if the id contains invalid characters or is '.' or '..'.
 */
function sanitizeDesignSystemId(id: string): string | null {
  if (typeof id !== 'string') return null;
  const dirId = id.startsWith('user:') ? id.slice('user:'.length) : id;
  if (!/^[a-zA-Z0-9._-]+$/.test(dirId)) return null;
  if (dirId === '.' || dirId === '..') return null;
  return dirId;
}

/**
 * Coerces a value to a finite number, returning undefined if the value is not a number or is non-finite.
 * Safely extracts numeric fields from loosely-typed JSON structures.
 */
function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Truncates a string to 6000 characters for artifact inclusion, adding an ellipsis marker if content was cut.
 * Returns a fallback message if the input is undefined or empty.
 */
function truncateForRequest(value: string | undefined): string {
  const text = value?.trim();
  if (!text) return 'No source token snapshot was available.';
  return text.length > 6000 ? `${text.slice(0, 6000)}\n...truncated...` : text;
}
