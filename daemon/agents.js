import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { delimiter } from 'node:path';
import path from 'node:path';

const execFileP = promisify(execFile);

// Each entry defines how to invoke the agent in non-interactive "one-shot" mode.
// `buildArgs(prompt, imagePaths)` returns argv for the child process.
// `streamFormat` hints to the daemon how to interpret stdout:
//   - 'claude-stream-json' : line-delimited JSON emitted by Claude Code's
//     `--output-format stream-json`. Daemon parses it into typed events
//     (text / thinking / tool_use / tool_result / status) for the UI.
//   - 'plain' (default)    : raw text, forwarded chunk-by-chunk.
//
// Permission posture: the daemon spawns each CLI with cwd pinned to the
// project folder (`.od/projects/<id>/`), and the web app has no terminal
// to surface an interactive approve/deny prompt. So every agent runs with
// its "auto-approve tools inside cwd" switch on — otherwise Write/Edit
// hangs or errors and the model has to hallucinate a permission button
// the UI never shows.
export const AGENT_DEFS = [
  {
    id: 'claude',
    name: 'Claude Code',
    bin: 'claude',
    versionArgs: ['--version'],
    buildArgs: (prompt) => [
      '-p',
      prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      // No interactive approval surface in the web UI; the daemon already
      // sandboxes the agent to the project's cwd, so let it write freely.
      '--permission-mode',
      'bypassPermissions',
    ],
    streamFormat: 'claude-stream-json',
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    bin: 'codex',
    versionArgs: ['--version'],
    // `--full-auto` = workspace-write sandbox + auto-approve, the closest
    // match to "trusted local daemon" without dropping the OS-level sandbox.
    buildArgs: (prompt) => ['exec', '--full-auto', prompt],
    streamFormat: 'plain',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    bin: 'gemini',
    versionArgs: ['--version'],
    buildArgs: (prompt) => ['--yolo', '-p', prompt],
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
    buildArgs: (prompt) => ['-p', '--force', prompt],
    streamFormat: 'plain',
  },
  {
    id: 'qwen',
    name: 'Qwen Code',
    bin: 'qwen',
    versionArgs: ['--version'],
    // Qwen Code is a Gemini-CLI fork and inherits the same `--yolo` switch.
    buildArgs: (prompt) => ['--yolo', '-p', prompt],
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
