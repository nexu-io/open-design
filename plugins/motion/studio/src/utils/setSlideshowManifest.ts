/**
 * setSlideshowManifest — Studio persist helper for the slideshow JSON island.
 *
 * The island is a `<script type="application/hyperframes-slideshow+json">` node
 * embedded in the composition HTML.  Because <script> nodes are not tracked by
 * the SDK element tree (they have no hf-id), we cannot use a `setText` dispatch
 * op.  Instead we:
 *   1. Acquire the per-file transaction and read the current on-disk HTML.
 *   2. Replace or insert the island with the new manifest JSON.
 *   3. Write via `persistSdkSerialize` — the same low-level writer used by the
 *      other SDK-cutover paths (sdkDeletePersist, sdkTimingPersist, etc.).
 *
 * Inserting when absent: if no island exists in the serialized HTML we insert
 * one before `</body>` (or, if no </body>, append to the end of the document).
 * This means callers do NOT need to pre-scaffold the island; Task 11 / the panel
 * can call persistSlideshowManifest on a fresh composition.
 */

import type { SlideshowManifest } from "@hyperframes/core/slideshow";
import {
  SLIDESHOW_ISLAND_TYPE,
  SLIDESHOW_MANIFEST_VERSION,
  parseSlideshowManifest,
  slideshowIslandRegex,
} from "@hyperframes/core/slideshow";
import type { CutoverDeps } from "./sdkCutover";
import { persistSdkSerialize } from "./sdkCutover";

// Matches ALL <script type="application/hyperframes-slideshow+json"> ... </script>
// blocks (global + case-insensitive) so we can strip every stale island in one pass.
const ISLAND_RE = slideshowIslandRegex("gi");

export function buildSlideshowIslandHtml(manifest: SlideshowManifest): string {
  // Stamp the schema version (preserve an existing one) so future schema
  // changes can detect and migrate older islands.
  const versioned: SlideshowManifest = {
    version: manifest.version ?? SLIDESHOW_MANIFEST_VERSION,
    ...manifest,
  };
  // Escape `<` and `>` so that a manifest field containing `</script>` cannot
  // break out of the script tag. JSON.parse round-trips </> unchanged.
  const json = JSON.stringify(versioned, null, 2).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  return `<script type="${SLIDESHOW_ISLAND_TYPE}">\n${json}\n</script>`;
}

export interface PersistSlideshowArgs {
  manifest: SlideshowManifest;
  /** Exact on-disk bytes for the undo-history `before` baseline. */
  originalContent: string;
  targetPath: string;
  deps: CutoverDeps;
  /** Optional label override (default: "Edit slideshow"). */
  label?: string;
  /**
   * When provided, threads a coalesceKey into recordEdit so rapid writes
   * (e.g. per-keystroke notes changes) collapse to a single undo entry.
   */
  coalesceKey?: string;
}

export async function persistSlideshowManifest(args: PersistSlideshowArgs): Promise<void> {
  const { manifest, originalContent, targetPath, deps, label, coalesceKey } = args;

  const islandHtml = buildSlideshowIslandHtml(manifest);

  // Write-time validation: confirm the island we just built round-trips to a
  // valid manifest before touching disk, so a malformed edit can't corrupt the
  // composition. parseSlideshowManifest throws on a structurally-invalid island.
  try {
    if (!parseSlideshowManifest(islandHtml)) {
      throw new Error("built island did not parse back to a manifest");
    }
  } catch (err) {
    throw new Error(`refusing to persist invalid slideshow manifest: ${(err as Error).message}`);
  }

  await persistSdkSerialize(
    (current) => {
      // Strip ALL existing islands (handles the case where two stale islands
      // accumulated) then insert exactly one fresh island.
      const stripped = current.replace(ISLAND_RE, "");
      const bodyClose = stripped.lastIndexOf("</body>");
      return bodyClose !== -1
        ? stripped.slice(0, bodyClose) + islandHtml + "\n" + stripped.slice(bodyClose)
        : stripped + "\n" + islandHtml;
    },
    targetPath,
    originalContent,
    deps,
    {
      label: label ?? "Edit slideshow",
      ...(coalesceKey ? { coalesceKey } : {}),
    },
  );
}
