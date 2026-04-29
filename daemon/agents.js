import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { delimiter } from 'node:path';
import path from 'node:path';

const execFileP = promisify(execFile);

// Capability flags detected at probe time (per agent id). buildArgs consults
// this map so we only pass flags the installed CLI actually advertises in
// `--help`. Falls back to "off" when probing failed or hasn't run yet — that
// keeps the spawn safe across older Claude Code releases that pre-date a
// given flag (e.g. `--include-partial-messages`, added in 1.0.86).
const agentCapabilities = new Map();

// Each entry defines how to invoke the agent in non-interactive "one-shot" mode.
// `buildArgs(prompt, imagePaths, extraAllowedDirs)` returns argv for the child
// process. `extraAllowedDirs` is a list of absolute directories the agent must
// be permitted to read files from (skill seeds, design-system specs) that live
// outside the project cwd. Currently only Claude Code wires this through
// (`--add-dir`); other agents either inherit broader access or run with cwd
// boundaries we can't widen via flags.
// `streamFormat` hints to the daemon how to interpret stdout:
//   - 'claude-stream-json' : line-delimited JSON emitted by Claude Code's
//     `--output-format stream-json`. Daemon parses it into typed events
//     (text / thinking / tool_use / tool_result / status) for the UI.
//   - 'plain' (default)    : raw text, forwarded chunk-by-chunk.
export const AGENT_DEFS = [
  {
    id: 'claude',
    name: 'Claude Code',
    bin: 'claude',
    versionArgs: ['--version'],
    helpArgs: ['--help'],
    capabilityFlags: {
      // Flag string -> capability key. After probing `--help`, we set
      // `agentCapabilities[id][key] = true` for each substring that matches.
      '--include-partial-messages': 'partialMessages',
      '--add-dir': 'addDir',
    },
    buildArgs: (prompt, _imagePaths, extraAllowedDirs = []) => {
      const caps = agentCapabilities.get('claude') || {};
      const args = [
        '-p',
        prompt,
        '--output-format',
        'stream-json',
        '--verbose',
      ];
      // `--include-partial-messages` lands richer streaming events but only
      // exists in newer Claude Code builds. Older installs reject it with
      // "unknown option" and exit 1, killing the chat. Gate on the probe.
      if (caps.partialMessages) {
        args.push('--include-partial-messages');
      }
      const dirs = (extraAllowedDirs || []).filter(
        (d) => typeof d === 'string' && d.length > 0,
      );
      // `--add-dir` is older but still gate it for symmetry — old/forked
      // builds may lack it.
      if (dirs.length > 0 && caps.addDir !== false) {
        args.push('--add-dir', ...dirs);
      }
      return args;
    },
    streamFormat: 'claude-stream-json',
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    bin: 'codex',
    versionArgs: ['--version'],
    buildArgs: (prompt) => ['exec', prompt],
    streamFormat: 'plain',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    bin: 'gemini',
    versionArgs: ['--version'],
    buildArgs: (prompt) => ['-p', prompt],
    streamFormat: 'plain',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    bin: 'opencode',
    versionArgs: ['--version'],
    buildArgs: (prompt) => ['run', prompt],
    streamFormat: 'plain',
  },
  {
    id: 'cursor-agent',
    name: 'Cursor Agent',
    bin: 'cursor-agent',
    versionArgs: ['--version'],
    buildArgs: (prompt) => ['-p', prompt],
    streamFormat: 'plain',
  },
  {
    id: 'qwen',
    name: 'Qwen Code',
    bin: 'qwen',
    versionArgs: ['--version'],
    buildArgs: (prompt) => ['-p', prompt],
    streamFormat: 'plain',
  },
];

function resolveOnPath(bin) {
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
      : [''];
  const dirs = (process.env.PATH || '').split(delimiter);
  for (const dir of dirs) {
    for (const ext of exts) {
      const full = path.join(dir, bin + ext);
      if (full && existsSync(full)) return full;
    }
  }
  return null;
}

async function probe(def) {
  const resolved = resolveOnPath(def.bin);
  if (!resolved) return { ...stripFns(def), available: false };
  let version = null;
  try {
    const { stdout } = await execFileP(resolved, def.versionArgs, { timeout: 3000 });
    version = stdout.trim().split('\n')[0];
  } catch {
    // binary exists but --version failed; still mark available
  }
  // Probe `--help` once per agent and record which flags the installed CLI
  // advertises. Cached on `agentCapabilities` for buildArgs to consult.
  if (def.helpArgs && def.capabilityFlags) {
    const caps = {};
    try {
      const { stdout } = await execFileP(resolved, def.helpArgs, {
        timeout: 5000,
        maxBuffer: 4 * 1024 * 1024,
      });
      for (const [flag, key] of Object.entries(def.capabilityFlags)) {
        caps[key] = stdout.includes(flag);
      }
    } catch {
      // If --help fails, leave caps empty — buildArgs falls back to the safe
      // baseline (no optional flags).
    }
    agentCapabilities.set(def.id, caps);
  }
  return { ...stripFns(def), available: true, path: resolved, version };
}

function stripFns(def) {
  const { buildArgs, helpArgs, capabilityFlags, ...rest } = def;
  return rest;
}

export async function detectAgents() {
  return Promise.all(AGENT_DEFS.map(probe));
}

export function getAgentDef(id) {
  return AGENT_DEFS.find((a) => a.id === id) || null;
}
