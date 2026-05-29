import { basename } from 'node:path';

/**
 * Labels surfaced in chat status / diagnostics. Never expose resolved
 * executable paths — packaged installs leak app bundle roots and custom
 * home directories (issue #2874).
 */
export function userFacingAgentLabel(
  agentId: string | null | undefined,
  resolvedBin: string | null | undefined,
): string {
  const normalizedAgentId = typeof agentId === 'string' ? agentId.trim() : '';
  if (normalizedAgentId) return normalizedAgentId;

  if (typeof resolvedBin === 'string' && resolvedBin.trim()) {
    const base = basename(resolvedBin.trim().replace(/\\/g, '/')).replace(/\.(exe|cmd|bat)$/i, '');
    if (base) return base;
  }

  return 'agent';
}
