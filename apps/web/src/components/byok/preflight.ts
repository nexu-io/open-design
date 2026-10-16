import { isCustomByokBaseUrl } from '@open-design/contracts';
import type { TrackingByokPreflightBlockReason } from '@open-design/contracts/analytics';
import { KNOWN_PROVIDERS } from '../../state/config';
import type { AppConfig } from '../../types';
import { byokProviderRequiresApiKey } from '../../utils/byokProvider';
import { blockingByokDraftIssues, validateByokDraft } from './validation';

type ByokPreflightConfig = Pick<
  AppConfig,
  'apiKey' | 'apiProtocol' | 'apiProviderBaseUrl' | 'baseUrl' | 'model'
>;

function usesCustomByokEndpoint(config: ByokPreflightConfig): boolean {
  switch (config.apiProtocol) {
    case 'anthropic':
    case 'openai':
    case 'azure':
    case 'google':
    case 'ollama':
    case 'senseaudio':
    case 'aihubmix':
      return isCustomByokBaseUrl(config.apiProtocol, config.baseUrl);
    default:
      // Unset or non-BYOK protocol: no custom endpoint to trust.
      return false;
  }
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
  // `default` is the "Default (CLI config)" sentinel id -- but only for
  // built-in endpoints. A custom base URL names models deliberately
  // (gateway routers such as LiteLLM route behind a stable `default`
  // alias), so there the literal is a valid model choice. Same predicate
  // the daemon and the run builder use.
  if (config.model.trim().toLowerCase() === 'default' && !usesCustomByokEndpoint(config)) {
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
