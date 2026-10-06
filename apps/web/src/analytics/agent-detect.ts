import { agentIdToTracking } from '@open-design/contracts/analytics';
import type { AgentInfo } from '@open-design/contracts';
import { trackAgentDetectDiagnostic, type Track } from './events';

/**
 * Report what agent detection found wrong, so a CLI someone installed and
 * cannot use is visible without them filing a report.
 *
 * Every diagnostic detection produces is worth reporting, not only blocking
 * ones: an `untested-version` warning across many installs is the signal that
 * our supported-version list has fallen behind what our own installer ships,
 * which is exactly how that goes unnoticed. `info` diagnostics are excluded —
 * they describe healthy states.
 *
 * Reported once per `(agent, reason, version)` per page session. Detection runs
 * on cold start and on every rescan, and a user staring at Settings would
 * otherwise inflate the count for one broken install into dozens of events.
 * Deduped, the number means "installs affected", which is the denominator any
 * decision here actually needs. The version is part of the key so a user who
 * upgrades a CLI and still fails is counted again.
 */
const reported = new Set<string>();

/** Drop the dedupe memory. Exported for tests; production sessions never reset. */
export function resetAgentDetectDiagnosticReporting(): void {
  reported.clear();
}

export function reportAgentDetectDiagnostics(
  track: Track,
  agents: readonly AgentInfo[],
): void {
  for (const agent of agents) {
    for (const diagnostic of agent.diagnostics ?? []) {
      if (diagnostic.severity === 'info') continue;
      const key = `${agent.id}|${diagnostic.reason}|${agent.version ?? ''}`;
      if (reported.has(key)) continue;
      reported.add(key);
      trackAgentDetectDiagnostic(track, {
        area: 'runtime_detection',
        cli_provider_id: agentIdToTracking(agent.id),
        reason: diagnostic.reason,
        severity: diagnostic.severity,
        agent_available: agent.available,
        has_path: Boolean(agent.path),
        ...(agent.version ? { agent_version: agent.version } : {}),
      });
    }
  }
}
