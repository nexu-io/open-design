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
import { readFile, readdir, stat } from 'node:fs/promises';
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

// Frontend fallback name used by persistArtifact when the slugified
// identifier is empty (e.g. all-non-ASCII identifiers like "测试" strip to
// nothing). Without matching against this, sibling discovery would miss
// the entire "artifact*.html" family that such identifiers produce.
export const EMPTY_SLUG_FALLBACK_NAME = 'artifact';

// Two identifiers refer to the same artifact lineage when they're
// literally equal OR one is the canonical slug form of the other (and
// that slug is non-empty). Slugs alone matching is not enough: the
// frontend slugifier truncates at 60 chars, so two raw identifiers that
// only diverge after character 60 (e.g. "A...A1" and "A...A2", 70 chars
// each) would otherwise falsely bridge. Requiring one side to *be* the
// slug form keeps the "Landing Page" <-> "landing-page" bridge while
// rejecting truncation-induced collisions. Empty-slug equivalence
// (e.g. "测试" vs "首页") is also not treated as a match for the same
// reason — distinct identifiers can both strip to empty.
export function artifactIdentifiersMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const slugA = slugifyArtifactIdentifier(a);
  if (slugA.length === 0) return false;
  const slugB = slugifyArtifactIdentifier(b);
  if (slugA !== slugB) return false;
  return a === slugA || b === slugB;
}

// Reads the canonical identifier from a sibling's `.artifact.json`
// sidecar. Returns null when the sidecar is absent, malformed, or
// missing a string identifier — callers fall back to filename-derived
// inference for legacy artifacts that pre-date the sidecar era.
async function readSidecarIdentifier(scanDir: string, entryName: string): Promise<string | null> {
  try {
    const raw = await readFile(path.join(scanDir, `${entryName}.artifact.json`), 'utf8');
    const parsed = JSON.parse(raw) as { metadata?: { identifier?: unknown } } | null;
    const id = parsed?.metadata?.identifier;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

// Strips the frontend's `-N` collision suffix and the `.html` / `.htm`
// extension to recover the per-lineage basename. Used as one of the
// fallback identifiers for legacy HTML artifacts that don't have a
// sidecar yet (anything written before the manifest era, or HTML
// pasted/uploaded outside the artifact-tag flow). `inferLegacyManifest`
// already treats these as html-kind artifacts elsewhere; we mirror
// that so the guard doesn't silently let a stub overwrite them.
const SYNTHETIC_IDENTIFIER_SUFFIX = /(?:-\d+)?\.html?$/;
const HTML_EXTENSION = /\.html?$/;

function syntheticIdentifierFromFilename(name: string): string {
  return name.replace(SYNTHETIC_IDENTIFIER_SUFFIX, '');
}

// `phase-2.html` is genuinely ambiguous: it could be the identifier
// `phase` with a `-2` collision suffix, or the standalone identifier
// `phase-2`. Without a sidecar to disambiguate, both interpretations
// are valid candidates — the guard accepts the file as a prior if
// either matches the input identifier. Visible false positives
// (rejecting a legitimate write the user can override via env) are
// preferable to silent false negatives (stub bypasses the guard).
function legacyCandidateIdentifiers(filename: string): string[] {
  const fullBasename = filename.replace(HTML_EXTENSION, '');
  const stripped = syntheticIdentifierFromFilename(filename);
  const candidates: string[] = [];
  if (fullBasename.length > 0) candidates.push(fullBasename);
  if (stripped.length > 0 && stripped !== fullBasename) candidates.push(stripped);
  return candidates;
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
  tokens.add(identifier);
  const slug = slugifyArtifactIdentifier(identifier);
  if (slug.length > 0) tokens.add(slug);
  // When the identifier slugifies to empty (e.g. all-non-ASCII), the web
  // path falls back to the literal "artifact" basename. Match that family
  // so a later artifact-2.html stub doesn't bypass the prior.
  else tokens.add(EMPTY_SLUG_FALLBACK_NAME);
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
    // Verify the sibling's canonical identifier matches before treating
    // it as a prior. Without this check, distinct identifiers that share
    // a sibling-name namespace (most reachably the empty-slug fallback,
    // where 测试 and 首页 both land in artifact*.html) would falsely
    // warn/reject across each other.
    //
    // For legacy HTML artifacts without a sidecar (pre-manifest era,
    // Write-tool, paste-text, manual import), we fall back to filename-
    // derived candidates. Because a name like `phase-2.html` is
    // genuinely ambiguous between "phase + collision suffix -2" and "the
    // standalone identifier phase-2", we try both interpretations and
    // accept the file as a prior if either matches. The canonical-form
    // anchor in artifactIdentifiersMatch still rules out truncation
    // collisions and empty-slug conflations.
    const sidecarIdentifier = await readSidecarIdentifier(scanDir, entry.name);
    const candidateIdentifiers = sidecarIdentifier !== null
      ? [sidecarIdentifier]
      : legacyCandidateIdentifiers(entry.name);
    if (candidateIdentifiers.length === 0) continue;
    if (!candidateIdentifiers.some((c) => artifactIdentifiersMatch(identifier, c))) continue;
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
