/**
 * @module codex/core/codex-home
 *
 * Foundation primitive for the codex domain: resolving the Codex CLI home
 * directory (`$CODEX_HOME`, defaulting to `~/.codex`).
 *
 * codex reads its config, sessions/rollouts, and hatch-pets under a single
 * home directory. Two of the domain's concerns — the pets registry
 * ({@link module:codex/pets}) and the rollout usage extractor
 * ({@link module:codex/rollout}) — resolve that home with the exact same
 * `raw?.trim() || ~/.codex` rule, so it lives here as the shared kernel every
 * sibling may import directly. The config normalizer intentionally does NOT
 * use this helper: it expands `~`-prefixed values via `runtimes/paths`
 * (`expandHomePath`) to mirror what the spawned Codex child process sees, a
 * deliberately different resolution that must not be unified here.
 */

import os from 'node:os';
import path from 'node:path';

/**
 * Resolve the Codex home directory from a raw override value.
 *
 * Returns the trimmed override when it is a non-empty string, otherwise the
 * platform default `~/.codex`. A whitespace-only or absent override falls back
 * to the default. This is the byte-identical resolution shared by the pets and
 * rollout concerns; it does not expand a leading `~` (callers that need `~`
 * expansion — e.g. the config normalizer — resolve their home separately).
 *
 * @param raw - The candidate home override, typically `process.env.CODEX_HOME`
 *   or a caller-supplied `codexHome`. `null`/`undefined`/blank fall back.
 * @returns Absolute (or override-verbatim) path to the Codex home directory.
 */
export function defaultCodexHome(raw: string | null | undefined): string {
  return raw?.trim() || path.join(os.homedir(), '.codex');
}
