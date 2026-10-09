import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runVelaCommand } from '../integrations/vela-command.js';
import type { VelaControlApiContext } from '../integrations/vela.js';

/** Recover only this protocol's private configs whose creator is definitely gone.
 * A reused PID, EPERM, legacy name or symlink is deliberately left alone. This
 * removes credentials, not any already-issued remote mutation or orphan process.
 */
export async function cleanupAbandonedPinnedVelaSessions(dataRoot: string): Promise<{ removed: number; failed: number }> {
  if (!path.isAbsolute(dataRoot)) throw new Error('absolute data root required');
  const result = { removed: 0, failed: 0 };
  for (const entry of await readdir(dataRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const match = /^vela-session-v1-([1-9][0-9]{0,9})-[A-Za-z0-9]{6}$/.exec(entry.name);
    if (!match) continue;
    const pid = Number(match[1]);
    if (pid > 2147483647) continue;
    let gone = false;
    try { process.kill(pid, 0); } catch (error) {
      gone = error instanceof Error && 'code' in error && error.code === 'ESRCH';
    }
    if (!gone) continue;
    try {
      await rm(path.join(dataRoot, entry.name), { recursive: true, force: true });
      result.removed++;
    } catch { result.failed++; }
  }
  return result;
}

export interface PinnedVelaCommandInput {
  args: string[];
  session: VelaControlApiContext;
  /** Resolved daemon data root, supplied by the composition root. No fallback. */
  dataRoot: string;
  workspaceId: string;
  configuredEnv?: Record<string, string>;
}

/** Isolate Go CLI profile loading from concurrent login/account changes.
 * Credentials are never command arguments. The runner settles only after its
 * child has exited (including timeout termination), then the config is removed.
 */
export async function runPinnedVelaCommand(
  input: PinnedVelaCommandInput,
  run: typeof runVelaCommand = runVelaCommand,
): Promise<string> {
  try {
    const { profile, apiUrl, controlKey } = input.session;
    const { dataRoot, workspaceId } = input;
    const args = [...input.args];
    const configuredEnv = { ...input.configuredEnv };
    if (!path.isAbsolute(dataRoot) || !workspaceId.trim() || !apiUrl.trim() || !controlKey.trim()
      || !['prod', 'test', 'feature-test', 'local'].includes(profile)) {
      throw new Error('missing pinned CLI context');
    }
    await cleanupAbandonedPinnedVelaSessions(dataRoot);
    const home = await mkdtemp(path.join(dataRoot, `vela-session-v1-${process.pid}-`));
    try {
      await writeFile(path.join(home, 'config.json'), JSON.stringify({
        profiles: { [profile]: { controlKey, apiUrl } },
      }), { mode: 0o600, flag: 'wx' });
      return await run(args, {
        configuredEnv: {
          ...configuredEnv,
          AMR_HOME: home,
          VELA_PROFILE: profile,
          VELA_API_URL: apiUrl,
          VELA_WORKSPACE_ID: workspaceId,
        },
        timeoutMs: 30_000,
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  } catch {
    throw new Error('VELA_PINNED_COMMAND_FAILED');
  }
}
