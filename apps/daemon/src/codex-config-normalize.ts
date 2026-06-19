// Normalize ~/.codex/config.toml before launching the Codex CLI.
//
// Codex renamed service_tier="priority" → service_tier="fast" in a recent
// release. Some installations also have the older service_tier="default"
// value. Both stale values cause the CLI to exit with:
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
// or contains an unknown service_tier value outside the stale map, it is left
// unchanged.

import { randomBytes } from 'node:crypto';
import { rename, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { expandHomePath } from './runtimes/paths.js';

/**
 * Resolve the path to the Codex CLI config file, respecting CODEX_HOME.
 *
 * Mirrors the resolution used by codex-pets.ts and the codex agentCliEnv
 * allowlist so all daemon code agrees on the config location.
 *
 * `~/` and `~\` prefixes in CODEX_HOME are expanded to the OS home directory,
 * matching the behaviour of `expandConfiguredEnv` in `runtimes/paths.ts` that
 * the Codex child process sees via `spawnEnvForAgent`. Without this expansion
 * a user-configured `CODEX_HOME=~/.codex-alt` would resolve to the literal
 * path `~/.codex-alt/config.toml` in the normalizer while the child process
 * expands it to `<homedir>/.codex-alt/config.toml`, causing the normalizer to
 * patch the wrong (non-existent) path and leave the real config untouched.
 */
export function resolveCodexConfigPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env.CODEX_HOME?.trim();
  const home = raw ? expandHomePath(raw) : path.join(os.homedir(), '.codex');
  return path.join(home, 'config.toml');
}

/**
 * Normalize the `service_tier` field in a config.toml string.
 *
 * Replaces any stale/invalid service_tier value (e.g. "priority" or
 * "default") with its current valid equivalent ("fast"). Valid values are
 * left unchanged. Unrecognised values are also left unchanged — the Codex CLI
 * will surface a clear error for those.
 *
 * Returns `null` when no substitution was needed, otherwise returns the
 * patched content.
 */
export function normalizeCodexConfigContent(content: string): string | null {
  // Match ONLY a standalone service_tier key line, anchored to the start of
  // the line (multiline `m` flag) so that `priority` or `default` appearing
  // inside an unrelated string value or comment is never touched.
  //
  // Pattern breakdown:
  //   ^(\s*)            — leading whitespace / indentation (capture group 1)
  //   service_tier      — literal key name
  //   (\s*=\s*)         — = with optional surrounding whitespace (group 2)
  //   (["'])(priority|default)\3
  //                    — quoted stale value with matching quote (group 3)
  //   (\s*(?:#.*)?)$    — optional trailing inline comment (group 4)
  //
  // This deliberately avoids matching:
  //   - `some_key = "I need priority service_tier"`  (value of another key)
  //   - `# service_tier = "priority"`               (commented-out key)
  //   - `service_tier = "flex"`                     (valid value — not matched)
  //   - `service_tier = "fast"`                     (valid value — not matched)
  const pattern =
    /^(\s*)service_tier(\s*=\s*)(["'])(?:priority|default)\3(\s*(?:#.*)?)$/gm;

  let changed = false;
  const patched = content.replace(
    pattern,
    (_match, indent: string, eq: string, _quote: string, trail: string) => {
      changed = true;
      // Preserve indentation, spacing, and any trailing inline comment.
      return `${indent}service_tier${eq}"fast"${trail}`;
    },
  );

  return changed ? patched : null;
}

/**
 * Injectable I/O layer for `normalizeCodexConfigFile`.
 * Production code uses the real `node:fs/promises` functions; tests inject
 * stubs to exercise failure paths without filesystem tricks.
 */
export interface CodexConfigIO {
  readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
  writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<void>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  unlink: (path: string) => Promise<void>;
}

const defaultIO: CodexConfigIO = { readFile, writeFile, rename, unlink };

/**
 * Read `~/<codex-home>/config.toml`, normalize any stale `service_tier`
 * value, and write the result back only when a change was made.
 *
 * The write is performed atomically: the patched content is written to a
 * sibling temp file in the same directory (same filesystem, so the rename is
 * always atomic), then renamed over the original. This prevents partial writes
 * from corrupting the config if the process is interrupted mid-write.
 *
 * A missing or unreadable config.toml is silently ignored — Codex uses
 * built-in defaults in that case. Write/rename failures are logged with
 * `console.warn` so they appear in daemon logs without blocking the launch.
 *
 * @param env - Process environment, injectable for testing.
 * @param io  - I/O layer, injectable for testing (defaults to node:fs/promises).
 */
export async function normalizeCodexConfigFile(
  env: NodeJS.ProcessEnv = process.env,
  io: CodexConfigIO = defaultIO,
): Promise<void> {
  const configPath = resolveCodexConfigPath(env);
  let content: string;
  try {
    content = await io.readFile(configPath, 'utf8');
  } catch {
    // File absent or unreadable — nothing to normalize.
    return;
  }

  const patched = normalizeCodexConfigContent(content);
  if (patched === null) return; // no stale value found — file untouched

  // Write to a sibling temp file, then atomically rename over the target.
  // Same directory → same filesystem → rename is atomic on POSIX and
  // effectively atomic on Windows (no partial-read window).
  const tmpPath =
    configPath + '.' + randomBytes(4).toString('hex') + '.tmp';
  try {
    await io.writeFile(tmpPath, patched, 'utf8');
    await io.rename(tmpPath, configPath);
  } catch (err) {
    // Log the failure so it surfaces in daemon logs, but do not block launch.
    // The Codex CLI will surface the original parse error which is actionable.
    console.warn('[codex-config-normalize] atomic write failed:', err);
    // Best-effort removal of the temp file; ignore secondary errors.
    await io.unlink(tmpPath).catch(() => {});
  }
}
