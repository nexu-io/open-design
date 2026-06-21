import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import type { LogSource } from "./sources.js";

const DEFAULT_RUN_EVENT_TAIL_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_RUN_EVENT_LOGS = 20;

// CLI session logs can be large (e.g. Codex's `codex-tui.log` grows into the
// hundreds of MB because it logs every TUI frame), so keep a generous-but-
// bounded tail that still captures the final error frame.
const DEFAULT_AGENT_LOG_TAIL_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_FILES_PER_AGENT = 3;

const SAFE_DIR_ENTRY = /^[A-Za-z0-9._-]+$/u;

async function statSafe(path: string): Promise<{ mtimeMs: number; isFile: boolean } | null> {
  try {
    const info = await stat(path);
    return { mtimeMs: info.mtimeMs, isFile: info.isFile() };
  } catch {
    return null;
  }
}

/**
 * Collect the most-recent per-run event logs (`<runsDir>/<runId>/events.jsonl`).
 *
 * These are the daemon's capture of each agent CLI's own stdout/stderr/stream
 * for a run — the single richest, agent-agnostic diagnostic signal for "the
 * run failed / produced nothing". Shared so both the daemon HTTP export and the
 * desktop IPC export bundle the same data.
 */
export async function buildRunEventLogSources(
  runsDir: string | null | undefined,
  options: { maxRuns?: number; tailBytes?: number } = {},
): Promise<LogSource[]> {
  if (!runsDir) return [];
  const maxRuns = options.maxRuns ?? DEFAULT_MAX_RUN_EVENT_LOGS;
  const tailBytes = options.tailBytes ?? DEFAULT_RUN_EVENT_TAIL_BYTES;

  let entries;
  try {
    entries = await readdir(runsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const candidates: Array<{ runId: string; absolutePath: string; mtimeMs: number }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!SAFE_DIR_ENTRY.test(entry.name)) continue;
    const absolutePath = join(runsDir, entry.name, "events.jsonl");
    const info = await statSafe(absolutePath);
    if (!info || !info.isFile) continue;
    candidates.push({ runId: entry.name, absolutePath, mtimeMs: info.mtimeMs });
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates.slice(0, maxRuns).map(({ runId, absolutePath }) => ({
    name: `runs/${runId}/events.jsonl`,
    absolutePath,
    kind: "text",
    tailBytes,
  }));
}

async function latestLogFilesIn(
  dir: string,
  max: number,
): Promise<Array<{ name: string; absolutePath: string }>> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const candidates: Array<{ name: string; absolutePath: string; mtimeMs: number }> = [];
  for (const name of names) {
    if (!name.endsWith(".log")) continue;
    if (!SAFE_DIR_ENTRY.test(name)) continue;
    const absolutePath = join(dir, name);
    const info = await statSafe(absolutePath);
    if (!info || !info.isFile) continue;
    candidates.push({ name, absolutePath, mtimeMs: info.mtimeMs });
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates.slice(0, max).map(({ name, absolutePath }) => ({ name, absolutePath }));
}

export interface AgentCliLogOptions {
  /** User home directory; CLI configs/logs live under here. */
  homeDir: string;
  /** Open Design data dir (OD_DATA_DIR); fallback location of the AMR OpenCode home. */
  dataDir?: string | null;
  /**
   * Effective AMR OpenCode home (the resolved `OPENCODE_TEST_HOME`). Callers
   * should pass the value a real AMR run would use so this honors a user
   * `agentCliEnv.amr.OPENCODE_TEST_HOME` override; when omitted we fall back to
   * the default `<dataDir>/amr/opencode-home`.
   */
  amrOpenCodeHome?: string | null;
  /**
   * Effective Claude config home (`CLAUDE_CONFIG_DIR`). Honors a user
   * `agentCliEnv.claude.CLAUDE_CONFIG_DIR` override; falls back to `~/.claude`.
   */
  claudeConfigDir?: string | null;
  /**
   * Effective Codex home (`CODEX_HOME`). Honors a user
   * `agentCliEnv.codex.CODEX_HOME` override; falls back to `~/.codex`.
   */
  codexHome?: string | null;
  /** XDG_DATA_HOME, if set, used for OpenCode's data dir resolution. */
  xdgDataHome?: string | null;
  /** Max log files to include per agent (most-recent first). */
  maxFilesPerAgent?: number;
  /** Max bytes to read from each log file's tail. */
  tailBytes?: number;
}

/**
 * Collect the native on-disk logs of the coding-agent CLIs Open Design drives:
 * Claude Code, Codex, OpenCode, and AMR (vela's OpenCode runtime). These
 * complement the per-run `events.jsonl` capture with the CLI's own internal
 * diagnostics (provider errors, retries, auth state) that never reach the
 * daemon's stream.
 *
 * Deliberately excluded: secret-bearing files. We only sweep known *log*
 * directories (`*.log` files) — never `~/.amr/config.json`, `~/.codex/auth.json`,
 * or session transcripts — and the collected text still passes through the
 * bundle's redaction pass.
 */
export async function buildAgentCliLogSources(options: AgentCliLogOptions): Promise<LogSource[]> {
  const home = options.homeDir?.trim();
  if (!home) return [];
  const maxFiles = options.maxFilesPerAgent ?? DEFAULT_MAX_FILES_PER_AGENT;
  const tailBytes = options.tailBytes ?? DEFAULT_AGENT_LOG_TAIL_BYTES;

  const xdg = options.xdgDataHome?.trim();
  const openCodeUserLogDir = xdg
    ? join(xdg, "opencode", "log")
    : join(home, ".local", "share", "opencode", "log");

  // Effective CLI homes honor the user's app-config overrides
  // (`CLAUDE_CONFIG_DIR` / `CODEX_HOME`), falling back to the defaults — the
  // same fix as AMR's `OPENCODE_TEST_HOME` so relocated homes are not missed.
  const claudeDir = options.claudeConfigDir?.trim() || join(home, ".claude");
  const codexHome = options.codexHome?.trim() || join(home, ".codex");

  // Per-agent log directories. `*.log` only; secret files (auth.json,
  // config.json) live outside these dirs and are never swept.
  const agentDirs: Array<{ agent: string; dir: string }> = [
    // Claude Code operational logs (bash-commands / cost-tracker / daemon).
    { agent: "claude", dir: claudeDir },
    // Codex tracing logs (codex-tui.log can be very large — tail-bounded).
    { agent: "codex", dir: join(codexHome, "log") },
    // OpenCode session logs (provider errors live here in headless mode).
    { agent: "opencode", dir: openCodeUserLogDir },
  ];

  // AMR drives a private OpenCode under OPENCODE_TEST_HOME; its session logs
  // land under that home's XDG data dir, where AMR run provider failures are
  // recorded. Prefer the effective home a real run resolves (honoring a user
  // `agentCliEnv.amr.OPENCODE_TEST_HOME` override) and fall back to the default
  // `<dataDir>/amr/opencode-home` so the bundle does not silently drop the very
  // AMR logs this is meant to surface.
  const amrHome = options.amrOpenCodeHome?.trim();
  const dataDir = options.dataDir?.trim();
  const amrOpenCodeHome = amrHome || (dataDir ? join(dataDir, "amr", "opencode-home") : "");
  if (amrOpenCodeHome) {
    agentDirs.push({
      agent: "amr",
      dir: join(amrOpenCodeHome, ".local", "share", "opencode", "log"),
    });
  }

  const sources: LogSource[] = [];
  for (const { agent, dir } of agentDirs) {
    const files = await latestLogFilesIn(dir, maxFiles);
    for (const file of files) {
      sources.push({
        name: `agent-cli-logs/${agent}/${file.name}`,
        absolutePath: file.absolutePath,
        kind: "text",
        tailBytes,
      });
    }
  }
  return sources;
}
