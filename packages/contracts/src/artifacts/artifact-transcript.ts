/**
 * Prior-turn `<artifact>` handling for the transcript a chat turn sends back to
 * the agent. Shared by the web client (which assembles the transcript for a
 * user turn) and the daemon (which assembles it for the rounds it starts on its
 * own), so both sides summarize exactly the same blocks.
 */
import {
  computeSkipRanges,
  isRealArtifactOpenAt,
  rangeContains,
  type Range,
} from './markdown-context.js';

const OPEN = '<artifact';
const CLOSE = '</artifact>';

function findUnskipped(
  content: string,
  needle: string,
  fromIndex: number,
  ranges: ReadonlyArray<Range>,
): number {
  let from = fromIndex;
  while (from <= content.length) {
    const idx = content.indexOf(needle, from);
    if (idx === -1) return -1;
    if (!rangeContains(ranges, idx)) return idx;
    from = idx + needle.length;
  }
  return -1;
}

// Like `findUnskipped(OPEN, …)` but also rejects prefix-shared literals like
// `<artifactual` — only `<artifact` followed by whitespace counts as a real
// protocol open.
function findRealOpen(content: string, fromIndex: number, ranges: ReadonlyArray<Range>): number {
  let from = fromIndex;
  while (from <= content.length) {
    const idx = content.indexOf(OPEN, from);
    if (idx === -1) return -1;
    if (rangeContains(ranges, idx) || !isRealArtifactOpenAt(content, idx)) {
      from = idx + OPEN.length;
      continue;
    }
    return idx;
  }
  return -1;
}

function parseArtifactAttrs(raw: string): Record<string, string> {
  const re = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null = re.exec(raw);
  while (m !== null) {
    out[m[1] as string] = (m[2] ?? m[3] ?? '') as string;
    m = re.exec(raw);
  }
  return out;
}

/**
 * A project file that an artifact save confirmed wrote to disk, as recorded on
 * the assistant message after a successful `persistArtifact` (producedFiles).
 * `identifier` is the artifact-manifest `metadata.identifier` when present.
 */
export interface PersistedArtifactFileRef {
  name: string;
  identifier?: string;
}

// Mirrors ProjectView's artifactExtensionFor: the on-disk extension the
// persist path picks from the artifact's type/identifier.
function artifactExtensionForAttrs(
  attrs: Record<string, string>,
): '.html' | '.jsx' | '.tsx' | '.css' | '.svg' | '.md' {
  const type = (attrs['type'] || '').toLowerCase();
  const identifier = (attrs['identifier'] || '').toLowerCase();
  if (type.includes('tsx') || identifier.endsWith('.tsx')) return '.tsx';
  if (type.includes('jsx') || type.includes('react') || identifier.endsWith('.jsx')) return '.jsx';
  if (type.includes('css') || identifier.endsWith('.css')) return '.css';
  if (type.includes('svg') || identifier.endsWith('.svg')) return '.svg';
  if (type.includes('markdown') || type === 'md' || identifier.endsWith('.md')) return '.md';
  return '.html';
}

// Mirrors ProjectView's artifactBaseNameFor: the slug the persist path derives
// the file name from.
function artifactBaseNameForAttrs(attrs: Record<string, string>): string {
  return (
    (attrs['identifier'] || attrs['title'] || 'artifact')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'artifact'
  );
}

/**
 * Find the persisted project file this artifact block was saved to, or null
 * when persistence cannot be confirmed. Match order mirrors
 * `findExistingArtifactProjectFile`: manifest identifier first (strongest —
 * survives the `-2`/`-3` collision-suffix renames), then the derived
 * `<slug><ext>` / `<slug>-<n><ext>` file names.
 */
export function matchPersistedArtifactFile(
  attrs: Record<string, string>,
  persistedFiles: ReadonlyArray<PersistedArtifactFileRef>,
): PersistedArtifactFileRef | null {
  const identifier = attrs['identifier'] ?? '';
  if (identifier) {
    const byManifest = persistedFiles.find((f) => f.identifier === identifier);
    if (byManifest) return byManifest;
  }
  const ext = artifactExtensionForAttrs(attrs);
  const base = artifactBaseNameForAttrs(attrs);
  const namePattern = new RegExp(
    `^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:-\\d+)?${ext.replace('.', '\\.')}$`,
  );
  return persistedFiles.find((f) => namePattern.test(f.name)) ?? null;
}

