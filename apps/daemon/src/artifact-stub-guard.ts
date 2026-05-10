// Detects "stub" HTML artifact regressions: an agent emits a new artifact
// with the same metadata.identifier as an earlier one, but the body is a
// tiny placeholder ("see <other>.html in this project", a bare filename
// string, an empty fallback page, etc.) instead of the full HTML.
//
// The guard is structural: it compares the new body's size against the
// largest prior sibling sharing the same identifier. It does not pattern-
// match on phrasing, so it works regardless of which agent backend produced
// the regression. False positives are bounded by minPriorBytes (we won't
// compare against priors that are themselves small) and minRetainedRatio.

import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export type ArtifactStubGuardMode = 'reject' | 'warn' | 'off';

export interface ArtifactStubGuardConfig {
  mode: ArtifactStubGuardMode;
  minRetainedRatio: number;
  minPriorBytes: number;
}

export interface PriorArtifactSibling {
  name: string;
  size: number;
}

export interface ArtifactStubGuardWarning {
  code: 'ARTIFACT_REGRESSION';
  message: string;
  identifier: string;
  newSize: number;
  priorSize: number;
  priorName: string;
}

export interface EvaluateArtifactStubGuardInput {
  scanDir: string;
  identifier: string;
  newSize: number;
  config: ArtifactStubGuardConfig;
}

export interface EvaluateArtifactStubGuardResult {
  outcome: 'pass' | 'warn' | 'reject';
  warning?: ArtifactStubGuardWarning;
}

export class ArtifactRegressionError extends Error {
  readonly code = 'ARTIFACT_REGRESSION';
  readonly identifier: string;
  readonly newSize: number;
  readonly priorSize: number;
  readonly priorName: string;

  constructor(message: string, details: { identifier: string; newSize: number; priorSize: number; priorName: string }) {
    super(message);
    this.name = 'ArtifactRegressionError';
    this.identifier = details.identifier;
    this.newSize = details.newSize;
    this.priorSize = details.priorSize;
    this.priorName = details.priorName;
  }
}

export const DEFAULT_ARTIFACT_STUB_GUARD_CONFIG: ArtifactStubGuardConfig = {
  mode: 'warn',
  minRetainedRatio: 0.2,
  minPriorBytes: 4096,
};

