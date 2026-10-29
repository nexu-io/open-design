import { createHash } from 'node:crypto';

import { readVelaCredentialRevision } from '../integrations/vela.js';

/**
 * Non-secret stamp naming the account + AMR environment that a locally
 * persisted choice was made under.
 *
 * A workspace id is only meaningful next to the credential it was resolved
 * with: Vela resolves membership as `findWorkspaceAndMember(workspaceId,
 * appUserId)`, so the same id carried into another account or another
 * environment resolves to no row at all. A local record that stores the id
 * without the identity is therefore not a preference — it is a value that can
 * silently outlive the only context in which it was valid.
 *
 * This reuses {@link readVelaCredentialRevision}, the credential fingerprint
 * the daemon already derives for cache partitioning, and keeps only the fields
 * that describe WHO and WHERE:
 *
 *  • `authSource` / `profile` — which AMR environment is in play, which is what
 *    `OPEN_DESIGN_AMR_PROFILE` flips between prod and test;
 *  • `loggedIn` / `userId` / `userEmail` — which signed-in account;
 *  • `credentialFingerprint` — a one-way hash of the configured keys and URLs,
 *    so a Settings-backed env swap that leaves `~/.amr/config.json` untouched
 *    still reads as a different identity.
 *
 * `configMtimeMs` is deliberately excluded. It is part of the cache revision
 * because a rewrite can change the plan/balance behind an unchanged account,
 * but it changes on bookkeeping writes that leave the identity alone. Folding
 * it in here would throw away a valid selection every time vela touched its own
 * config file — turning a correctness fix into a recurring annoyance.
 */
export function resolveWorkspaceSelectionIdentity(
  env: NodeJS.ProcessEnv = process.env,
  configuredEnv: Record<string, string> = {},
): string {
  const revision = readVelaCredentialRevision(env, configuredEnv);
  return createHash('sha256')
    .update(
      JSON.stringify([
        revision.authSource,
        revision.profile,
        revision.loggedIn,
        revision.userId,
        revision.userEmail,
        revision.credentialFingerprint,
      ]),
    )
    .digest('hex')
    .slice(0, 20);
}
