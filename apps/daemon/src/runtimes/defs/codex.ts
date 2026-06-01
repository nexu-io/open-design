import { DEFAULT_MODEL_OPTION, clampCodexReasoning } from './shared.js';
import type { RuntimeModelOption } from '../types.js';
import type { RuntimeAgentDef } from '../types.js';

function parseCodexStringList(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const values = raw
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function parseCodexServiceTiers(raw: unknown): RuntimeModelOption[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: RuntimeModelOption[] = [];
  const seen = new Set<string>();
  for (const tier of raw) {
    if (!tier || typeof tier !== 'object') continue;
    const entry = tier as {
      id?: unknown;
      name?: unknown;
    };
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label =
      typeof entry.name === 'string' && entry.name.trim()
        ? entry.name.trim()
        : id;
    out.push({ id, label });
  }
  return out.length > 0 ? out : undefined;
}

export function parseCodexDebugModels(stdout: string): RuntimeModelOption[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(stdout || ''));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const models = (parsed as { models?: unknown }).models;
  if (!Array.isArray(models)) return null;

  const out = [DEFAULT_MODEL_OPTION];
  const seen = new Set<string>([DEFAULT_MODEL_OPTION.id]);
  for (const raw of models) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as {
      slug?: unknown;
      id?: unknown;
      display_name?: unknown;
      name?: unknown;
      visibility?: unknown;
      additional_speed_tiers?: unknown;
      service_tiers?: unknown;
    };
    if (entry.visibility === 'hidden') continue;
    const id =
      typeof entry.slug === 'string'
        ? entry.slug.trim()
        : typeof entry.id === 'string'
          ? entry.id.trim()
          : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label =
      typeof entry.display_name === 'string' && entry.display_name.trim()
        ? entry.display_name.trim()
        : typeof entry.name === 'string' && entry.name.trim()
          ? entry.name.trim()
          : id;
    const model: RuntimeModelOption = { id, label };
    const additionalSpeedTiers = parseCodexStringList(
      entry.additional_speed_tiers,
    );
    if (additionalSpeedTiers) model.additionalSpeedTiers = additionalSpeedTiers;
    const serviceTierOptions = parseCodexServiceTiers(entry.service_tiers);
    if (serviceTierOptions) model.serviceTierOptions = serviceTierOptions;
    out.push(model);
  }
  return out.length > 1 ? out : null;
}

const GPT_5_5_SERVICE_TIER_OPTIONS: RuntimeModelOption[] = [
  { id: 'priority', label: 'Fast' },
];

export function codexNeedsDangerFullAccessSandbox(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  // Operator override for deployments where Codex cannot create its
  // workspace-write sandbox, for example unprivileged Linux containers.
  // Only danger-full-access is accepted; unknown values keep the default path.
  if (env.OD_CODEX_SANDBOX?.trim() === 'danger-full-access') return true;
  if (platform === 'win32') return true;
  // WSL reports `linux` but Codex still hits the Windows read-only
  // workspace-write sandbox path when launched from there (#2834).
  return Boolean(env.WSL_DISTRO_NAME?.trim());
}

export const codexAgentDef = {
    id: 'codex',
    name: 'Codex CLI',
    bin: 'codex',
    versionArgs: ['--version'],
    // Codex exposes its installed model catalog through `debug models` on
    // recent CLIs. Older builds fall back to these static hints.
    listModels: {
      args: ['debug', 'models'],
      parse: parseCodexDebugModels,
      timeoutMs: 5000,
    },
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      {
        id: 'gpt-5.5',
        label: 'gpt-5.5',
        additionalSpeedTiers: ['fast'],
        serviceTierOptions: GPT_5_5_SERVICE_TIER_OPTIONS,
      },
      { id: 'gpt-5.4', label: 'gpt-5.4' },
      { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
      { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
      { id: 'gpt-5.1', label: 'gpt-5.1' },
      { id: 'gpt-5.1-codex-mini', label: 'gpt-5.1-codex-mini' },
      { id: 'gpt-5-codex', label: 'gpt-5-codex' },
      { id: 'gpt-5', label: 'gpt-5' },
      { id: 'o3', label: 'o3' },
      { id: 'o4-mini', label: 'o4-mini' },
    ],
    reasoningOptions: [
      { id: 'default', label: 'Default' },
      { id: 'none', label: 'None' },
      { id: 'minimal', label: 'Minimal' },
      { id: 'low', label: 'Low' },
      { id: 'medium', label: 'Medium' },
      { id: 'high', label: 'High' },
      { id: 'xhigh', label: 'XHigh' },
    ],
    // Prompt is delivered via stdin pipe (gated by `promptViaStdin: true`
    // below) to avoid Windows `spawn ENAMETOOLONG` while keeping Codex on
    // its structured JSON stream. Recent Codex CLI versions reject a bare
    // `-` argv sentinel — passing both the pipe and `-` produces
    // `error: unexpected argument '-' found` and the agent exits with
    // code 2 before any prompt is read (see issue #237). The pipe alone
    // is sufficient for stdin delivery.
    buildArgs: (
      _prompt,
      _imagePaths,
      extraAllowedDirs = [],
      options = {},
      runtimeContext = {},
    ) => {
      // Codex CLI's `workspace-write` sandbox blocks shell invocations on
      // Windows ("powershell.exe ... rejected: blocked by policy", #1721),
      // because Codex has no working OS-level sandbox on Windows and falls
      // back to a coarse policy that rejects any shell. macOS (Seatbelt)
      // and Linux (Landlock+seccomp) keep workspace-write because their
      // sandbox enforcement permits shell while restricting writes.
      const needsDangerFullAccess = codexNeedsDangerFullAccessSandbox();
      const args = needsDangerFullAccess
        ? ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'danger-full-access']
        : [
            'exec',
            '--json',
            '--skip-git-repo-check',
            '--sandbox',
            'workspace-write',
            '-c',
            'sandbox_workspace_write.network_access=true',
          ];
      // Newer Codex builds honor permissions config over legacy sandbox
      // flags; without this, Windows/WSL launches can stay read-only (#2834).
      args.push('-c', 'default_permissions=":workspace"');
      if (process.env.OD_CODEX_DISABLE_PLUGINS === '1') {
        args.push('--disable', 'plugins');
      }
      if (runtimeContext.cwd) {
        args.push('-C', runtimeContext.cwd);
      }
      const dirs = (extraAllowedDirs || []).filter(
        (d) => typeof d === 'string' && d.length > 0,
      );
      for (const d of dirs) {
        args.push('--add-dir', d);
      }
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      if (options.reasoning && options.reasoning !== 'default') {
        const effort = clampCodexReasoning(options.model, options.reasoning);
        // Codex accepts `-c key=value` config overrides; reasoning effort
        // is exposed as `model_reasoning_effort`.
        args.push('-c', `model_reasoning_effort="${effort}"`);
      }
      if (options.serviceTier && options.serviceTier !== 'default') {
        args.push('-c', `service_tier="${options.serviceTier}"`);
      }
      return args;
    },
    promptViaStdin: true,
    streamFormat: 'json-event-stream',
    eventParser: 'codex',
} satisfies RuntimeAgentDef;
