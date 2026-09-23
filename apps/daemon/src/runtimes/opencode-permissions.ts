import { agentCapabilities } from './capabilities.js';
import type { RuntimeAgentDef } from './types.js';

// OpenCode 1.x accepted `--dangerously-skip-permissions` and `--dir`.
// OpenCode 2.x removed both: the non-interactive bypass is now `--auto`
// (`run --help` on v2.0.8) and the directory positional belongs only to
// the top-level command (`opencode [<directory>]`) — `run` has no such
// positional and would parse a trailing path as a message body. Workspace
// pinning therefore rides the spawn cwd alone (`agent-process.ts` passes
// `cwd: effectiveCwd`), verified on v2.0.8: a run spawned with cwd
// `/tmp/odgittest/sub` records exactly that directory in `session export`.
export const OPENCODE_SKIP_PERMISSIONS_FLAG = '--auto';

export const OPENCODE_PERMISSION_CAPABILITY = {
  helpArgs: ['run', '--help'],
  capabilityFlags: {
    [OPENCODE_SKIP_PERMISSIONS_FLAG]: 'skipPermissions',
    '--pure': 'isolatedRun',
  },
} satisfies Pick<RuntimeAgentDef, 'helpArgs' | 'capabilityFlags'>;

export function appendOpenCodePermissionBypass(args: string[], agentId: string): void {
  if (agentCapabilities.get(agentId)?.skipPermissions) {
    args.push(OPENCODE_SKIP_PERMISSIONS_FLAG);
  }
}

/**
 * Pin OpenCode's workspace to the resolved project directory.
 *
 * No-op since OpenCode 2.x removed the only argv mechanism (`--dir`) that
 * 1.x honored, and `run` has no directory positional — a trailing path is
 * parsed as a message body. Every chat and connection-test spawn already
 * passes the project directory as the child process cwd
 * (`agent-process.ts` → `cwd: effectiveCwd`, `connectionTest.ts` →
 * `cwd: tempDir`), and v2 resolves its session directory from it
 * (verified on v2.0.8: cwd `/tmp/odgittest/sub` → `session export`
 * records exactly that, even nested inside a git worktree).
 *
 * Kept as a named helper so call sites stay declarative; reintroduce argv
 * pinning here if a future CLI brings back an equivalent flag.
 */
export function appendOpenCodeWorkspaceDir(
  _args: string[],
  _cwd: string | null | undefined,
): void {}
