/**
 * Self-write identity registry — discriminates an SDK cutover ECHO from a genuine
 * external write (notably undo/redo) in the file-change reload-suppression path.
 *
 * The old suppression was purely time-based: any file-change within 2 s of the
 * shared save timestamp was swallowed. But BOTH an SDK cutover
 * self-write AND an undo write set that same timestamp, so the window could not
 * tell "the echo of the bytes I just wrote" (suppress) from "the reverted bytes
 * an undo just wrote" (must reload). An undo that landed inside the window was
 * silently dropped, leaving the in-memory SDK doc on stale pre-undo content.
 *
 * Fix: tag each cutover self-write with the CONTENT it wrote (by hash). A
 * file-change reload is suppressed only when the new on-disk content matches a
 * recently-registered self-write hash — i.e. it is provably our own echo. Undo
 * writes are never registered (they don't flow through persistSdkSerialize), so
 * their content won't match and the reload always fires. Identity, not a clock.
 */

const SELF_WRITE_TTL_MS = 2000;

interface SelfWriteEntry {
  hash: string;
  at: number;
}

// Module-scoped: the studio process has a single SDK session lifecycle at a time
// and persists are funnelled through one persistSdkSerialize. Keyed by file path
// so a self-write to one file can't mask a real external change to another.
const registry = new Map<string, SelfWriteEntry[]>();

/**
 * Stable 32-bit FNV-1a hash of content. Collisions only risk SUPPRESSING a real
 * reload, and only within the 2 s TTL for the exact same file — negligible, and
 * strictly safer than the prior time-only window it replaces.
 */
export function hashContent(content: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    h ^= content.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function prune(entries: SelfWriteEntry[], now: number): SelfWriteEntry[] {
  return entries.filter((e) => now - e.at < SELF_WRITE_TTL_MS);
}

/** Record that WE wrote `content` to `path` (an SDK cutover self-write). */
export function markSelfWrite(path: string, content: string, now: number = Date.now()): void {
  const next = prune(registry.get(path) ?? [], now);
  next.push({ hash: hashContent(content), at: now });
  registry.set(path, next);
}

/**
 * True when `content` matches a self-write registered for `path` within the TTL.
 * Consumes the matched entry so a later genuinely-external write of identical
 * bytes isn't suppressed forever.
 */
export function isSelfWriteEcho(path: string, content: string, now: number = Date.now()): boolean {
  const entries = prune(registry.get(path) ?? [], now);
  const hash = hashContent(content);
  const idx = entries.findIndex((e) => e.hash === hash);
  if (idx === -1) {
    registry.set(path, entries);
    return false;
  }
  entries.splice(idx, 1);
  registry.set(path, entries);
  return true;
}

/** Test-only: drop all registered self-writes. */
export function resetSelfWriteRegistry(): void {
  registry.clear();
}
