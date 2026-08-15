import path from 'node:path';
import { createHash } from 'node:crypto';
import { DEFAULT_MODEL_OPTION, execAgentFile, piSessionsDir } from './shared.js';
import type { RuntimeAgentDef, RuntimeModelOption } from '../types.js';

/**
 * Directory name (under whatever base `ompSessionsBaseDir` resolves) where
 * this adapter parks Oh My Pi's session transcripts. omp defaults to a
 * global `~/.omp/agent/sessions/<encoded-cwd>/` tree whose directory naming
 * carries several generations of migration logic; rather than re-deriving
 * that scheme, the adapter pins `--session-dir` to a daemon-owned path the
 * transport can scan directly. Dot-prefixed, so it stays invisible in the
 * UI even on the fallback path where no data dir is available (see
 * `ompSessionsBaseDir`).
 */
export const OMP_SESSION_DIR_NAME = '.omp';

/**
 * Per-project session-storage root for omp, rooted under the daemon's data
 * directory (`RUNTIME_DATA_DIR`) instead of the project cwd. Per the daemon
 * data directory contract in the root AGENTS.md, agent runtime state must
 * stay under the resolved data root; pinning `--session-dir` to the project
 * cwd instead would write it into the user's own repository — for
 * imported-folder projects, an external tree the daemon doesn't own.
 *
 * omp's own upstream default already solves "avoid collisions across
 * projects that share one state tree" by encoding the cwd into the path;
 * this reuses that idea (a stable hash of the absolute cwd), just rooted
 * under `dataDir` rather than `$HOME`. Both `buildArgs` (the `--session-dir`
 * value passed to the CLI) and `piRpcSessionScanBase` (what the transport
 * scans for the resume handle) call this same function, so the two can
 * never point at different directories.
 *
 * @param dataDir - Absolute daemon data root (`RUNTIME_DATA_DIR`).
 * @param cwd     - Absolute project working directory for this run.
 */
export function ompSessionsBaseDir(dataDir: string, cwd: string): string {
  const cwdKey = createHash('sha256').update(path.resolve(cwd), 'utf8').digest('hex').slice(0, 16);
  return path.join(dataDir, 'agent-sessions', 'omp', cwdKey);
}

/** Display labels for omp's `--thinking` levels. */
const THINKING_LABELS: Record<string, string> = {
  off: 'Off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'XHigh',
  max: 'Max',
  auto: 'Auto',
};

function thinkingLabel(level: string): string {
  return THINKING_LABELS[level] ?? level;
}

/**
 * Builds the reasoning choices for one model from omp's per-model `thinking`
 * array. Non-reasoning models report `thinking: null`; those return `null` so
 * the picker falls back to the adapter-level list rather than rendering a
 * single dead option.
 *
 * @param thinking - The model's `thinking` field from `omp models --json`.
 */
function modelReasoningOptions(thinking: unknown): RuntimeModelOption[] | null {
  if (!Array.isArray(thinking)) return null;
  const levels = thinking.filter(
    (level): level is string => typeof level === 'string' && level.length > 0,
  );
  if (levels.length === 0) return null;
  return [
    { id: 'default', label: 'Default' },
    // `off` is always accepted by `--thinking` but omp lists only the levels a
    // reasoning model supports, so add it back explicitly.
    { id: 'off', label: thinkingLabel('off') },
    ...levels.map((level) => ({ id: level, label: thinkingLabel(level) })),
  ];
}

/**
 * Parses `omp models --json` — `{ "models": [{ provider, id, selector, name,
 * thinking, … }] }` — into picker options. `selector` is the exact
 * `provider/model` string omp's `--model` accepts, so it becomes the option id.
 * Returns `null` when the payload is unusable, which leaves detection on the
 * declared fallback list.
 *
 * @param stdout - Raw stdout captured from `omp models --json`, string or Buffer.
 */
export function parseOmpModels(stdout: unknown): RuntimeModelOption[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(stdout ?? ''));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const models = (parsed as { models?: unknown }).models;
  if (!Array.isArray(models)) return null;

  const out: RuntimeModelOption[] = [DEFAULT_MODEL_OPTION];
  const seen = new Set<string>([DEFAULT_MODEL_OPTION.id]);
  for (const entry of models) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const model = entry as Record<string, unknown>;
    const selector = typeof model.selector === 'string' ? model.selector.trim() : '';
    const provider = typeof model.provider === 'string' ? model.provider.trim() : '';
    const rawId = typeof model.id === 'string' ? model.id.trim() : '';
    const id = selector || (provider && rawId ? `${provider}/${rawId}` : '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = typeof model.name === 'string' && model.name.trim()
      ? model.name.trim()
      : rawId || id;
    const reasoningOptions = modelReasoningOptions(model.thinking);
    out.push({
      id,
      label: provider ? `${name} · ${provider}` : name,
      ...(reasoningOptions ? { reasoningOptions } : {}),
    });
  }
  return out.length > 1 ? out : null;
}

