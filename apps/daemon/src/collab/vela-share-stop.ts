import type { runVelaCommand } from '../integrations/vela-command.js';

/** The runner must already be pinned to the verified workspace and session. */
export async function stopVelaShare(projectId: string, slug: string, run: typeof runVelaCommand): Promise<void> {
  try {
    const receipt: unknown = JSON.parse(await run(['share', 'stop', slug, '--project-id', projectId, '--json']));
    if (!receipt || typeof receipt !== 'object' || !('status' in receipt) || receipt.status !== 'stopped'
      || !('slug' in receipt) || receipt.slug !== slug || !('projectId' in receipt) || receipt.projectId !== projectId) {
      throw new Error('unconfirmed stop');
    }
  } catch { throw new Error('PUBLIC_FILE_STOP_FAILED'); }
}
