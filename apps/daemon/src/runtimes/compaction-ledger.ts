import type { CompactionLedgerEntry } from '@open-design/contracts';

// Manual context compaction (#5991) — workspace ledger wash.
//
// The ledger is the machine-washed record of what the compacted span
// produced (files / artifacts / traces). It is NEVER summarized: a
// model-written summary can misremember a file path, while the ledger
// stays a faithful, byte-stable registry. Determinism rules (frozen in
// the #5991 design contract):
//
//   1. entries are merged by `identifier`, first occurrence wins;
//   2. survivors are sorted by `identifier` before serialization;
//   3. absent optional fields are omitted entirely from the JSON, so the
//      serialized form is total: same logical ledger ⇔ same bytes.
//
// The web transcript block renders entries in stored order without
// re-sorting, so sorted-at-write is what makes replays byte-stable.

type RawLedgerEntry = {
  identifier?: unknown;
  description?: unknown;
  fileName?: unknown;
};

function isUsableLedgerEntry(
  entry: RawLedgerEntry,
): entry is { identifier: string; description: string; fileName?: unknown } {
  return (
    entry != null
    && typeof entry.identifier === 'string'
    && entry.identifier.length > 0
    && typeof entry.description === 'string'
    && entry.description.length > 0
    && (entry.fileName === undefined || entry.fileName === null || typeof entry.fileName === 'string')
  );
}

/**
 * Merges raw ledger entries into the canonical write shape. The input is
 * expected in chronological (process-time) order; first occurrence of an
 * identifier wins, survivors are sorted by identifier.
 */
export function washCompactionLedgerEntries(
  raw: readonly RawLedgerEntry[],
): CompactionLedgerEntry[] {
  const byIdentifier = new Map<string, CompactionLedgerEntry>();
  for (const entry of raw) {
    if (!isUsableLedgerEntry(entry)) continue;
    if (byIdentifier.has(entry.identifier)) continue;
    const washed: CompactionLedgerEntry = {
      identifier: entry.identifier,
      description: entry.description,
    };
    if (typeof entry.fileName === 'string' && entry.fileName !== '') {
      washed.fileName = entry.fileName;
    }
    byIdentifier.set(entry.identifier, washed);
  }
  return [...byIdentifier.values()].sort((a, b) =>
    a.identifier < b.identifier ? -1 : a.identifier > b.identifier ? 1 : 0,
  );
}

/**
 * Canonical (byte-stable) serialization of an already-washed ledger.
 */
export function serializeCompactionLedger(entries: readonly CompactionLedgerEntry[]): string {
  return JSON.stringify(entries);
}

/**
 * Parses a stored ledger. Corrupt or non-ledger payloads yield an empty
 * ledger rather than throwing — a damaged checkpoint must never break a
 * turn; the conversation simply falls back to full history.
 */
export function parseCompactionLedger(json: string): CompactionLedgerEntry[] {
  try {
    const raw: unknown = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return washCompactionLedgerEntries(
      raw.filter((entry): entry is RawLedgerEntry => entry != null && typeof entry === 'object'),
    );
  } catch {
    return [];
  }
}

// ---------- collection from persisted messages ----------

/**
 * One raw candidate before the wash. The collector emits candidates in
 * message order (chronological); `washCompactionLedgerEntries` applies the
 * first-occurrence-wins merge and the identifier sort.
 */
export interface CompactionLedgerCandidate {
  identifier: string;
  description: string;
  fileName?: string | null;
}

/**
 * Normalizes a file identifier so the same workspace file emitted by
 * different message shapes (absolute vs `./`-prefixed vs bare name) still
 * merges into one ledger entry.
 */
function normalizeFileIdentifier(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  let candidate = value;
  while (candidate.startsWith('./') || candidate.startsWith('/')) {
    candidate = candidate.startsWith('./') ? candidate.slice(2) : candidate.slice(1);
  }
  const normalized = candidate.replaceAll('\\', '/');
  return normalized === '' ? null : normalized;
}

function collectFromFileLikeList(
  files: unknown,
  defaultDescription: string,
  out: CompactionLedgerCandidate[],
): void {
  if (!Array.isArray(files)) return;
  for (const file of files) {
    if (file == null || typeof file !== 'object') continue;
    const record = file as Record<string, unknown>;
    const identifier = normalizeFileIdentifier(record.path ?? record.name);
    if (identifier === null) continue;
    const kind = typeof record.kind === 'string' && record.kind ? record.kind : null;
    const type = typeof record.type === 'string' && record.type ? record.type : null;
    out.push({
      identifier,
      description: kind ?? type ?? defaultDescription,
      fileName: identifier,
    });
  }
}

/**
 * Collects raw ledger candidates from the persisted messages of the span
 * being compacted. Sources, in priority order per message:
 *
 *   - `artifactRefs`  — normalized workspace artifact cards (`label` is the
 *     authoritative file identity, mirroring web's `persistedArtifactFilesOf`
 *     trust priority);
 *   - `producedFiles` — daemon-row produced file metadata;
 *   - `traceObjectFiles` — trace object snapshots.
 *
 * The messages must be in chronological order. The result is UNWASHED: the
 * route applies `washCompactionLedgerEntries` right before persisting, which
 * is what makes the stored ledger deterministic (merged + identifier-sorted).
 */
export function collectCompactionLedgerCandidatesFromMessages(
  messages: readonly unknown[],
): CompactionLedgerCandidate[] {
  const out: CompactionLedgerCandidate[] = [];
  for (const message of messages) {
    if (message == null || typeof message !== 'object') continue;
    const record = message as Record<string, unknown>;
    const artifactRefs = record.artifactRefs;
    if (Array.isArray(artifactRefs)) {
      for (const ref of artifactRefs) {
        if (ref == null || typeof ref !== 'object') continue;
        const refRecord = ref as Record<string, unknown>;
        const identifier = normalizeFileIdentifier(refRecord.label);
        if (identifier === null) continue;
        const kind = typeof refRecord.kind === 'string' && refRecord.kind ? refRecord.kind : 'artifact';
        out.push({ identifier, description: kind, fileName: identifier });
      }
    }
    collectFromFileLikeList(record.producedFiles, 'file', out);
    collectFromFileLikeList(record.traceObjectFiles, 'file', out);
  }
  return out;
}