export const ompAgentDef = {
  id: 'omp',
  name: 'Oh My Pi',
  bin: 'omp',
  versionArgs: ['--version'],
  // omp ships as a compiled binary and answers `--version` in well under a
  // second locally, but detection probes every adapter in parallel and Windows
  // Defender inspects each cold spawn. Keep pi's headroom.
  versionProbeTimeoutMs: 15_000,
  // `omp models --json` prints the full catalog for the providers the user is
  // actually authenticated with. omp's own `--list-models` does not exist —
  // that flag belongs to upstream pi.
  fetchModels: async (resolvedBin, env) => {
    try {
      const { stdout } = await execAgentFile(resolvedBin, ['models', '--json'], {
        env,
        timeout: 60_000,
        // The catalog is a few hundred KB once several providers are linked.
        maxBuffer: 32 * 1024 * 1024,
      });
      const parsed = parseOmpModels(stdout);
      if (!parsed || parsed.length === 0) return null;
      return parsed;
    } catch {
      return null;
    }
  },
  // Which models exist depends entirely on the providers the user has linked,
  // so there is no honest static catalog to guess at. `default` omits `--model`
  // and defers to omp's own configuration; the Settings dialog's custom-model
  // input still accepts any pattern (`--model` fuzzy-matches, e.g. "opus").
  fallbackModels: [DEFAULT_MODEL_OPTION],
  // Adapter-level fallback for models whose own `thinking` list is unknown.
  reasoningOptions: [
    { id: 'default', label: 'Default' },
    { id: 'off', label: 'Off' },
    { id: 'minimal', label: 'Minimal' },
    { id: 'low', label: 'Low' },
    { id: 'medium', label: 'Medium' },
    { id: 'high', label: 'High' },
    { id: 'xhigh', label: 'XHigh' },
    { id: 'max', label: 'Max' },
    { id: 'auto', label: 'Auto' },
  ],
  buildArgs: (
    _prompt,
    _imagePaths,
    extraAllowedDirs = [],
    options = {},
    runtimeContext = {},
  ) => {
    // omp's RPC mode drives the whole conversation over stdio JSON-RPC, so the
    // prompt never touches argv.
    const args = ['--mode', 'rpc'];
    // The daemon spawns every CLI without a TTY, so an interactive tool-approval
    // prompt would hang the run. Same headless posture as Devin's
    // `--permission-mode dangerous`, Qoder's `--yolo`, and Copilot's
    // `--allow-all-tools`.
    args.push('--auto-approve');
    // Pin session storage to a daemon-owned directory the pi-rpc transport
    // can scan for the resume handle, keyed by this run's cwd so different
    // projects never collide (see `ompSessionsBaseDir`). Without a cwd there
    // is nothing stable to key on, so omp keeps its own default and this
    // conversation simply starts cold each turn with the transcript
    // recomposed into the prompt.
    const cwd = runtimeContext.cwd;
    const dataDir = runtimeContext.dataDir;
    if (typeof cwd === 'string' && path.isAbsolute(cwd)) {
      const base =
        typeof dataDir === 'string' && path.isAbsolute(dataDir)
          ? ompSessionsBaseDir(dataDir, cwd)
          // No resolved data root (e.g. an isolated smoke/connection-test
          // invocation that never resolves RUNTIME_DATA_DIR) — fall back to
          // the project cwd rather than dropping session storage entirely.
          : cwd;
      args.push('--session-dir', piSessionsDir(base, OMP_SESSION_DIR_NAME));
    }
    if (options.model && options.model !== 'default') {
      // `--model` accepts patterns ("opus", "openai/gpt-5.2") as well as the
      // exact `provider/model` selectors reported by `omp models --json`, so
      // the value passes through untouched.
      args.push('--model', options.model);
    }
    if (options.reasoning && options.reasoning !== 'default') {
      args.push('--thinking', options.reasoning);
    }
    // Skill seeds and design-system roots live outside the project cwd.
    // `--add-dir` is omp's first-class flag for widening the workspace beyond
    // the working directory, so the agent's own tools can read them.
    for (const dir of extraAllowedDirs) {
      if (typeof dir === 'string' && path.isAbsolute(dir)) {
        args.push('--add-dir', dir);
      }
    }
    return args;
  },
  // The prompt travels as an RPC `prompt` command on stdin, not as argv.
  promptViaStdin: true,
  streamFormat: 'pi-rpc',
  // omp's fork turned `new_session { parentSession }` into a lineage-only
  // header stamp that does NOT replay the parent transcript; `switch_session`
  // is what actually reopens a conversation. See types.ts.
  piRpcResumeCommand: 'switch-session',
  piRpcSessionDirName: OMP_SESSION_DIR_NAME,
  // Mirrors `buildArgs`' `--session-dir` computation so the transport scans
  // the exact same directory this run wrote into. Falls back to the project
  // cwd (pi's default behavior) when no data root is available.
  piRpcSessionScanBase: ({ dataDir, cwd }) =>
    typeof dataDir === 'string' && path.isAbsolute(dataDir)
    && typeof cwd === 'string' && path.isAbsolute(cwd)
      ? ompSessionsBaseDir(dataDir, cwd)
      : undefined,
  // omp's RPC `prompt` command accepts an `images` array of base64
  // `ImageContent` objects for multimodal input.
  supportsImagePaths: true,
} satisfies RuntimeAgentDef;
