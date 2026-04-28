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
    // prompt delivered via stdin to avoid ENAMETOOLONG on Windows
    buildArgs: () => ['exec', '-'],
    promptViaStdin: true,
    streamFormat: 'plain',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    bin: 'gemini',
    versionArgs: ['--version'],
    // Gemini reads from stdin when -p is omitted and stdin is a pipe.
    // Passing the full composed prompt as a CLI arg causes ENAMETOOLONG
    // on Windows (CreateProcess limit ~32 KB) for any non-trivial prompt.
    buildArgs: () => [],
    promptViaStdin: true,
    streamFormat: 'plain',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    bin: 'opencode',
    versionArgs: ['--version'],
    buildArgs: () => ['run', '-'],
    promptViaStdin: true,
    streamFormat: 'plain',
  },
  {
    id: 'cursor-agent',
    name: 'Cursor Agent',
    bin: 'cursor-agent',
    versionArgs: ['--version'],
    buildArgs: () => ['-'],
    promptViaStdin: true,
    streamFormat: 'plain',
  },
  {
    id: 'qwen',
    name: 'Qwen Code',
    bin: 'qwen',
    versionArgs: ['--version'],
    buildArgs: () => ['-'],
    promptViaStdin: true,
    streamFormat: 'plain',
  },
];

export function resolveOnPath(bin) {
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
