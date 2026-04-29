import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { delimiter } from 'node:path';
import path from 'node:path';

const execFileP = promisify(execFile);

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
    buildArgs: (prompt, _imagePaths, extraAllowedDirs = []) => {
      const args = [
        '-p',
        prompt,
        '--output-format',
        'stream-json',
        '--verbose',
        '--include-partial-messages',
      ];
      const dirs = (extraAllowedDirs || []).filter(
        (d) => typeof d === 'string' && d.length > 0,
      );
      if (dirs.length > 0) {
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
  {
    id: 'copilot',
    name: 'GitHub Copilot CLI',
    bin: 'copilot',
    versionArgs: ['--version'],
    // `--allow-all-tools` is required for non-interactive runs: without it
    // the CLI blocks waiting for human approval on every tool call. Unlike
    // Codex (where `exec` is a dedicated headless subcommand with
    // auto-approve baked in) or Claude Code (which inherits its permission
    // policy from the user's settings.json), Copilot's `-p` mode always
    // prompts unless this flag is passed explicitly.
    //
    // `--output-format json` produces JSONL that copilot-stream.js parses
    // into the same typed events as claude-stream.js.
    //
    // `--add-dir` (repeatable, same flag as Claude Code's) widens Copilot's
    // path-level sandbox to skill seeds + design-system specs outside the
    // project cwd.
    buildArgs: (prompt, _imagePaths, extraAllowedDirs = []) => {
      const args = [
        '-p',
        prompt,
        '--allow-all-tools',
        '--output-format',
        'json',
      ];
      const dirs = (extraAllowedDirs || []).filter(
        (d) => typeof d === 'string' && d.length > 0,
      );
      for (const d of dirs) args.push('--add-dir', d);
      return args;
    },
    streamFormat: 'copilot-stream-json',
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
  return { ...stripFns(def), available: true, path: resolved, version };
}

function stripFns(def) {
  const { buildArgs, ...rest } = def;
  return rest;
}

export async function detectAgents() {
  return Promise.all(AGENT_DEFS.map(probe));
}

export function getAgentDef(id) {
  return AGENT_DEFS.find((a) => a.id === id) || null;
}
