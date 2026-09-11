import type { TrackingByokPreflightBlockReason } from '@open-design/contracts/analytics';
import { KNOWN_PROVIDERS } from '../../state/config';
import { orcaRouterAccountConnected } from '../../state/orcarouterAccount';
import type { AppConfig } from '../../types';
import { byokProviderRequiresApiKey } from '../../utils/byokProvider';
import { blockingByokDraftIssues, validateByokDraft } from './validation';

type ByokPreflightConfig = Pick<
  AppConfig,
  'apiKey' | 'apiProtocol' | 'apiProviderBaseUrl' | 'baseUrl' | 'model'
>;

/**
 * True when the credential this run needs is held by the daemon rather than by
 * the browser.
 *
 * Only OrcaRouter qualifies: neither of its acquisition paths has to put a key
 * in the config (the PKCE login never does, and the pasted key is mirrored into
 * the same daemon store). The secret stays server-side, so this reports
 * presence, not a value. For every other protocol the browser-held key remains
 * the only proof, and an unknown/absent status is NOT treated as configured —
 * a preflight that optimistically passes would let a keyless run reach the
 * daemon and fail there instead of being blocked with an actionable reason.
 */
function daemonHoldsByokCredential(protocol: AppConfig['apiProtocol']): boolean {
  if (protocol !== 'orcarouter') return false;
  return orcaRouterAccountConnected() === true;
}

export function byokPreflightBlockReason(
  config: ByokPreflightConfig,
): TrackingByokPreflightBlockReason | null {
  const protocol = config.apiProtocol ?? 'anthropic';
  const selectedProvider = KNOWN_PROVIDERS.find(
    (provider) =>
      provider.protocol === protocol &&
      provider.baseUrl === config.baseUrl &&
      (config.apiProviderBaseUrl == null || provider.baseUrl === config.apiProviderBaseUrl),
  );
  const validation = validateByokDraft(
    protocol,
    {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
    },
    {
      requiresApiKey: byokProviderRequiresApiKey(
        protocol,
        selectedProvider,
        config.baseUrl,
      ),
      credentialConfigured: daemonHoldsByokCredential(protocol),
    },
  );
  const missingReasons = new Set<TrackingByokPreflightBlockReason>();
  const invalidReasons = new Set<TrackingByokPreflightBlockReason>();
  for (const issue of blockingByokDraftIssues(validation)) {
    if (issue.field === 'api_key') {
      if (issue.code === 'api_key_required') {
        missingReasons.add('api_key_required');
      } else {
        invalidReasons.add('api_key_invalid');
      }
    } else if (issue.field === 'base_url') {
      if (issue.code === 'base_url_required') {
        missingReasons.add('base_url_required');
      } else {
        invalidReasons.add('base_url_invalid');
      }
    } else if (issue.field === 'model') {
      missingReasons.add('model_required');
    }
  }
  if (config.model.trim().toLowerCase() === 'default') {
    missingReasons.add('model_default');
  }
  // A missing activation field is the actionable run blocker even when a
  // second field also fails stricter Settings validation. This keeps the
  // event aligned with the run preflight instead of reporting, for example,
  // an unrelated key-shape warning alongside a missing model.
  const reasons = missingReasons.size > 0 ? missingReasons : invalidReasons;
  if (reasons.size === 0) return null;
  if (reasons.size > 1) return 'multiple';
  return reasons.values().next().value ?? 'config_invalid';
}
