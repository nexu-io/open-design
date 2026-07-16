// One-time cleanup of memory entries minted by the retired chat
// auto-extraction pipelines.
//
// Context: the chat regex pack wrote junk facts from ordinary chat text
// (the progressive-aspect "我在…" became "user location: 开做："), and the
// chat-form profile capture accumulated per-project discovery answers into
// the global `user_profile` under whatever label each form question used.
// Both pipelines are retired (chat extraction now defaults OFF in
// `readMemoryConfig`); this migration removes what they already wrote.
//
// Scope, by product decision:
//   - DELETE entries that fingerprint-match the regex pack's fill-in
//     templates (`isHeuristicExtractionArtifact`). Precise: name + body
//     template must both match.
//   - PRUNE `user_profile` down to the canonical field set the settings
//     profile editor writes; drop chat-form residue rows. Delete the entry
//     when nothing canonical survives.
//   - KEEP everything else: LLM-extracted facts (kept deliberately —
//     they are indistinguishable from hand-written prose on disk),
//     connector/brand output, and anything the user typed by hand.
//
// One-time semantics: a marker file inside the memory dir records the run.
// Later boots are no-ops — this is a migration, not a standing GC — so a
// user who consciously re-enables extraction afterwards is not re-flipped
// and re-created entries are not re-reaped.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { PROFILE_MEMORY_ID } from '@open-design/contracts';
import {
  deleteMemoryEntry,
  isHeuristicExtractionArtifact,
  listMemoryEntries,
  memoryDir,
  pruneProfileBodyToCanonical,
  readMemoryEntry,
  upsertMemoryEntry,
  writeMemoryConfig,
} from './memory.js';

const MARKER_FILE = '.cleanup_auto_extracted_v1.json';

export interface AutoExtractionCleanupResult {
  /** False when the marker already existed and nothing was touched. */
  ran: boolean;
  /** Ids of entries removed by the heuristic fingerprint match. */
  deletedIds: string[];
  /** True when user_profile was rewritten (or removed) to canonical rows. */
  profilePruned: boolean;
}

function markerPath(dataDir: string): string {
  return path.join(memoryDir(dataDir), MARKER_FILE);
}

/**
 * Run the one-time auto-extraction cleanup for a data dir. Idempotent via a
 * marker file; safe to call on every daemon boot. Never throws for a single
 * bad entry — a migration must not take the daemon down.
 */
export async function runAutoExtractionCleanup(
  dataDir: string,
): Promise<AutoExtractionCleanupResult> {
  try {
    await fsp.access(markerPath(dataDir));
    return { ran: false, deletedIds: [], profilePruned: false };
  } catch {
    // No marker — first run.
  }

  const deletedIds: string[] = [];
  let profilePruned = false;

  const summaries = await listMemoryEntries(dataDir);
  for (const summary of summaries) {
    try {
      const entry = await readMemoryEntry(dataDir, summary.id);
      if (!entry) continue;

      if (entry.id === PROFILE_MEMORY_ID) {
        const pruned = pruneProfileBodyToCanonical(entry.body);
        if (pruned === null) {
          await deleteMemoryEntry(dataDir, entry.id);
          profilePruned = true;
        } else if (pruned !== entry.body.trim()) {
          await upsertMemoryEntry(
            dataDir,
            { ...entry, body: pruned },
            { silent: true, source: 'manual' },
          );
          profilePruned = true;
        }
        continue;
      }

      if (isHeuristicExtractionArtifact(entry)) {
        await deleteMemoryEntry(dataDir, entry.id);
        deletedIds.push(entry.id);
      }
    } catch (err) {
      console.warn(
        `[memory] cleanup skipped entry ${summary.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Retire the pipelines for configs written before the default flipped:
  // any earlier settings PATCH persisted `chatExtractionEnabled: true`
  // as a side effect of writing the whole config object. Forced off once,
  // here; a conscious re-opt-in through settings sticks afterwards because
  // the marker short-circuits every later boot.
  try {
    await writeMemoryConfig(dataDir, { chatExtractionEnabled: false });
  } catch (err) {
    console.warn(
      '[memory] cleanup could not update config:',
      err instanceof Error ? err.message : err,
    );
  }

  const marker = { ranAt: Date.now(), deletedIds, profilePruned };
  await fsp.mkdir(memoryDir(dataDir), { recursive: true });
  await fsp.writeFile(markerPath(dataDir), `${JSON.stringify(marker, null, 2)}\n`);

  return { ran: true, deletedIds, profilePruned };
}
