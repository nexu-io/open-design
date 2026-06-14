// Normalize ~/.codex/config.toml before launching the Codex CLI.
//
// Codex renamed service_tier="priority" → service_tier="fast" in a recent
// release. The Codex app's own fast-mode toggle still writes the old value
// on some installations, causing the CLI to exit with:
//
//   Error loading config.toml: unknown variant 'priority', expected 'fast'
//   or 'flex' in `service_tier`
//
// The CLI parses config.toml before processing any -c flag overrides, so
// the only way to prevent the exit is to fix the file on disk. This module
// performs a targeted in-place replacement of the stale value before the
// daemon spawns Codex. It is intentionally scoped: only the `service_tier`
// field is touched; everything else in config.toml is preserved verbatim.
//
// The normalization is idempotent: if the file is absent, already correct,
// or contains an unknown service_tier value, it is left unchanged.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/**
 * The set of service_tier values that are valid in the current Codex CLI
 * and do NOT need normalization.
 */
const VALID_SERVICE_TIERS = new Set(['fast', 'flex']);

/**
 * Maps stale/renamed service_tier values to their current valid equivalent.
 * `priority` was the old name for `fast` before the Codex CLI migration.
 */
const STALE_TIER_MAP: Readonly<Record<string, 'fast' | 'flex'>> = {
  priority: 'fast',
};

/**
 * Resolve the path to the Codex CLI config file, respecting CODEX_HOME.
 *
 * Mirrors the resolution used by codex-pets.ts and the codex agentCliEnv
 * allowlist so all daemon code agrees on the config location.
 */
export function resolveCodexConfigPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const home = env.CODEX_HOME?.trim() || path.join(os.homedir(), '.codex');
  return path.join(home, 'config.toml');
}

/**
 * Normalize the `service_tier` field in a config.toml string.
 *
 * Replaces any stale/invalid service_tier value (e.g. "priority") with its
 * current valid equivalent ("fast"). Valid values are left unchanged.
 * Unrecognised values are also left unchanged — the Codex CLI will surface
 * a clear error for those.
 *
 * Returns `null` when no substitution was needed, otherwise returns the
 * patched content.
 */
export function normalizeCodexConfigContent(content: string): string | null {
  // Match: service_tier = "priority" or service_tier = 'priority' with
  // optional surrounding whitespace. TOML allows both quote styles.
  const pattern =
    /\bservice_tier\s*=\s*(?:"([^"]+)"|'([^']+)')/g;

  let changed = false;
  const patched = content.replace(pattern, (match, dq: string | undefined, sq: string | undefined) => {
    const raw = (dq ?? sq ?? '').trim();
    if (VALID_SERVICE_TIERS.has(raw)) return match; // already valid
    const replacement = STALE_TIER_MAP[raw];
    if (!replacement) return match; // unknown value — leave for CLI to reject
    changed = true;
    return `service_tier = "${replacement}"`;
  });

  return changed ? patched : null;
}

/**
 * Read `~/< codex-home>/config.toml`, normalize any stale `service_tier`
 * value in-place, and write the file back only when a change was made.
 *
 * Errors from missing files or read/write failures are silently swallowed:
 * a missing or unreadable config.toml is fine (Codex uses defaults), and a
 * write failure should not block the launch — the CLI will surface the
 * original parse error which is still actionable for the user.
 *
 * @param env - Process environment, injectable for testing.
 */
export async function normalizeCodexConfigFile(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const configPath = resolveCodexConfigPath(env);
  let content: string;
  try {
    content = await readFile(configPath, 'utf8');
  } catch {
    // File absent or unreadable — nothing to normalize.
    return;
  }

  const patched = normalizeCodexConfigContent(content);
  if (patched === null) return; // no stale value found

  try {
    await writeFile(configPath, patched, 'utf8');
  } catch {
    // Write failed (permissions, etc.) — do not block the launch.
    // The original error from the Codex CLI is still actionable.
  }
}
