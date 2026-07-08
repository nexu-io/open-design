/* ─────────────────────────────────────────────────────────────────────────
 * scripts/check-plugin-preview-manifest.ts
 *
 * Guard for the baked plugin-preview manifest (data/plugin-previews/
 * manifest.json) — the metadata the Home "Community" gallery trusts to pair
 * every plugin card with its pre-rendered clip. The gallery faithfully shows
 * whatever this file names, so drifted metadata is directly user-visible:
 * a deleted plugin's entry lingers forever (#4815 removed 19 example plugins
 * and left all 19 manifest entries behind), or an entry resolves to another
 * plugin's clip and the card renders the wrong content entirely (#4040, the
 * shamoni card showing luxury-botanical's imagery).
 *
 * Checks:
 *  1. no orphans — every entry names a plugin that still ships under
 *     plugins/_official or plugins/community;
 *  2. clip ownership — an entry's video/poster keys belong to its own plugin
 *     id, either `<id>/<hash>/…` (directory layout) or `<id>.<hash>.…`
 *     (legacy flat layout);
 *  3. hash coherence — the fingerprint embedded in the keys matches the
 *     entry's recorded `hash`;
 *  4. no two entries share a clip (the #4040 failure shape);
 *  5. durationMs / holdMs, when present, are positive finite numbers.
 *
 * Run standalone: `pnpm exec tsx scripts/check-plugin-preview-manifest.ts`
 * Or as part of `pnpm guard` (registered in scripts/guard.ts).
 * ─────────────────────────────────────────────────────────────────────── */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const MANIFEST_REPO_PATH = "data/plugin-previews/manifest.json";
// The id universe the manifest may reference: every bundled plugin the CI
// daemon can serve a preview for. Community is included so a community
// plugin's bake never reads as an orphan.
const PLUGIN_ROOTS = ["plugins/_official", "plugins/community"];
const HASH_PATTERN = /^[0-9a-f]{16}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every plugin id (`name` in open-design.json) shipped under the given roots. */
export async function collectPluginIds(
  roots: readonly string[] = PLUGIN_ROOTS,
): Promise<Set<string>> {
  const ids = new Set<string>();
  const pending = roots.map((root) => path.join(repoRoot, root));
  while (pending.length > 0) {
    const dir = pending.pop()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        pending.push(path.join(dir, entry.name));
        continue;
      }
      if (entry.name !== "open-design.json") continue;
      try {
        const manifest: unknown = JSON.parse(await readFile(path.join(dir, entry.name), "utf8"));
        if (isRecord(manifest) && typeof manifest.name === "string" && manifest.name.length > 0) {
          ids.add(manifest.name);
        }
      } catch {
        // A malformed plugin manifest is plugin-spec territory, not this
        // guard's; the plugin simply contributes no id.
      }
    }
  }
  return ids;
}

function keyBelongsToPlugin(key: string, id: string): boolean {
  return key.startsWith(`${id}/`) || key.startsWith(`${id}.`);
}

function keyCarriesHash(key: string, id: string, hash: string): boolean {
  return key.startsWith(`${id}/${hash}/`) || key.startsWith(`${id}.${hash}.`);
}

/** Pure validation over a parsed manifest; returns human-readable violations. */
export function validatePreviewManifest(
  manifest: unknown,
  pluginIds: ReadonlySet<string>,
): string[] {
  const violations: string[] = [];
  if (!isRecord(manifest) || !isRecord(manifest.previews)) {
    return [`${MANIFEST_REPO_PATH}: expected a { previews: { <id>: … } } object`];
  }

  const claimedKeys = new Map<string, string[]>();
  for (const [id, entry] of Object.entries(manifest.previews)) {
    if (!isRecord(entry)) {
      violations.push(`${MANIFEST_REPO_PATH}: ${id}: entry must be an object`);
      continue;
    }

    const { video, poster, hash, durationMs, holdMs } = entry;
    for (const [field, value] of [["video", video], ["poster", poster]] as const) {
      if (typeof value !== "string" || value.length === 0) {
        violations.push(`${MANIFEST_REPO_PATH}: ${id}: ${field} must be a non-empty string`);
        continue;
      }
      if (!keyBelongsToPlugin(value, id)) {
        violations.push(
          `${MANIFEST_REPO_PATH}: ${id}: ${field} key "${value}" does not belong to this plugin id — the card would render another plugin's clip`,
        );
      }
      const owners = claimedKeys.get(value) ?? [];
      owners.push(id);
      claimedKeys.set(value, owners);
    }

    if (hash !== undefined) {
      if (typeof hash !== "string" || !HASH_PATTERN.test(hash)) {
        violations.push(`${MANIFEST_REPO_PATH}: ${id}: hash must be 16 lowercase hex chars`);
      } else {
        for (const [field, value] of [["video", video], ["poster", poster]] as const) {
          if (typeof value === "string" && keyBelongsToPlugin(value, id) && !keyCarriesHash(value, id, hash)) {
            violations.push(
              `${MANIFEST_REPO_PATH}: ${id}: ${field} key "${value}" does not carry the recorded hash ${hash} — the entry points at a clip baked from different content`,
            );
          }
        }
      }
    }

    for (const [field, value] of [["durationMs", durationMs], ["holdMs", holdMs]] as const) {
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value <= 0)) {
        violations.push(`${MANIFEST_REPO_PATH}: ${id}: ${field} must be a positive finite number`);
      }
    }

    if (!pluginIds.has(id)) {
      violations.push(
        `${MANIFEST_REPO_PATH}: ${id}: no such plugin ships in ${PLUGIN_ROOTS.join(" or ")} — remove the stale entry (deleting a plugin must also delete its baked-preview entry)`,
      );
    }
  }

  for (const [key, owners] of claimedKeys) {
    if (owners.length > 1) {
      violations.push(
        `${MANIFEST_REPO_PATH}: clip key "${key}" is claimed by ${owners.length} entries (${owners.join(", ")}) — cards would show duplicate imagery`,
      );
    }
  }

  return violations;
}

export async function checkPluginPreviewManifest(): Promise<boolean> {
  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(path.join(repoRoot, MANIFEST_REPO_PATH), "utf8"));
  } catch (error) {
    console.error(
      `Plugin preview manifest check failed: ${MANIFEST_REPO_PATH} could not be parsed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }

  const pluginIds = await collectPluginIds();
  const violations = validatePreviewManifest(manifest, pluginIds);
  if (violations.length > 0) {
    console.error("Plugin preview manifest violations:");
    for (const violation of violations) console.error(`- ${violation}`);
    return false;
  }

  const count = isRecord(manifest) && isRecord(manifest.previews)
    ? Object.keys(manifest.previews).length
    : 0;
  console.log(
    `Plugin preview manifest check passed: ${count} entr${count === 1 ? "y" : "ies"} consistent with ${pluginIds.size} shipped plugins.`,
  );
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ok = await checkPluginPreviewManifest();
  if (!ok) process.exitCode = 1;
}
