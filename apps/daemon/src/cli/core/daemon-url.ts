// @ts-nocheck
/**
 * @module cli/core/daemon-url
 */
import { resolveDaemonUrl } from '../../daemon-url.js';

export async function cliDaemonUrl(flags) {
  return resolveDaemonUrl({ flagUrl: flags?.['daemon-url'] });
}

export async function cliDaemonBaseUrl(flags) {
  return (await cliDaemonUrl(flags)).replace(/\/$/, '');
}

export async function libraryDaemonUrl(flags) {
  return cliDaemonUrl(flags);
}
