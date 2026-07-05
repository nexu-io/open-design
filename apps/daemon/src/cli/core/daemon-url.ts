// @ts-nocheck
/** @module cli/core/daemon-url
 * Resolves the daemon HTTP base every subcommand talks to, honoring the
 * `--daemon-url` flag over environment/config resolution (delegated to the
 * daemon-wide `resolveDaemonUrl`). Foundation kernel: imports no sibling.
 */
import { resolveDaemonUrl } from '../../daemon-url.js';

/**
 * Resolves the daemon URL for a parsed flag object, letting an explicit
 * `--daemon-url` override the ambient OD_DAEMON_URL/config resolution so
 * scripted callers can target a specific daemon instance.
 */
export async function cliDaemonUrl(flags) {
  return resolveDaemonUrl({ flagUrl: flags?.['daemon-url'] });
}

/**
 * Same as {@link cliDaemonUrl} but with any trailing slash stripped, so
 * callers can safely append `/api/...` route paths.
 */
export async function cliDaemonBaseUrl(flags) {
  return (await cliDaemonUrl(flags)).replace(/\/$/, '');
}

/**
 * Historical alias of {@link cliDaemonUrl} kept byte-identical through the
 * cli/ split; used by the library, system, and plugin domains. Candidate for
 * inlining in a follow-up (see README "Known limitations").
 */
export async function libraryDaemonUrl(flags) {
  return cliDaemonUrl(flags);
}
