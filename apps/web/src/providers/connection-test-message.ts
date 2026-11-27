import type { useT } from '../i18n';
import type { ConnectionTestResponse } from '../types';

type Translate = ReturnType<typeof useT>;

/**
 * Message for a failed agent-spawn connection test.
 *
 * Invariant: a known `errorCode` always renders localized copy; a missing or
 * unrecognised code (e.g. from a newer daemon) falls back to the generic
 * message carrying the daemon's English `detail`. Never throws.
 */
export function agentSpawnFailedMessage(
  t: Translate,
  result: ConnectionTestResponse,
  agentName: string,
): string {
  const code = result.errorCode;
  switch (code) {
    case 'opencode_zen_outdated_byok':
      return t('settings.testAgentZenOutdatedByok', { agentName });
    case 'opencode_zen_outdated_cli':
      return t('settings.testAgentZenOutdatedCli', { agentName });
    case undefined:
      break;
    default: {
      const unknownCode: never = code;
      void unknownCode;
    }
  }
  return t('settings.testAgentSpawn', {
    agentName,
    detail: result.detail ?? '',
  });
}