/**
 * Replace every real `<artifact …>…</artifact>` block whose body is CONFIRMED
 * persisted to a project file with a one-line summary, for use in the
 * multi-turn transcript sent to the agent.
 *
 * Once the artifact lives on disk the agent reads/edits it from there via
 * grep/sed, never from this transcript copy, so re-sending the whole HTML each
 * turn is pure waste — a 30K-token artifact balloons every subsequent turn's
 * input. The summary keeps the metadata the agent needs (`identifier` /
 * `title` / `type` and the saved file name) and points it at the on-disk file.
 *
 * Persistence is confirmed against `persistedFiles` — the producedFiles
 * recorded on the assistant message after a successful save. `persistArtifact`
 * has explicit refusal (validateHtmlArtifact) and write-failure
 * (writeProjectTextFile → null) branches; on those paths the transcript copy
 * is the ONLY surviving artifact body, so an unmatched block is left verbatim
 * (the pre-existing 12K transcript truncation still applies downstream) and a
 * follow-up turn can still inspect or repair it.
 *
 * Uses the same skip-range / real-open detection as the web stripper, so a
 * literal `<artifact …>` recited inside a code fence (a user or assistant
 * explaining the protocol) is left intact — only genuine protocol blocks are
 * summarized. Malformed / still-streaming blocks (real open, no real close)
 * are left untouched, mirroring the stripper's conservative behavior.
 */
export function summarizeArtifactsForTranscript(
  content: string,
  persistedFiles: ReadonlyArray<PersistedArtifactFileRef>,
): string {
  if (persistedFiles.length === 0) return content;
  let result = '';
  let cursor = 0;
  // Recompute skip ranges per iteration against the remaining tail so indices
  // stay valid as we consume the string left to right.
  while (cursor <= content.length) {
    const tail = content.slice(cursor);
    const { ranges: baseRanges, unclosedFenceStart } = computeSkipRanges(tail);
    const ranges: Range[] =
      unclosedFenceStart !== null ? [...baseRanges, [unclosedFenceStart, tail.length]] : baseRanges;
    const open = findRealOpen(tail, 0, ranges);
    if (open === -1) {
      result += tail;
      break;
    }
    const gt = tail.indexOf('>', open);
    if (gt === -1) {
      result += tail;
      break;
    }
    const end = findUnskipped(tail, CLOSE, gt, ranges);
    if (end === -1) {
      // Real open but no real close — refuse to summarize (safer than eating
      // to end-of-string on a malformed/streaming tag). Keep the rest as-is.
      result += tail;
      break;
    }
    const attrs = parseArtifactAttrs(tail.slice(open, gt));
    const persisted = matchPersistedArtifactFile(attrs, persistedFiles);
    result += persisted
      ? tail.slice(0, open) + artifactTranscriptSummary(attrs, persisted)
      // Unconfirmed save — the transcript copy may be the only surviving
      // body. Keep the block verbatim and keep scanning past it.
      : tail.slice(0, end + CLOSE.length);
    cursor += end + CLOSE.length;
  }
  return result;
}

function artifactTranscriptSummary(
  attrs: Record<string, string>,
  persisted: PersistedArtifactFileRef,
): string {
  const id = attrs['identifier'] ?? '';
  const title = attrs['title'] ?? '';
  const type = attrs['type'] ?? 'text/html';
  const meta = [
    id ? `identifier="${id}"` : '',
    title ? `title="${title}"` : '',
    `type="${type}"`,
  ]
    .filter(Boolean)
    .join(', ');
  return `[artifact emitted on a prior turn — ${meta}. Its full content was saved to the project file "${persisted.name}" and is NOT repeated here. Read or modify that file on disk (list/grep the project directory if it was since renamed); do not rely on this transcript for its contents.]`;
}
