// Normalize ~/.codex/config.toml before launching the Codex CLI.
//
// The Codex CLI only accepts `service_tier = "fast"` or `"flex"`. Any other
// value makes it exit before processing the prompt:
//
//   Error loading config.toml: unknown variant '<value>', expected 'fast'
//   or 'flex' in `service_tier`
//
// The Codex app has written several invalid values over time ("priority",
// "default", and others observed in production). An earlier version of this
// module kept a hardcoded map of the known-stale values → "fast"; every new
// invalid value the app emitted then slipped through and crashed the CLI until
// someone added it to the map — whack-a-mole.
//
// Instead, this module takes the wildcard view: the valid set is small and
// known ({fast, flex}), so ANY service_tier value outside it is treated as
// invalid and its line is REMOVED, letting the Codex CLI fall back to its
// built-in default tier. Removing — rather than forcing "fast" — is the
// smallest assumption: it never imposes an opinionated tier on the user, and
// "default"/unknown values semantically mean "let the system choose" anyway.
//
// The CLI parses config.toml before processing any -c flag overrides, so the
// only way to prevent the exit is to fix the file on disk. The edit is
// intentionally scoped: only standalone `service_tier` key lines are touched;
// everything else in config.toml is preserved verbatim.
//
// The normalizer also removes nested `[features.*]` tables. Current Codex CLI
// configs model `[features]` as a map of boolean flags; a nested table makes a
// flag value a TOML map and the CLI exits with:
//
//   invalid type: map, expected a boolean in `features`
//
// The normalization is idempotent: if the file is absent, or if no invalid
// service_tier value or nested features table is present, it is left unchanged.

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
 * The only `service_tier` values the Codex CLI accepts. Anything else makes
 * the CLI exit on config load, so the normalizer removes it.
 */
const VALID_SERVICE_TIERS = new Set(['fast', 'flex']);

function splitLinesPreservingEndings(content: string): string[] {
  const lines = content.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? [];
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function tableHeaderName(line: string): string | null {
  const withoutLineEnding = line.replace(/\r\n$|\n$|\r$/, '');
  const trimmed = withoutLineEnding.trim();
  const arrayHeader = trimmed.match(/^\[\[([^\]\r\n]+)\]\][^\S\r\n]*(?:#.*)?$/);
  const arrayHeaderName = arrayHeader?.[1];
  if (arrayHeaderName) return arrayHeaderName.trim();
  const tableHeader = trimmed.match(/^\[([^\]\r\n]+)\][^\S\r\n]*(?:#.*)?$/);
  const tableName = tableHeader?.[1];
  if (tableName) return tableName.trim();
  return null;
}

function removeNestedFeaturesTables(content: string): string | null {
  const lines = splitLinesPreservingEndings(content);
  let changed = false;
  let droppingNestedFeaturesTable = false;
  const kept: string[] = [];

  for (const line of lines) {
    const headerName = tableHeaderName(line);
    if (headerName) {
      droppingNestedFeaturesTable = headerName.startsWith('features.');
      if (droppingNestedFeaturesTable) {
        changed = true;
        continue;
      }
    }

    if (droppingNestedFeaturesTable) {
      changed = true;
      continue;
    }

    kept.push(line);
  }

  return changed ? kept.join('') : null;
}

/**
 * Normalize the `service_tier` field in a config.toml string.
 *
 * Any standalone `service_tier` key line whose value is not in
 * {@link VALID_SERVICE_TIERS} has its entire line removed (so the Codex CLI
 * uses its built-in default tier). Valid values are left verbatim.
 *
 * Any nested `[features.*]` table is also removed because current Codex CLI
 * configs expect `[features]` entries to be booleans, not maps.
 *
 * Returns `null` when nothing needed to change, otherwise the patched content.
 */
export function normalizeCodexConfigContent(content: string): string | null {
  // Match ONLY a standalone service_tier key line *and its line terminator*,
  // anchored to the start of the line (multiline `m` flag) so an invalid line
  // can be removed cleanly (line + newline) instead of leaving a blank line,
  // and so `service_tier` text inside another key's value or a comment is
  // never touched.
  //
  // Pattern breakdown (horizontal-whitespace class `[^\S\r\n]` never crosses
  // a line boundary, unlike `\s`):
  //   ^([^\S\r\n]*)             — indentation (group 1, horizontal ws only)
  //   service_tier              — literal key name
  //   ([^\S\r\n]*=[^\S\r\n]*)   — = with optional surrounding ws (group 2)
  //   (["'])([^"'\r\n]*)\3      — quoted value (group 3 = quote, group 4 = value)
  //   ([^\S\r\n]*(?:#[^\r\n]*)?) — trailing ws + optional inline comment (group 5)
  //   (\r?\n|$)                 — the line terminator, or EOF (group 6)
  //
  // This deliberately avoids matching:
  //   - `some_key = "I need priority service_tier"`  (value of another key)
  //   - `# service_tier = "priority"`               (commented-out key)
  // Valid lines (`"fast"` / `"flex"`) are matched but returned unchanged.
  const pattern =
    /^([^\S\r\n]*)service_tier([^\S\r\n]*=[^\S\r\n]*)(["'])([^"'\r\n]*)\3([^\S\r\n]*(?:#[^\r\n]*)?)(\r?\n|$)/gm;

  let changed = false;
  const serviceTierPatched = content.replace(
    pattern,
    (match: string, _indent, _eq, _quote, value: string) => {
      if (VALID_SERVICE_TIERS.has(value)) {
        // Already valid — leave the line (and its terminator) verbatim.
        return match;
      }
      changed = true;
      // Drop the whole line so the Codex CLI falls back to its default tier.
      return '';
    },
  );

  const featuresPatched = removeNestedFeaturesTables(serviceTierPatched);
  if (featuresPatched !== null) {
    changed = true;
  }

  return changed ? (featuresPatched ?? serviceTierPatched) : null;
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