// HTML-rendered manifest kinds. Decks are HTML files on disk and have the
// same regression failure mode as plain html artifacts (the agent emits a
// placeholder where a multi-KB framework should be), so they're guarded
// alongside `html`.
export const STUB_GUARDED_MANIFEST_KINDS: ReadonlySet<string> = new Set(['html', 'deck']);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Mirror of the slugifier in `apps/web/src/components/ProjectView.tsx`'s
// `persistArtifact`. The web path slugifies the identifier for the
// filename basename but keeps the *raw* identifier in the manifest, so a
// regex anchored on the raw identifier alone can miss its own slug-form
// siblings on disk. We try both forms.
export function slugifyArtifactIdentifier(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// Finds prior HTML siblings on disk that share an identifier with a
// newly-written artifact. The frontend's collision-suffixing scheme means
// related entries match `<identifier>(-\d+)?\.html?`. The scan deliberately
// includes any file at the same path as the new write — when an agent
// overwrites `dashboard.html` with the same name, the file currently on
// disk is the prior content (the overwrite happens after this scan).
export async function findPriorArtifactSiblings(
  scanDir: string,
  identifier: string,
): Promise<PriorArtifactSibling[]> {
  if (identifier.length === 0) return [];
  const tokens = new Set<string>();
  if (identifier.length > 0) tokens.add(identifier);
  const slug = slugifyArtifactIdentifier(identifier);
  if (slug.length > 0) tokens.add(slug);
  if (tokens.size === 0) return [];
  const alternation = Array.from(tokens, escapeRegExp).join('|');
  const pattern = new RegExp(`^(?:${alternation})(?:-\\d+)?\\.html?$`);
  let entries: Dirent[];
  try {
    entries = await readdir(scanDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const results: PriorArtifactSibling[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!pattern.test(entry.name)) continue;
    try {
      const st = await stat(path.join(scanDir, entry.name));
      results.push({ name: entry.name, size: st.size });
    } catch {
      // ignore unreadable entries; they don't influence the guard decision
    }
  }
  return results;
}

export function readArtifactStubGuardConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ArtifactStubGuardConfig {
  const rawMode = (env.OD_ARTIFACT_STUB_GUARD ?? '').toLowerCase();
  const mode: ArtifactStubGuardMode =
    rawMode === 'reject' || rawMode === 'warn' || rawMode === 'off'
      ? rawMode
      : DEFAULT_ARTIFACT_STUB_GUARD_CONFIG.mode;

  const ratioRaw = Number(env.OD_ARTIFACT_STUB_GUARD_MIN_RATIO);
  // Accept (0, 1] so users can set 1 to reject any shrinkage. Values <=0
  // or >1 fall back to default.
  const minRetainedRatio =
    Number.isFinite(ratioRaw) && ratioRaw > 0 && ratioRaw <= 1
      ? ratioRaw
      : DEFAULT_ARTIFACT_STUB_GUARD_CONFIG.minRetainedRatio;

  const minPriorBytesRaw = Number(env.OD_ARTIFACT_STUB_GUARD_MIN_PRIOR_BYTES);
  const minPriorBytes =
    Number.isInteger(minPriorBytesRaw) && minPriorBytesRaw > 0
      ? minPriorBytesRaw
      : DEFAULT_ARTIFACT_STUB_GUARD_CONFIG.minPriorBytes;

  return { mode, minRetainedRatio, minPriorBytes };
}

function buildWarning(
  identifier: string,
  newSize: number,
  prior: PriorArtifactSibling,
): ArtifactStubGuardWarning {
  return {
    code: 'ARTIFACT_REGRESSION',
    message:
      `New artifact body for identifier "${identifier}" is ${newSize} bytes, ` +
      `but the largest prior sibling "${prior.name}" is ${prior.size} bytes. ` +
      'This pattern usually means the agent emitted a placeholder instead of the full document. ' +
      'Set OD_ARTIFACT_STUB_GUARD=warn to record the warning without rejecting, or =off to disable the guard entirely.',
    identifier,
    newSize,
    priorSize: prior.size,
    priorName: prior.name,
  };
}

// Pure decision function: given the prior siblings on disk, decide whether
// the new body is a stub regression. Splitting this from the disk scan
// keeps the unit tests fast and lets callers pre-fetch siblings.
export function classifyArtifactStubGuard(
  priors: PriorArtifactSibling[],
  identifier: string,
  newSize: number,
  config: ArtifactStubGuardConfig,
): EvaluateArtifactStubGuardResult {
  if (config.mode === 'off') return { outcome: 'pass' };
  if (identifier.length === 0) return { outcome: 'pass' };
  if (priors.length === 0) return { outcome: 'pass' };

  let largest: PriorArtifactSibling | null = null;
  for (const prior of priors) {
    if (largest === null || prior.size > largest.size) largest = prior;
  }
  if (largest === null) return { outcome: 'pass' };
  if (largest.size < config.minPriorBytes) return { outcome: 'pass' };

  const threshold = largest.size * config.minRetainedRatio;
  if (newSize >= threshold) return { outcome: 'pass' };

  const warning = buildWarning(identifier, newSize, largest);
  return { outcome: config.mode === 'reject' ? 'reject' : 'warn', warning };
}

export async function evaluateArtifactStubGuard(
  input: EvaluateArtifactStubGuardInput,
): Promise<EvaluateArtifactStubGuardResult> {
  if (input.config.mode === 'off') return { outcome: 'pass' };
  if (input.identifier.length === 0) return { outcome: 'pass' };
  const priors = await findPriorArtifactSiblings(input.scanDir, input.identifier);
  return classifyArtifactStubGuard(priors, input.identifier, input.newSize, input.config);
}
